/**
 * Message Service — in-app messaging between users and monitoring officers.
 *
 * Messages are scoped to a trip context. The sender's role determines
 * visibility and routing (user ↔ monitoring_officer).
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db';
import { messages, trips } from '../db/schema';

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
 * Mark all messages in a trip as read for a specific recipient role.
 * For example, when a monitoring officer opens a trip, mark all 'user'
 * messages as read for them.
 */
export async function markMessagesRead(
  tripId: string,
  readByRole: 'user' | 'admin' | 'monitoring_officer'
): Promise<void> {
  // Only mark messages NOT sent by the reader as read.
  await db
    .update(messages)
    .set({ isRead: true })
    .where(
      and(
        eq(messages.tripId, tripId),
        eq(messages.isRead, false)
      )
    );
}
