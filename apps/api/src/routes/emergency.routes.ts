/**
 * Emergency Routes — user-facing panic button trigger.
 *
 * POST /v1/emergency/trigger    — user triggers an emergency on their active trip
 * POST /v1/emergency/:id/audio  — upload a silent background audio recording
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { emergencyEvents, trips } from '../db/schema';
import { broadcastEmergencyAlert, broadcastTripStatus } from '../services/websocket.service';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Local disk storage for emergency audio recordings. Matches the same
// placeholder pattern used by document uploads (see document.routes.ts) —
// a TODO marks where an S3/GCS backend should replace this once available.
const AUDIO_UPLOAD_DIR = resolve(__dirname, '../../uploads/emergency-audio');

const EmergencyTriggerSchema = z.object({
  tripId: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number().optional(),
});

const emergencyTriggerRoutes = new Hono();
emergencyTriggerRoutes.use('*', authMiddleware);

/**
 * POST /v1/emergency/trigger
 *
 * User presses the panic button during an active trip.
 * Creates an emergency event, flags the trip as EMERGENCY,
 * and broadcasts alerts to all connected monitoring officers.
 */
emergencyTriggerRoutes.post(
  '/trigger',
  zValidator('json', EmergencyTriggerSchema),
  async (c) => {
    const user = c.get('user') as { sub: string; role: string };
    const { tripId, latitude, longitude, speed } = c.req.valid('json');

    // Verify the trip exists and belongs to the user.
    const trip = await db.query.trips.findFirst({
      where: eq(trips.id, tripId),
    });

    if (!trip) {
      return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
    }

    if (trip.userId !== user.sub) {
      return c.json(
        { error: { code: 403, message: 'Access denied — not your trip' } },
        403
      );
    }

    // Only create emergency for trips that are currently being monitored.
    const activeStatuses = ['active', 'delayed'];
    if (!activeStatuses.includes(trip.status)) {
      return c.json(
        {
          error: {
            code: 422,
            message: `Cannot trigger emergency on a trip with status '${trip.status}'`,
          },
        },
        422
      );
    }

    // Create the emergency event and update trip status in a transaction.
    const [event] = await db.transaction(async (tx) => {
      // Mark trip as emergency.
      await tx
        .update(trips)
        .set({ status: 'emergency', updatedAt: new Date() })
        .where(eq(trips.id, tripId));

      // Create the emergency event record.
      const [emergency] = await tx
        .insert(emergencyEvents)
        .values({
          id: uuidv4(),
          tripId,
          triggerType: 'panic_button',
          status: 'active',
          latitude,
          longitude,
          speed: speed ?? null,
          locationTimestamp: new Date(),
          audioRecordingUrls: [],
          videoRecordingUrls: [],
          emergencyContactNotified: false,
        })
        .returning();

      return [emergency];
    });

    // Broadcast alerts to all connected monitoring officers.
    broadcastTripStatus(tripId, 'emergency');
    broadcastEmergencyAlert(tripId);

    return c.json(event, 201);
  }
);

/**
 * POST /v1/emergency/:id/audio  (multipart/form-data)
 *
 * Uploads a silent background audio recording captured during an active
 * emergency session (panic button press to check-in). The file is stored
 * on local disk and its URL is appended to the emergency event's
 * `audioRecordingUrls` array.
 *
 * Expected fields:
 *   file  File  required  (m4a/aac audio)
 */
emergencyTriggerRoutes.post('/:id/audio', async (c) => {
  const user = c.get('user') as { sub: string };
  const id = c.req.param('id');

  const event = await db.query.emergencyEvents.findFirst({
    where: eq(emergencyEvents.id, id),
  });

  if (!event) {
    return c.json({ error: { code: 404, message: 'Emergency event not found' } }, 404);
  }

  const trip = await db.query.trips.findFirst({ where: eq(trips.id, event.tripId) });
  if (!trip || trip.userId !== user.sub) {
    return c.json({ error: { code: 403, message: 'Access denied — not your emergency' } }, 403);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: 400, message: 'Request must be multipart/form-data' } }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return c.json({ error: { code: 400, message: 'file is required' } }, 400);
  }

  // TODO: pipe `file` to a storage backend (S3/GCS) instead of local disk
  // once available, matching the same deferred approach as document uploads.
  await mkdir(AUDIO_UPLOAD_DIR, { recursive: true });
  const safeFileName = `${id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = resolve(AUDIO_UPLOAD_DIR, safeFileName);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const fileUrl = `/uploads/emergency-audio/${safeFileName}`;

  const [updated] = await db
    .update(emergencyEvents)
    .set({
      audioRecordingUrls: sql`${emergencyEvents.audioRecordingUrls} || ${JSON.stringify([fileUrl])}::jsonb`,
    })
    .where(eq(emergencyEvents.id, id))
    .returning();

  return c.json({ emergencyEventId: id, audioRecordingUrls: updated.audioRecordingUrls }, 201);
});

/**
 * POST /v1/emergency/:tripId/check-in
 *
 * User confirms they are safe, resolving their own active emergency.
 * Marks the emergency event as a false alarm and restores the trip to
 * 'active' status.
 */
emergencyTriggerRoutes.post('/:tripId/check-in', async (c) => {
  const user = c.get('user') as { sub: string };
  const tripId = c.req.param('tripId');

  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }
  if (trip.userId !== user.sub) {
    return c.json({ error: { code: 403, message: 'Access denied — not your trip' } }, 403);
  }

  const activeEmergency = await db.query.emergencyEvents.findFirst({
    where: and(eq(emergencyEvents.tripId, tripId), eq(emergencyEvents.status, 'active')),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  });

  if (!activeEmergency) {
    return c.json({ error: { code: 404, message: 'No active emergency for this trip' } }, 404);
  }

  const [resolved] = await db.transaction(async (tx) => {
    await tx
      .update(trips)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(trips.id, tripId));

    const [event] = await tx
      .update(emergencyEvents)
      .set({ status: 'resolved_false_alarm' })
      .where(eq(emergencyEvents.id, activeEmergency.id))
      .returning();

    return [event];
  });

  broadcastTripStatus(tripId, 'active');

  return c.json(resolved);
});

/**
 * GET /v1/emergency/alerts
 *
 * Org-scoped active emergency alerts for corporate/transport dashboard users.
 * Returns active emergency events for trips belonging to the caller's org.
 */
emergencyTriggerRoutes.get('/alerts', async (c) => {
  const user = c.get('user') as { sub: string; orgId?: string };
  const status = c.req.query('status') ?? 'active';
  const limit = parseInt(c.req.query('limit') ?? '50', 10);

  // Get all trips for this org (or user if no orgId)
  const orgTrips = await db.query.trips.findMany({
    where: user.orgId
      ? eq(trips.organizationId, user.orgId)
      : eq(trips.userId, user.sub),
    columns: { id: true },
  });

  if (orgTrips.length === 0) return c.json({ alerts: [] });

  const tripIds = orgTrips.map((t) => t.id);
  const validStatuses = ['active', 'acknowledged', 'escalated', 'resolved_false_alarm', 'resolved_incident'];
  const safeStatus = validStatuses.includes(status) ? status : 'active';

  const alerts = await db.query.emergencyEvents.findMany({
    where: and(
      inArray(emergencyEvents.tripId, tripIds),
      eq(emergencyEvents.status, safeStatus as typeof emergencyEvents.$inferSelect['status'])
    ),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
    limit,
  });

  return c.json({ alerts });
});

export { emergencyTriggerRoutes };
