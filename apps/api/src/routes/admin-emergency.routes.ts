/**
 * Admin Emergency Routes — emergency events, escalations, and check-ins.
 *
 * /v1/admin/emergencies     — List + manage emergency events
 * /v1/admin/escalations     — List + manage escalations
 * /v1/admin/checkins        — List + create check-ins
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../middleware/auth';
import { db } from '../db';
import {
  emergencyEvents,
  escalations,
  checkIns,
  trips,
  messages,
} from '../db/schema';
import { sendMessage } from '../services/message.service';
import { sendPushToUser } from '../services/push.service';
import { broadcastTripStatus } from '../services/websocket.service';
import { isS3EvidenceConfigured, getEvidencePlaybackUrl } from '../services/s3.service';

// ────────────────────────────────────────────────────────────
// Emergency Events
// ────────────────────────────────────────────────────────────

const emergencyRoutes = new Hono();
emergencyRoutes.use('*', authMiddleware);
emergencyRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/emergencies
 * List all emergency events with optional filters.
 * Query: ?tripId=&status=&limit=&offset=
 */
emergencyRoutes.get('/', async (c) => {
  const tripId = c.req.query('tripId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const conditions = [];
  if (tripId) conditions.push(eq(emergencyEvents.tripId, tripId));

  const validStatuses = ['active', 'acknowledged', 'escalated', 'resolved_false_alarm', 'resolved_incident'];
  if (status && validStatuses.includes(status)) {
    conditions.push(eq(emergencyEvents.status, status as typeof emergencyEvents.$inferSelect['status']));
  }

  const events = await db.query.emergencyEvents.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(emergencyEvents.createdAt),
    limit,
    offset,
  });

  return c.json({ emergencies: events });
});

/**
 * GET /v1/admin/emergencies/:id
 */
emergencyRoutes.get('/:id', async (c) => {
  const event = await db.query.emergencyEvents.findFirst({
    where: eq(emergencyEvents.id, c.req.param('id')),
  });

  if (!event) {
    return c.json({ error: { code: 404, message: 'Emergency event not found' } }, 404);
  }

  return c.json(event);
});

/**
 * GET /v1/admin/emergencies/:id/audio/url?key=<recording key>
 *
 * Generates a short-lived (10 minute) presigned S3 GET URL so an authorized
 * monitoring officer can play back a private evidence recording. `key` must
 * be one of the event's own `audioRecordingUrls` entries — this endpoint
 * deliberately does not accept an arbitrary S3 key, so a caller can't use
 * it to sign URLs for other emergency events' evidence.
 *
 * Falls back to a 404 in local development (no S3 bucket configured) —
 * local-disk recordings are already served directly as static file URLs
 * under /uploads/emergency-audio/, so no signed URL is needed there.
 */
emergencyRoutes.get('/:id/audio/url', async (c) => {
  const id = c.req.param('id');
  const key = c.req.query('key');

  if (!key) {
    return c.json({ error: { code: 400, message: 'key query parameter is required' } }, 400);
  }

  if (!isS3EvidenceConfigured()) {
    return c.json(
      { error: { code: 404, message: 'S3 evidence storage is not configured in this environment' } },
      404
    );
  }

  const event = await db.query.emergencyEvents.findFirst({
    where: eq(emergencyEvents.id, id),
  });

  if (!event) {
    return c.json({ error: { code: 404, message: 'Emergency event not found' } }, 404);
  }

  if (!event.audioRecordingUrls?.includes(key)) {
    return c.json({ error: { code: 404, message: 'Recording not found on this emergency event' } }, 404);
  }

  const url = await getEvidencePlaybackUrl(key);
  return c.json({ url, expiresInSeconds: 600 });
});

/**
 * PATCH /v1/admin/emergencies/:id
 * Update emergency event status and resolution.
 */
const EmergencyUpdateSchema = z.object({
  status: z.enum(['active', 'acknowledged', 'escalated', 'resolved_false_alarm', 'resolved_incident']).optional(),
  officerId: z.string().uuid().optional(),
  resolutionNotes: z.string().optional(),
});

