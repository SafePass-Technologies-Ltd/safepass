/**
 * Map Marker Routes — user interactions + admin marker management.
 *
 * /v1/markers                — User: list (nearby), interact
 * /v1/admin/markers          — Admin: CRUD
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { MapMarkerCreateSchema } from '@safepass/shared';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  createMarker,
  getAllMarkers,
  getMarkersNearLocation,
  getMarkerById,
  updateMarker,
  deactivateMarker,
  interactWithMarker,
  getMarkerInteractions,
} from '../services/map-marker.service';

// ────────────────────────────────────────────────────────────
// User-facing marker routes
// ────────────────────────────────────────────────────────────

const markerRoutes = new Hono();
markerRoutes.use('*', authMiddleware);

/**
 * GET /v1/markers/nearby
 * Get active markers near a location.
 * Query: ?latitude=6.52&longitude=3.38&radius=10
 */
markerRoutes.get('/nearby', async (c) => {
  const lat = parseFloat(c.req.query('latitude') ?? '');
  const lng = parseFloat(c.req.query('longitude') ?? '');

  if (isNaN(lat) || isNaN(lng)) {
    return c.json(
      { error: { code: 400, message: 'latitude and longitude are required' } },
      400
    );
  }

  const radius = parseFloat(c.req.query('radius') ?? '10');
  const markers = await getMarkersNearLocation(lat, lng, radius);
  return c.json({ markers });
});

/**
 * POST /v1/markers/:id/interact
 * Interact with a marker (confirm, dispute, reclassify per M-14).
 * Body: { action: 'confirm'|'dispute_not_there'|'reclassify_police'|'reclassify_suspicious', notes? }
 */
const InteractionSchema = z.object({
  action: z.enum(['confirm', 'dispute_not_there', 'reclassify_police', 'reclassify_suspicious']),
  notes: z.string().optional(),
});

markerRoutes.post(
  '/:id/interact',
  zValidator('json', InteractionSchema),
  async (c) => {
    const user = c.get('user');
    const markerId = c.req.param('id');
    const { action, notes } = c.req.valid('json');

    const interaction = await interactWithMarker({
      markerId,
      userId: user.sub,
      action,
      notes,
    });

    return c.json(interaction, 201);
  }
);

/**
 * GET /v1/markers/:id/interactions
 * Get interaction history for a marker.
 */
markerRoutes.get('/:id/interactions', async (c) => {
  const markerId = c.req.param('id');
  const interactions = await getMarkerInteractions(markerId);
  return c.json({ interactions });
});

// ────────────────────────────────────────────────────────────
// Admin marker routes
// ────────────────────────────────────────────────────────────

const adminMarkerRoutes = new Hono();
adminMarkerRoutes.use('*', authMiddleware);
adminMarkerRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/markers
 * List all markers with optional filters.
 */
adminMarkerRoutes.get('/', async (c) => {
  const markerType = c.req.query('markerType');
  const verificationStatus = c.req.query('verificationStatus');
  const severity = c.req.query('severity');
  const isActive = c.req.query('isActive');
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const markers = await getAllMarkers({
    markerType,
    verificationStatus,
    severity,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    limit,
    offset,
  });

  return c.json({ markers });
});

/**
 * POST /v1/admin/markers
 * Create a new marker (admin-placed).
 */
adminMarkerRoutes.post(
  '/',
  zValidator('json', MapMarkerCreateSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');

    const marker = await createMarker({
      markerType: data.markerType,
      category: data.category,
      latitude: data.location.latitude,
      longitude: data.location.longitude,
      title: data.title,
      description: data.description,
      severity: data.severity,
      source: data.source,
      createdBy: user.sub,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    return c.json(marker, 201);
  }
);

/**
 * GET /v1/admin/markers/:id
 */
adminMarkerRoutes.get('/:id', async (c) => {
  const marker = await getMarkerById(c.req.param('id'));

  if (!marker) {
    return c.json({ error: { code: 404, message: 'Marker not found' } }, 404);
  }

  return c.json(marker);
});

/**
 * PATCH /v1/admin/markers/:id
 * Update a marker's details.
 */
const MarkerUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  verificationStatus: z.enum(['unverified', 'partially_confirmed', 'verified', 'disputed', 'rejected']).optional(),
  isActive: z.boolean().optional(),
});

adminMarkerRoutes.patch(
  '/:id',
  zValidator('json', MarkerUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const marker = await updateMarker(id, c.req.valid('json'));
    return c.json(marker);
  }
);

/**
 * DELETE /v1/admin/markers/:id
 * Deactivate a marker (soft delete).
 */
adminMarkerRoutes.delete('/:id', async (c) => {
  await deactivateMarker(c.req.param('id'));
  return c.json({ status: 'deleted' });
});

export { markerRoutes, adminMarkerRoutes };
