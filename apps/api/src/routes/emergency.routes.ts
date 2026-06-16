/**
 * Emergency Routes — user-facing panic button trigger.
 *
 * POST /v1/emergency/trigger — user triggers an emergency on their active trip
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { emergencyEvents, trips } from '../db/schema';
import { broadcastEmergencyAlert, broadcastTripStatus } from '../services/websocket.service';

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
