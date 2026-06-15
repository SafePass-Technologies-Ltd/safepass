/**
 * Incident Routes — user-facing reporting + admin management.
 *
 * /v1/incidents              — User: create + list own incidents
 * /v1/incidents/nearby       — Public: proximity-based incident lookup
 * /v1/admin/incidents        — Admin: list all incidents
 * /v1/admin/incidents/:id/*  — Admin: verification workflow
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { IncidentCreateSchema } from '@safepass/shared';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  createIncident,
  getUserIncidents,
  getAllIncidents,
  getIncidentsNearLocation,
  getIncidentById,
  updateVerificationStatus,
  deactivateIncident,
} from '../services/incident.service';

// ────────────────────────────────────────────────────────────
// User-facing incident routes (authenticated)
// ────────────────────────────────────────────────────────────

const incidentRoutes = new Hono();
incidentRoutes.use('*', authMiddleware);

/**
 * POST /v1/incidents
 * Report a new incident (M-13).
 * Body: { tripId?, incidentType, location: { latitude, longitude, address? }, description, photoUrl? }
 */
incidentRoutes.post(
  '/',
  zValidator('json', IncidentCreateSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');

    const incident = await createIncident({
      reporterId: user.sub,
      tripId: data.tripId,
      incidentType: data.incidentType,
      location: data.location,
      description: data.description,
      photoUrl: data.photoUrl,
    });

    return c.json(incident, 201);
  }
);

/**
 * GET /v1/incidents
 * List the authenticated user's own reported incidents.
 * Query: ?incidentType=kidnapping&isActive=true&limit=20&offset=0
 */
incidentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const incidentType = c.req.query('incidentType');
  const isActive = c.req.query('isActive');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const incidents = await getUserIncidents(user.sub, {
    incidentType,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    limit,
    offset,
  });

  return c.json({ incidents });
});

/**
 * GET /v1/incidents/nearby
 * Get incidents near a location (for safety map / route alerts).
 * Query: ?latitude=6.52&longitude=3.38&radius=5
 */
incidentRoutes.get('/nearby', async (c) => {
  const lat = parseFloat(c.req.query('latitude') ?? '');
  const lng = parseFloat(c.req.query('longitude') ?? '');

  if (isNaN(lat) || isNaN(lng)) {
    return c.json(
      { error: { code: 400, message: 'latitude and longitude are required' } },
      400
    );
  }

  const radius = parseFloat(c.req.query('radius') ?? '5');
  const incidents = await getIncidentsNearLocation(lat, lng, radius);
  return c.json({ incidents });
});

// ────────────────────────────────────────────────────────────
// Admin incident routes
// ────────────────────────────────────────────────────────────

const adminIncidentRoutes = new Hono();
adminIncidentRoutes.use('*', authMiddleware);
adminIncidentRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/incidents
 * List all incidents with optional filters.
 * Query: ?incidentType=&verificationStatus=&severity=&isActive=&limit=&offset=
 */
adminIncidentRoutes.get('/', async (c) => {
  const incidentType = c.req.query('incidentType');
  const verificationStatus = c.req.query('verificationStatus');
  const severity = c.req.query('severity');
  const isActive = c.req.query('isActive');
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const incidents = await getAllIncidents({
    incidentType,
    verificationStatus,
    severity,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    limit,
    offset,
  });

  return c.json({ incidents });
});

/**
 * GET /v1/admin/incidents/:id
 * Get a single incident by ID.
 */
adminIncidentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const incident = await getIncidentById(id);

  if (!incident) {
    return c.json({ error: { code: 404, message: 'Incident not found' } }, 404);
  }

  return c.json(incident);
});

/**
 * PATCH /v1/admin/incidents/:id/verify
 * Update an incident's verification status.
 * Body: { status: 'verified'|'partially_confirmed'|'disputed'|'rejected', adminNotes? }
 */
const VerifyUpdateSchema = z.object({
  status: z.enum(['unverified', 'partially_confirmed', 'verified', 'disputed', 'rejected']),
  adminNotes: z.string().optional(),
});

adminIncidentRoutes.patch(
  '/:id/verify',
  zValidator('json', VerifyUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const { status, adminNotes } = c.req.valid('json');

    const incident = await updateVerificationStatus(id, status, adminNotes);
    return c.json(incident);
  }
);

/**
 * DELETE /v1/admin/incidents/:id
 * Deactivate (soft-delete) an incident.
 */
adminIncidentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const incident = await deactivateIncident(id);
  return c.json(incident);
});

export { incidentRoutes, adminIncidentRoutes };
