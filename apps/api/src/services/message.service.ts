/**
 * Message Service — in-app messaging between users and monitoring officers.
 *
 * Messages are scoped to a trip context. The sender's role determines
 * visibility and routing (user ↔ monitoring_officer).
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, ne } from 'drizzle-orm';
import { db } from '../db';
import { messages, trips } from '../db/schema';
import { broadcastNewMessage } from './websocket.service';
import { sendPushToUser, sendPushToRole } from './push.service';
import { isActiveStatus } from './trip.service';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SendMessageInput {
  tripId: string;
  senderId: string;
  senderRole: 'user' | 'admin' | 'monitoring_officer' | 'system';
  content: string;
  messageType?: 'text' | 'check_in' | 'alert' | 'system';
}

// ────────────────────────────────────────────────────────────
// Send message
// ────────────────────────────────────────────────────────────

/**
 * Send a message within a trip context.
 *
 * Validates that the trip exists and is active (messages can only be
 * sent during active/delayed/emergency/escalated trips).
 */
export async function sendMessage(
  input: SendMessageInput
): Promise<typeof messages.$inferSelect> {
  // Verify trip exists.
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, input.tripId),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  // Guard: messaging only makes sense while a trip is still being monitored.
  // A cancelled/completed trip is terminal (no further ALLOWED_TRANSITIONS
  // out of it in trip.service.ts) so there is nothing left to communicate
  // about -- reject with the same 422 convention used elsewhere for
  // invalid-state actions (see updateGpsPosition).
  if (!isActiveStatus(trip.status)) {
    throw Object.assign(
      new Error(`Cannot send a message on a trip with status '${trip.status}'`),
      { statusCode: 422 }
    );
  }

  const [message] = await db
    .insert(messages)
    .values({
      id: uuidv4(),
      tripId: input.tripId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      content: input.content,
      messageType: input.messageType ?? 'text',
      isRead: false,
    })
    .returning();

  // Broadcast the new message to all WebSocket clients subscribed to this trip.
  broadcastNewMessage(input.tripId, {
    id: message.id,
    senderId: message.senderId,
    senderRole: message.senderRole,
    content: message.content,
    messageType: message.messageType,
    createdAt: message.createdAt.toISOString(),
  });

  // Send push notification to the other party.
  // Non-fatal: push failure must never block message delivery.
  _sendMessagePush(input.tripId, message).catch((err) => {
    console.error('[message.service] Push notification failed:', err);
  });

  return message;
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * Get all messages for a trip, ordered by creation time (oldest first).
 * The caller is responsible for authorization (user can only see their own
 * trip's messages, admin can see any trip's messages).
 */
export async function getTripMessages(
  tripId: string,
  limit = 100
): Promise<typeof messages.$inferSelect[]> {
  return db.query.messages.findMany({
    where: eq(messages.tripId, tripId),
    orderBy: messages.createdAt,
    limit,
  });
}

/**
 * Mark messages in a trip as read for a specific recipient role.
 *
 * Only marks messages where senderRole != readByRole, i.e. messages that
 * were NOT sent by the reader. This prevents marking your own outbound
 * messages as "read" from your own perspective.
 *
 * @param tripId     - UUID of the trip whose messages should be marked read.
 * @param readByRole - The role of the person opening the conversation.
 */
export async function markMessagesRead(
  tripId: string,
  readByRole: 'user' | 'admin' | 'monitoring_officer'
): Promise<void> {
  await db
    .update(messages)
    .set({ isRead: true })
    .where(
      and(
        eq(messages.tripId, tripId),
        eq(messages.isRead, false),
        // Only mark messages sent by someone other than the reader.
        ne(messages.senderRole, readByRole)
      )
    );
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * Determine the push notification recipient and send.
 *
 * - User sent the message → notify monitoring_officer role.
 * - Officer / admin sent → notify the trip's traveller.
 */
async function _sendMessagePush(
  tripId: string,
  message: typeof messages.$inferSelect
): Promise<void> {
  if (message.senderRole === 'user') {
    await sendPushToRole(
      'monitoring_officer',
      'New message from traveller',
      message.content,
      { tripId, type: 'new_message' }
    );
  } else {
    // Look up the trip's userId so we can target the traveller directly.
    const trip = await db.query.trips.findFirst({
      where: eq(trips.id, tripId),
      columns: { userId: true },
    });
    if (trip) {
      await sendPushToUser(
        trip.userId,
        'Message from monitoring officer',
        message.content,
        { tripId, type: 'new_message' }
      );
    }
  }
}