emergencyRoutes.patch('/:id', zValidator('json', EmergencyUpdateSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const event = await db.query.emergencyEvents.findFirst({
    where: eq(emergencyEvents.id, id),
  });

  if (!event) {
    return c.json({ error: { code: 404, message: 'Emergency event not found' } }, 404);
  }

  const [updated] = await db
    .update(emergencyEvents)
    .set({
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.officerId !== undefined ? { officerId: data.officerId } : {}),
      ...(data.resolutionNotes !== undefined ? { resolutionNotes: data.resolutionNotes } : {}),
      ...(data.status === 'resolved_false_alarm' || data.status === 'resolved_incident'
        ? { resolvedAt: new Date() }
        : {}),
    })
    .where(eq(emergencyEvents.id, id))
    .returning();

  return c.json(updated);
});

// ────────────────────────────────────────────────────────────
// Escalations
// ────────────────────────────────────────────────────────────

const escalationRoutes = new Hono();
escalationRoutes.use('*', authMiddleware);
escalationRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/escalations
 * List all escalations with optional filters.
 */
escalationRoutes.get('/', async (c) => {
  const tripId = c.req.query('tripId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const conditions = [];
  if (tripId) conditions.push(eq(escalations.tripId, tripId));

  const validStatuses = ['pending', 'acknowledged', 'in_progress', 'resolved', 'closed'];
  if (status && validStatuses.includes(status)) {
    conditions.push(eq(escalations.status, status as typeof escalations.$inferSelect['status']));
  }

  const results = await db.query.escalations.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(escalations.createdAt),
    limit,
    offset,
  });

  return c.json({ escalations: results });
});

/**
 * POST /v1/admin/escalations
 * Create a new escalation for a trip.
 */
const EscalationCreateSchema = z.object({
  tripId: z.string().uuid(),
  emergencyEventId: z.string().uuid().optional(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

escalationRoutes.post('/', zValidator('json', EscalationCreateSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const [escalation] = await db
    .insert(escalations)
    .values({
      id: uuidv4(),
      tripId: data.tripId,
      emergencyEventId: data.emergencyEventId ?? null,
      escalatedBy: user.sub,
      reason: data.reason,
      notes: data.notes ?? null,
      status: 'pending',
    })
    .returning();

  // Update the trip status to escalated if it isn't already.
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, data.tripId),
  });
  if (trip && trip.status !== 'escalated') {
    await db
      .update(trips)
      .set({ status: 'escalated', updatedAt: new Date() })
      .where(eq(trips.id, data.tripId));
  }

  return c.json(escalation, 201);
});

/**
 * PATCH /v1/admin/escalations/:id
 * Update escalation status.
 */
const EscalationUpdateSchema = z.object({
  status: z.enum(['pending', 'acknowledged', 'in_progress', 'resolved', 'closed']),
  resolutionNotes: z.string().optional(),
});

escalationRoutes.patch('/:id', zValidator('json', EscalationUpdateSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { status, resolutionNotes } = c.req.valid('json');

  const escalation = await db.query.escalations.findFirst({
    where: eq(escalations.id, id),
  });

  if (!escalation) {
    return c.json({ error: { code: 404, message: 'Escalation not found' } }, 404);
  }

  const [updated] = await db
    .update(escalations)
    .set({
      status,
      ...(resolutionNotes !== undefined ? { resolutionNotes } : {}),
      ...(status === 'resolved' || status === 'closed'
        ? { resolvedAt: new Date(), resolvedBy: user.sub }
        : {}),
    })
    .where(eq(escalations.id, id))
    .returning();

  return c.json(updated);
});

// ────────────────────────────────────────────────────────────
// Check-Ins
// ────────────────────────────────────────────────────────────

const checkinRoutes = new Hono();
checkinRoutes.use('*', authMiddleware);
checkinRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/checkins
 * List all check-ins with optional trip filter.
 */
