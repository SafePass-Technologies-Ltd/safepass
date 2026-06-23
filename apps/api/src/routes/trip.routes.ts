/**
 * Trip Routes — full trip lifecycle endpoints.
 *
 * /v1/trips              — User-facing trip CRUD + GPS updates
 * /v1/admin/trips         — Admin trip oversight (Week 2-3)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { TripCreateSchema, TripStartSchema, TripGpsUpdateSchema } from '@safepass/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getAllTripLocations, type TripLocationRecord } from '../services/dynamo.service';
import {
  createTrip,
  startTrip,
  updateGpsPosition,
  completeTrip,
  cancelTrip,
  getUserTrips,
  getOrgTrips,
  getTripById,
  getActiveTrips,
  adminUpdateTripStatus,
  createTripTagInvite,
  acceptTripTagInvite,
  updateTripVehicleFields,
} from '../services/trip.service';

// ────────────────────────────────────────────────────────────
// User-facing trip routes
// ────────────────────────────────────────────────────────────

const tripRoutes = new Hono();
tripRoutes.use('*', authMiddleware);

/**
 * POST /v1/trips
 * Create a new trip (always starts as 'draft').
 * Use POST /v1/trips/start to begin monitoring.
 */
tripRoutes.post('/', zValidator('json', TripCreateSchema), async (c) => {
  const user = c.get('user') as { sub: string; role: string; orgId?: string };
  const data = c.req.valid('json');

  const trip = await createTrip({
    ...data,
    userId: user.sub,
    callerRole: user.role,
    // Prefer the orgId from the JWT (set by auth service at login) so
    // transport_partner auto-population can resolve the org name.
    organizationId: data.organizationId ?? user.orgId,
  });
  return c.json(trip, 201);
});

/**
 * POST /v1/trips/start
 * Start monitoring a trip: draft → active + wallet deduction.
 */
tripRoutes.post('/start', zValidator('json', TripStartSchema), async (c) => {
  const user = c.get('user') as { sub: string };
  const { tripId } = c.req.valid('json');

  try {
    const trip = await startTrip(tripId, user.sub);
    return c.json(trip, 200);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 402) {
        return c.json({ error: { code: 402, message: err.message } }, 402);
      }
      if (code === 400) {
        return c.json({ error: { code: 400, message: err.message } }, 400);
      }
      if (code === 404) {
        return c.json({ error: { code: 404, message: err.message } }, 404);
      }
      if (code === 422) {
        return c.json({ error: { code: 422, message: err.message } }, 422);
      }
    }
    throw err;
  }
});

/**
 * GET /v1/trips
 * List trips visible to the authenticated caller.
 *
 * - Dashboard users (JWT contains orgId): returns all trips belonging to that
 *   organisation so transport/corporate dashboards see their full fleet.
 * - Mobile users (no orgId): returns only the caller's own trips.
 *
 * Supports optional ?status= query param (comma-separated for multiple values).
 */
tripRoutes.get('/', async (c) => {
  const user = c.get('user') as { sub: string; orgId?: string };
  const statusParam = c.req.query('status');

  // Support comma-separated statuses: ?status=active,delayed
  const status = statusParam ? statusParam.split(',') : undefined;

  const result = user.orgId
    ? await getOrgTrips(user.orgId, { status })
    : await getUserTrips(user.sub, { status });

  return c.json({ trips: result }, 200);
});

/**
 * GET /v1/trips/:tripId
 * Get a single trip by ID.
 *
 * Access is granted when any of the following is true:
 *  - The authenticated user owns the trip (trips.user_id = caller's sub).
 *  - The caller belongs to the same organisation as the trip
 *    (trips.organization_id = caller's orgId from JWT). This covers
 *    transport_partner employees viewing colleagues' trips.
 */
tripRoutes.get('/:tripId', async (c) => {
  const user = c.get('user') as { sub: string; role: string; orgId?: string };
  const tripId = c.req.param('tripId');

  const isAdmin = ['admin', 'super_admin', 'monitoring_officer'].includes(user.role);
  const trip = await getTripById(tripId, isAdmin ? undefined : user.sub, isAdmin ? undefined : user.orgId);

  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }
  return c.json(trip, 200);
});

/**
 * POST /v1/trips/:tripId/gps
 * Submit a GPS position update for an active trip.
 */
tripRoutes.post(
  '/:tripId/gps',
  zValidator('json', TripGpsUpdateSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const tripId = c.req.param('tripId');
    const data = c.req.valid('json');

    try {
      await updateGpsPosition(tripId, user.sub, data);
      return c.json({ status: 'ok' }, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404 | 422);
      }
      throw err;
    }
  }
);

/**
 * POST /v1/trips/:tripId/complete
 * Mark a trip as completed (safe arrival confirmed).
 */
tripRoutes.post('/:tripId/complete', async (c) => {
  const user = c.get('user') as { sub: string };
  const tripId = c.req.param('tripId');

  try {
    const trip = await completeTrip(tripId, user.sub);
    return c.json(trip, 200);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 400 | 404 | 422);
    }
    throw err;
  }
});

