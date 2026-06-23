/**
 * Scheduled Trip Routes — calendar/future trip management.
 *
 * POST   /v1/trips/scheduled        — create a scheduled trip
 * GET    /v1/trips/scheduled        — list user's scheduled trips
 * PATCH  /v1/trips/scheduled/:id   — update a scheduled trip
 * DELETE /v1/trips/scheduled/:id   — cancel a scheduled trip
 *
 * The scheduled trip captures the destination and a future date/time.
 * Origin is NOT stored — it will be detected fresh via GPS at start time.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, gte, lt } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { scheduledTrips } from '../db/schema';

const scheduledTripRoutes = new Hono();
// NOTE: do NOT add use('*', authMiddleware) here.
// This router is mounted at /trips alongside tripRoutes (which owns /:tripId).
// A wildcard middleware on a sub-router in Hono swallows every request whose
// path starts with /trips — even ones this router has no handler for — and
// returns 404 before Hono can fall through to the next mounted router.
// Instead, authMiddleware is applied per-route below.

// ── Validation schemas ─────────────────────────────────────────────────────

const DestinationSchema = z.object({
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});

const CreateScheduledTripSchema = z.object({
  destination: DestinationSchema,
  /** ISO 8601 datetime string — must be in the future. */
  scheduled_at: z.string().datetime().refine(
    (val) => new Date(val) > new Date(),
    { message: 'scheduled_at must be in the future' },
  ),
  label: z.string().max(255).optional(),
  transport_company: z.string().max(255).optional(),
  vehicle_type: z.string().max(100).optional(),
  vehicle_plate_number: z.string().max(50).optional(),
});

const UpdateScheduledTripSchema = CreateScheduledTripSchema.partial().extend({
  // Partial update — all fields optional.
  scheduled_at: z
    .string()
    .datetime()
    .refine((val) => new Date(val) > new Date(), {
      message: 'scheduled_at must be in the future',
    })
    .optional(),
});

const StatusFilterSchema = z.enum(['upcoming', 'missed', 'past', 'all']).default('upcoming');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a vehicle JSONB object from optional fields, or null if none provided.
 */
function buildVehicle(
  transport_company?: string,
  vehicle_type?: string,
  vehicle_plate_number?: string,
) {
  if (!transport_company && !vehicle_type && !vehicle_plate_number) return null;
  return {
    transport_company: transport_company ?? undefined,
    type: vehicle_type ?? undefined,
    plate_number: vehicle_plate_number ?? undefined,
  };
}

// ── POST /v1/trips/scheduled ───────────────────────────────────────────────

/**
 * Create a new scheduled trip.
 * Returns the created record with 201.
 */
scheduledTripRoutes.post(
  '/scheduled',
  authMiddleware,
  zValidator('json', CreateScheduledTripSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const data = c.req.valid('json');

    const [row] = await db
      .insert(scheduledTrips)
      .values({
        userId: user.sub,
        destination: {
          name: data.destination.name,
          lat: data.destination.lat,
          lng: data.destination.lng,
        },
        scheduledAt: new Date(data.scheduled_at),
        label: data.label ?? null,
        vehicle: buildVehicle(
          data.transport_company,
          data.vehicle_type,
          data.vehicle_plate_number,
        ),
        status: 'upcoming',
      })
      .returning();

    return c.json(row, 201);
  },
);

// ── GET /v1/trips/scheduled ────────────────────────────────────────────────

/**
 * List scheduled trips for the authenticated user.
 * Query param `status`: upcoming (default) | missed | past | all.
 *
 * - upcoming: status = 'upcoming' AND scheduled_at >= now
 * - missed:   status = 'missed'
 * - past:     status IN ('started', 'cancelled', 'missed')
 * - all:      no status filter
 */
