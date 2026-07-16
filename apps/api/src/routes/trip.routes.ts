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
  getRecentDestinations,
  getActiveTrips,
  adminUpdateTripStatus,
  createTripTagInvite,
  acceptTripTagInvite,
  updateTripVehicleFields,
  type ActiveTripRow,
} from '../services/trip.service';
import { getUserById } from '../services/user.service';
import { getTripSummary, getTripLocationHistory } from '../services/trip-archive.service';

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

  // Corporate/transport-partner admins (and platform admins) can register a
  // trip ON BEHALF OF another user -- see docs/SafePass/screens.md Screen 31
  // "Trip Registration (Corporate)": "Register a trip on behalf of a staff
  // member" via a Staff Selector. Everyone else always registers for
  // themselves regardless of what `userId` the body contains, so a client
  // can never spoof another user's trip. This used to unconditionally force
  // userId = the caller, which silently broke corporate trip registration
  // entirely (the trip was always attributed to the admin, never the
  // selected staff member).
  const canRegisterForOthers = ['admin', 'super_admin', 'corporate_admin', 'transport_partner'].includes(
    user.role
  );
  let targetUserId = user.sub;

  if (canRegisterForOthers && data.userId && data.userId !== user.sub) {
    const targetUser = await getUserById(data.userId);
    if (!targetUser) {
      return c.json({ error: { code: 404, message: 'Staff member not found' } }, 404);
    }

    const isPlatformAdmin = ['admin', 'super_admin'].includes(user.role);
    if (!isPlatformAdmin && targetUser.organizationId !== user.orgId) {
      return c.json(
        { error: { code: 403, message: 'Cannot register a trip for a user outside your organization' } },
        403
      );
    }

    targetUserId = data.userId;
  }

  const trip = await createTrip({
    ...data,
    userId: targetUserId,
    registeredBy: user.sub,
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
 * GET /v1/trips/destinations/recent
 * List the caller's distinct past destinations, most-recent first, for the
 * "Where to?" quick-pick list on the Start New Trip screen.
 *
 * Registered ahead of GET /:tripId so "destinations" is never swallowed by
 * the :tripId param route. Excludes draft/cancelled trips -- see
 * getRecentDestinations doc comment in trip.service.ts.
 *
 * Optional ?limit= query param (defaults to 5, capped at 20).
 */
tripRoutes.get('/destinations/recent', async (c) => {
  const user = c.get('user') as { sub: string };
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 5;

  const destinations = await getRecentDestinations(user.sub, limit);
  return c.json({ destinations }, 200);
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
 * GET /v1/trips/:tripId/summary
 * A-26: fetch the trip's TripSummary (aggregate stats -- distance,
 * duration, speed, incident/status-transition counts, message count).
 *
 * Access follows the same trip-visibility rules as GET /:tripId (direct
 * ownership, org-membership, or tagged-user access, plus the admin/
 * monitoring_officer bypass) -- per schema.md, TripSummary has "no
 * additional restriction beyond normal trip access", unlike the
 * admin/super_admin-only route-history endpoint below.
 */
tripRoutes.get('/:tripId/summary', async (c) => {
  const user = c.get('user') as { sub: string; role: string; orgId?: string };
  const tripId = c.req.param('tripId');

  const isAdmin = ['admin', 'super_admin', 'monitoring_officer'].includes(user.role);
  const trip = await getTripById(tripId, isAdmin ? undefined : user.sub, isAdmin ? undefined : user.orgId);
  if (!trip) {
    return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
  }

  const summary = await getTripSummary(tripId);
  if (!summary) {
    // Trip exists but hasn't reached a terminal status yet (or the summary
    // write is still in flight -- see trip.service.ts's fire-and-forget
    // computeAndWriteTripSummary call).
    return c.json({ error: { code: 404, message: 'Trip summary not available yet' } }, 404);
  }

  return c.json(summary, 200);
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

/** Valid values for the admin trip list `?status=` query param (all non-draft statuses). */
const ADMIN_TRIP_STATUS_VALUES = [
  'active', 'delayed', 'emergency', 'escalated', 'completed', 'cancelled',
] as const;
type AdminTripStatusQuery = (typeof ADMIN_TRIP_STATUS_VALUES)[number];

/** Narrow an untrusted `?status=` query value, ignoring anything unrecognised. */
function parseAdminStatusQuery(value: string | undefined): AdminTripStatusQuery | undefined {
  if (value && (ADMIN_TRIP_STATUS_VALUES as readonly string[]).includes(value)) {
    return value as AdminTripStatusQuery;
  }
  return undefined;
}

/**
 * GET /v1/admin/trips/active
 * List trips across all users for the admin Trip Management view, enriched
 * with the last-known GPS position fetched from DynamoDB.
 *
 * Despite the route name ("/active"), this endpoint is the admin dashboard's
 * general trip list — by default it returns every non-draft trip, including
 * terminal 'completed'/'cancelled' ones, so trips stay visible in Trip
 * Management after their status changes instead of disappearing (they used
 * to be dropped entirely because this endpoint only queried in-progress
 * statuses). Pass `?status=` to narrow to a single status.
 *
 * DynamoDB is the source of truth for current GPS positions (24-hour TTL).
 * A 3-second Promise.race timeout prevents a DynamoDB hang from blocking
 * the response — trips will simply show currentLocation: null in that case.
 */
adminTripRoutes.get('/active', async (c) => {
  const statusParam = parseAdminStatusQuery(c.req.query('status'));
  const activeTrips: ActiveTripRow[] = await getActiveTrips(
    statusParam ? [statusParam] : undefined
  );

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
 * GET /v1/admin/trips/:tripId/route-history
 * A-26 "Replay Route" action (A-04 Trip Detail View cross-reference).
 *
 * ADMIN-ONLY per schema.md's TripLocationHistory access-control note and
 * risk_log.md R-013 (resolved): full-fidelity breadcrumb route replay is
 * restricted to admin/super_admin. The adminTripRoutes group above already
 * requires admin/monitoring_officer/super_admin, so requireRole here
 * additionally excludes monitoring_officer specifically for this endpoint --
 * everyone else (monitoring_officer, corporate_admin, transport_partner,
 * the trip's own user) must use GET /v1/trips/:tripId/summary instead, which
 * exposes aggregate stats only, never the raw breadcrumb trail.
 */
adminTripRoutes.get(
  '/:tripId/route-history',
  requireRole('admin', 'super_admin'),
  async (c) => {
    const tripId = c.req.param('tripId');

    const trip = await getTripById(tripId);
    if (!trip) {
      return c.json({ error: { code: 404, message: 'Trip not found' } }, 404);
    }

    const history = await getTripLocationHistory(tripId);
    return c.json({ tripId, points: history }, 200);
  }
);

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