/**
 * POST /v1/trips/:tripId/cancel
 * Cancel a draft or active trip.
 */
tripRoutes.post('/:tripId/cancel', async (c) => {
  const user = c.get('user') as { sub: string };
  const tripId = c.req.param('tripId');

  try {
    const trip = await cancelTrip(tripId, user.sub);
    return c.json(trip, 200);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 400 | 404 | 422);
    }
    throw err;
  }
});

/**
 * PATCH /v1/trips/:tripId/vehicle
 * Update vehicle fields on a draft trip.
 * Locked once the trip status leaves 'draft'.
 */
tripRoutes.patch(
  '/:tripId/vehicle',
  zValidator(
    'json',
    z.object({
      vehiclePlateNumber: z.string().nullable().optional(),
      vehicleDescription: z.string().nullable().optional(),
      transportCompany: z.string().nullable().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const tripId = c.req.param('tripId');
    const data = c.req.valid('json');

    try {
      const trip = await updateTripVehicleFields(tripId, user.sub, data);
      return c.json(trip, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404);
      }
      throw err;
    }
  }
);

/**
 * POST /v1/trips/:tripId/tag-invites
 * Create a TripTagInvite to tag another org member on this trip.
 *
 * Requires the initiator's trip to have a vehicle_plate_number set.
 */
tripRoutes.post(
  '/:tripId/tag-invites',
  zValidator(
    'json',
    z.object({
      taggedUserId: z.string().uuid(),
      organizationId: z.string().uuid(),
    })
  ),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const tripId = c.req.param('tripId');
    const { taggedUserId, organizationId } = c.req.valid('json');

    try {
      const invite = await createTripTagInvite({
        initiatorUserId: user.sub,
        taggedUserId,
        organizationId,
        tripId,
      });
      return c.json(invite, 201);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404);
      }
      throw err;
    }
  }
);

/**
 * POST /v1/trips/tag-invites/:inviteId/accept
 * Accept a pending TripTagInvite.
 * Creates a new Trip for the tagged user with vehicle fields copied from the
 * initiator's trip.
 */
tripRoutes.post('/tag-invites/:inviteId/accept', async (c) => {
  const user = c.get('user') as { sub: string };
  const inviteId = c.req.param('inviteId');

  try {
    const trip = await acceptTripTagInvite(inviteId, user.sub);
    return c.json(trip, 201);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 400 | 404);
    }
    throw err;
  }
});

// ────────────────────────────────────────────────────────────
// Admin trip routes
// ────────────────────────────────────────────────────────────

const adminTripRoutes = new Hono();
adminTripRoutes.use('*', authMiddleware);
adminTripRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/trips/active
 * List all active trips across all users, enriched with the last-known GPS
 * position fetched from DynamoDB.
 *
 * DynamoDB is the source of truth for current GPS positions (24-hour TTL).
 * A 3-second Promise.race timeout prevents a DynamoDB hang from blocking
 * the response — trips will simply show currentLocation: null in that case.
 */
adminTripRoutes.get('/active', async (c) => {
  const activeTrips = await getActiveTrips();

  const timeout = new Promise<Map<string, TripLocationRecord>>((resolve) =>
    setTimeout(() => resolve(new Map()), 3_000)
  );
  const locationMap = await Promise.race([
    getAllTripLocations(activeTrips.map((t) => t.id)).catch(() => new Map<string, TripLocationRecord>()),
    timeout,
  ]);

  const trips = activeTrips.map((trip) => {
    const loc = locationMap.get(trip.id);
    return {
      ...trip,
      currentLocation: loc
        ? {
            latitude: loc.latitude,
            longitude: loc.longitude,
            speed: loc.speed ?? null,
            heading: loc.heading ?? null,
            timestamp: loc.timestamp,
          }
        : null,
    };
  });

  return c.json({ trips }, 200);
});

/**
 * GET /v1/admin/trips/:tripId
 * Get any trip by ID (admin override — no ownership check).
 */
adminTripRoutes.get('/:tripId', async (c) => {
  const tripId = c.req.param('tripId');
  const trip = await getTripById(tripId);
  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }
  return c.json(trip, 200);
});

/**
 * PATCH /v1/admin/trips/:tripId/status
 * Admin override: force a trip status change (for emergency/escalation).
 */
adminTripRoutes.patch(
  '/:tripId/status',
  zValidator(
    'json',
    z.object({
      status: z.enum([
        'active', 'delayed', 'emergency',
        'escalated', 'completed', 'cancelled',
      ]),
    })
  ),
  async (c) => {
    const tripId = c.req.param('tripId');
    const { status } = c.req.valid('json');

    try {
      const trip = await adminUpdateTripStatus(tripId, status);
      return c.json(trip, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        return c.json(
          { error: { code: 400, message: err.message } },
          400
        );
      }
      throw err;
    }
  }
);

export { tripRoutes, adminTripRoutes };