scheduledTripRoutes.get(
  '/scheduled',
  authMiddleware,
  zValidator('query', z.object({ status: StatusFilterSchema })),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const { status } = c.req.valid('query');
    const now = new Date();

    let rows;

    if (status === 'upcoming') {
      rows = await db
        .select()
        .from(scheduledTrips)
        .where(
          and(
            eq(scheduledTrips.userId, user.sub),
            eq(scheduledTrips.status, 'upcoming'),
            gte(scheduledTrips.scheduledAt, now),
          ),
        )
        .orderBy(scheduledTrips.scheduledAt);
    } else if (status === 'missed') {
      rows = await db
        .select()
        .from(scheduledTrips)
        .where(
          and(
            eq(scheduledTrips.userId, user.sub),
            eq(scheduledTrips.status, 'missed'),
          ),
        )
        .orderBy(scheduledTrips.scheduledAt);
    } else if (status === 'past') {
      // Past = anything that is no longer upcoming (missed + started + cancelled)
      rows = await db
        .select()
        .from(scheduledTrips)
        .where(
          and(
            eq(scheduledTrips.userId, user.sub),
            lt(scheduledTrips.scheduledAt, now),
          ),
        )
        .orderBy(scheduledTrips.scheduledAt);
    } else {
      // all
      rows = await db
        .select()
        .from(scheduledTrips)
        .where(eq(scheduledTrips.userId, user.sub))
        .orderBy(scheduledTrips.scheduledAt);
    }

    return c.json(rows);
  },
);

// ── PATCH /v1/trips/scheduled/:id ─────────────────────────────────────────

/**
 * Update a scheduled trip.
 * Only the owner can update; only upcoming trips can be modified.
 */
scheduledTripRoutes.patch(
  '/scheduled/:id',
  authMiddleware,
  zValidator('json', UpdateScheduledTripSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const id = c.req.param('id');
    const data = c.req.valid('json');

    // Verify ownership and that the trip is still upcoming
    const [existing] = await db
      .select()
      .from(scheduledTrips)
      .where(and(eq(scheduledTrips.id, id), eq(scheduledTrips.userId, user.sub)));

    if (!existing) {
      return c.json({ error: { message: 'Scheduled trip not found' } }, 404);
    }
    if (existing.status !== 'upcoming') {
      return c.json({ error: { message: 'Only upcoming trips can be updated' } }, 409);
    }

    const updates: Partial<typeof scheduledTrips.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.destination) {
      updates.destination = {
        name: data.destination.name,
        lat: data.destination.lat,
        lng: data.destination.lng,
      };
    }
    if (data.scheduled_at) {
      updates.scheduledAt = new Date(data.scheduled_at);
    }
    if (data.label !== undefined) {
      updates.label = data.label ?? null;
    }
    if (
      data.transport_company !== undefined ||
      data.vehicle_type !== undefined ||
      data.vehicle_plate_number !== undefined
    ) {
      updates.vehicle = buildVehicle(
        data.transport_company ?? (existing.vehicle?.transport_company ?? undefined),
        data.vehicle_type ?? (existing.vehicle?.type ?? undefined),
        data.vehicle_plate_number ?? (existing.vehicle?.plate_number ?? undefined),
      );
    }

    const [updated] = await db
      .update(scheduledTrips)
      .set(updates)
      .where(eq(scheduledTrips.id, id))
      .returning();

    return c.json(updated);
  },
);

// ── DELETE /v1/trips/scheduled/:id ────────────────────────────────────────

/**
 * Cancel a scheduled trip (soft-cancel: sets status → cancelled).
 */
scheduledTripRoutes.delete('/scheduled/:id', authMiddleware, async (c) => {
  const user = c.get('user') as { sub: string };
  const id = c.req.param('id');

  const [existing] = await db
    .select()
    .from(scheduledTrips)
    .where(and(eq(scheduledTrips.id, id), eq(scheduledTrips.userId, user.sub)));

  if (!existing) {
    return c.json({ error: { message: 'Scheduled trip not found' } }, 404);
  }
  if (existing.status === 'cancelled') {
    return c.json({ error: { message: 'Trip is already cancelled' } }, 409);
  }

  const [updated] = await db
    .update(scheduledTrips)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(scheduledTrips.id, id))
    .returning();

  return c.json(updated);
});

export { scheduledTripRoutes };