checkinRoutes.get('/', async (c) => {
  const tripId = c.req.query('tripId');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const where = tripId ? eq(checkIns.tripId, tripId) : undefined;

  const results = await db.query.checkIns.findMany({
    where,
    orderBy: desc(checkIns.createdAt),
    limit,
    offset,
  });

  return c.json({ checkins: results });
});

/**
 * POST /v1/admin/checkins
 * Log a check-in attempt with a trip user.
 */
const CheckInCreateSchema = z.object({
  tripId: z.string().uuid(),
  method: z.enum(['message', 'call', 'sms']),
  responseStatus: z.enum(['pending', 'confirmed_safe', 'no_response', 'concern_raised']),
  notes: z.string().optional(),
});

checkinRoutes.post('/', zValidator('json', CheckInCreateSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  const [checkin] = await db
    .insert(checkIns)
    .values({
      id: uuidv4(),
      tripId: data.tripId,
      officerId: user.sub,
      method: data.method,
      responseStatus: data.responseStatus,
      notes: data.notes ?? null,
    })
    .returning();

  // When the check-in method is 'message', create a Message record so the
  // traveller sees the officer's contact attempt inside the chat thread.
  if (data.method === 'message') {
    // Look up the trip owner so we can push-notify them.
    const trip = await db.query.trips.findFirst({
      where: eq(trips.id, data.tripId),
      columns: { userId: true },
    });

    // Create message in the trip thread — visible to both parties.
    // Non-fatal: message/push failures must not block check-in creation.
    const messageContent =
      data.notes?.trim() || 'Monitoring check-in: Are you okay?';

    sendMessage({
      tripId: data.tripId,
      senderId: user.sub,
      senderRole: 'monitoring_officer',
      content: messageContent,
      messageType: 'check_in',
    })
      .then(() => {
        if (trip) {
          return sendPushToUser(
            trip.userId,
            'Monitoring Check-in',
            'Your officer sent you a message',
            { tripId: data.tripId, type: 'check_in' }
          );
        }
      })
      .catch((err) => {
        console.error('[checkin] message/push failed:', err);
      });
  }

  return c.json(checkin, 201);
});

/**
 * PATCH /v1/admin/checkins/:id
 * Update check-in response status and optional notes.
 * Broadcasts a WebSocket trip_status event so the dashboard reflects changes.
 */
const CheckInUpdateSchema = z.object({
  responseStatus: z.enum([
    'pending',
    'confirmed_safe',
    'no_response',
    'concern_raised',
  ]),
  notes: z.string().optional(),
});

checkinRoutes.patch('/:id', zValidator('json', CheckInUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const { responseStatus, notes } = c.req.valid('json');

  const existing = await db.query.checkIns.findFirst({
    where: eq(checkIns.id, id),
  });

  if (!existing) {
    return c.json({ error: { code: 404, message: 'Check-in not found' } }, 404);
  }

  const [updated] = await db
    .update(checkIns)
    .set({
      responseStatus,
      ...(notes !== undefined ? { notes } : {}),
    })
    .where(eq(checkIns.id, id))
    .returning();

  // Broadcast a generic trip_status update so dashboard clients know to refresh.
  broadcastTripStatus(existing.tripId, 'checkin_updated');

  return c.json(updated, 200);
});

// ────────────────────────────────────────────────────────────
// Admin Messages
// ────────────────────────────────────────────────────────────

const adminMessageRoutes = new Hono();
adminMessageRoutes.use('*', authMiddleware);
adminMessageRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/messages/unread-count
 * Returns the total count of unread messages sent by users across all active
 * trips. Used as the notification badge count on the dashboard overview page.
 */
adminMessageRoutes.get('/unread-count', async (c) => {
  // Count messages from travellers (senderRole = 'user') that have not yet
  // been read, irrespective of which trip they belong to.
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.senderRole, 'user'),
        eq(messages.isRead, false)
      )
    );

  return c.json({ count: rows.length }, 200);
});

export { emergencyRoutes, escalationRoutes, checkinRoutes, adminMessageRoutes };
