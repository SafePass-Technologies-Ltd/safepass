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
  const user = c.get('user') as { sub: string };
  const data = c.req.valid('json');

  // Ensure the userId matches the authenticated user.
  if (data.userId !== user.sub) {
    return c.json(
      { error: { code: 403, message: 'Cannot create trip for another user' } },
      403
    );
  }

  const trip = await createTrip(data);
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
 * Get a single trip by ID (scoped to the authenticated user).
 */
tripRoutes.get('/:tripId', async (c) => {
  const user = c.get('user') as { sub: string };
  const tripId = c.req.param('tripId');

  const trip = await getTripById(tripId, user.sub);
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

// ────────────────────────────────────────────────────────────
// Admin trip routes
// ────────────────────────────────────────────────────────────

const adminTripRoutes = new Hono();
adminTripRoutes.use('*', authMiddleware);
adminTripRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/trips/active
 * List all active trips across all users.
 */
adminTripRoutes.get('/active', async (c) => {
  const trips = await getActiveTrips();
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
