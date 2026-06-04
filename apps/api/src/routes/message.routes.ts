/**
 * Message Routes — in-app messaging endpoints.
 *
 * /v1/trips/:tripId/messages   — User-facing message operations
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { MessageCreateSchema } from '@safepass/shared';
import { authMiddleware } from '../middleware/auth';
import { getTripById } from '../services/trip.service';
import {
  sendMessage,
  getTripMessages,
  markMessagesRead,
} from '../services/message.service';

const messageRoutes = new Hono();
messageRoutes.use('*', authMiddleware);

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
