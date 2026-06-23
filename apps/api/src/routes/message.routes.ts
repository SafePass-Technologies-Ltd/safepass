/**
 * Message Routes — in-app messaging endpoints.
 *
 * /v1/trips/:tripId/messages   — User-facing message operations
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { desc, sql } from 'drizzle-orm';
import { MessageCreateSchema } from '@safepass/shared';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { messages, trips, users } from '../db/schema';
import { getTripById } from '../services/trip.service';
import {
  sendMessage,
  getTripMessages,
  markMessagesRead,
} from '../services/message.service';

const messageRoutes = new Hono();
messageRoutes.use('*', authMiddleware);

// ── Conversation-based endpoints (admin dashboard) ─────────────────────────

/**
 * GET /v1/messages/conversations
 * Admin-only: returns all trips that have at least one message, formatted as
 * conversations. The conversation id is the trip id.
 */
messageRoutes.get('/messages/conversations', async (c) => {
  const user = c.get('user') as { sub: string; role: string };
  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin) {
    return c.json({ error: { code: 403, message: 'Admins only' } }, 403);
  }

  // Trips that have at least one message, newest activity first.
  const rows = await db
    .selectDistinctOn([messages.tripId], {
      tripId: messages.tripId,
      lastContent: messages.content,
      lastAt: messages.createdAt,
      userId: trips.userId,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(messages)
    .innerJoin(trips, sql`${trips.id} = ${messages.tripId}`)
    .innerJoin(users, sql`${users.id} = ${trips.userId}`)
    .orderBy(messages.tripId, desc(messages.createdAt));

  const conversations = rows.map((r) => ({
    id: r.tripId,
    updatedAt: r.lastAt.toISOString(),
    lastMessage: { content: r.lastContent, createdAt: r.lastAt.toISOString() },
    participants: [{ id: r.userId, name: r.userName, email: r.userEmail }],
  }));

  return c.json({ conversations });
});

/**
 * GET /v1/messages/conversations/:tripId/messages
 * Admin-only: messages for a specific trip conversation.
 */
messageRoutes.get('/messages/conversations/:tripId/messages', async (c) => {
  const user = c.get('user') as { sub: string; role: string };
  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin) {
    return c.json({ error: { code: 403, message: 'Admins only' } }, 403);
  }

  const tripId = c.req.param('tripId');
  const msgs = await getTripMessages(tripId);
  return c.json({ messages: msgs.map((m) => ({ ...m, conversationId: m.tripId })) });
});

/**
 * POST /v1/messages
 * Admin-only: send a message to a trip conversation.
 * Body: { conversationId: string (= tripId), content: string }
 */
messageRoutes.post(
  '/messages',
  zValidator('json', z.object({ conversationId: z.string().uuid(), content: z.string().min(1) })),
  async (c) => {
    const user = c.get('user') as { sub: string; role: string };
    const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
    if (!isAdmin) {
      return c.json({ error: { code: 403, message: 'Admins only' } }, 403);
    }

    const { conversationId, content } = c.req.valid('json');
    const trip = await getTripById(conversationId);
    if (!trip) {
      return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
    }

    const message = await sendMessage({
      tripId: conversationId,
      senderId: user.sub,
      senderRole: 'monitoring_officer',
      content,
    });

    return c.json({ ...message, conversationId: message.tripId }, 201);
  }
);

// ── Trip-scoped endpoints (mobile app) ────────────────────────────────────

/**
 * GET /v1/trips/:tripId/messages
 * Get all messages for a trip (oldest first).
 */
messageRoutes.get('/trips/:tripId/messages', async (c) => {
  const user = c.get('user') as { sub: string; role: string };
  const tripId = c.req.param('tripId');

  // Verify the trip exists and belongs to the user (or user is admin).
  const trip = await getTripById(tripId);
  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }

  // Authorization: user can only see their own trip's messages.
  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && trip.userId !== user.sub) {
    return c.json(
      { error: { code: 403, message: 'Access denied' } },
      403
    );
  }

  const msgs = await getTripMessages(tripId);
  return c.json({ messages: msgs }, 200);
});

/**
 * POST /v1/trips/:tripId/messages
 * Send a message within a trip.
 */
messageRoutes.post(
  '/trips/:tripId/messages',
  zValidator('json', MessageCreateSchema),
  async (c) => {
    const user = c.get('user') as { sub: string; role: string };
    const tripId = c.req.param('tripId');
    const data = c.req.valid('json');

    // Verify trip exists.
    const trip = await getTripById(tripId);
    if (!trip) {
      return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
    }

    // Authorization.
    const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
    if (!isAdmin && trip.userId !== user.sub) {
      return c.json(
        { error: { code: 403, message: 'Access denied' } },
        403
      );
    }

    // Determine sender role.
    const senderRole = isAdmin ? 'monitoring_officer' as const : 'user' as const;

    const message = await sendMessage({
      tripId,
      senderId: user.sub,
      senderRole,
      content: data.content,
      messageType: data.messageType,
    });

    return c.json(message, 201);
  }
);

/**
 * POST /v1/trips/:tripId/messages/read
 * Mark all messages in a trip as read.
 */
messageRoutes.post('/trips/:tripId/messages/read', async (c) => {
  const user = c.get('user') as { sub: string; role: string };
  const tripId = c.req.param('tripId');

  const trip = await getTripById(tripId);
  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }

  const isAdmin = ['admin', 'monitoring_officer', 'super_admin'].includes(user.role);
  if (!isAdmin && trip.userId !== user.sub) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const readByRole = isAdmin ? 'monitoring_officer' as const : 'user' as const;
  await markMessagesRead(tripId, readByRole);

  return c.json({ status: 'ok' }, 200);
});

export { messageRoutes };
