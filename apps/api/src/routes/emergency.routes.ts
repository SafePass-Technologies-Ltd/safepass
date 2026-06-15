/**
 * Emergency Routes — user-facing panic button trigger.
 *
 * POST /v1/emergency/trigger — user triggers an emergency on their active trip
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
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

export { emergencyTriggerRoutes };
