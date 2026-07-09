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
  buildMarkerImportCsvTemplate,
  parseMarkersImportCsv,
  findDuplicateCandidates,
  bulkImportMarkers,
  MARKER_IMPORT_MAX_ROWS,
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
 * GET /v1/admin/markers/csv-template
 * Downloads the CSV template (headers + one worked example row) for bulk
 * import (A-09 AC #1). Registered before the /:id routes below so "csv-
 * template" is never captured as a marker ID.
 */
adminMarkerRoutes.get('/csv-template', (c) => {
  const csv = buildMarkerImportCsvTemplate();
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="safepass-marker-import-template.csv"');
  return c.body(csv);
});

/**
 * POST /v1/admin/markers/bulk-import  (multipart/form-data)
 *
 * A-09 CSV bulk import. Two-phase, stateless flow (no server-side session
 * needed): the client re-submits the SAME file on the confirmation call.
 *
 * Fields:
 *   file             File     required
 *   confirmDuplicates 'true'|'false'  optional, default 'false'
 *   skipRows          JSON array of row numbers to skip (only meaningful
 *                      alongside confirmDuplicates=true)
 *
 * Responses:
 *   400 { error, validationErrors } — one or more rows invalid; nothing
 *       committed (AC #4: all-or-nothing).
 *   400 { error } — row count exceeds MARKER_IMPORT_MAX_ROWS (AC #3).
 *   200 { status: 'needs_duplicate_review', duplicates, totalRows } — valid
 *       file, but likely duplicates found and confirmDuplicates wasn't set;
 *       nothing committed yet (AC #5).
 *   201 { status: 'imported', created, skipped, total } — committed.
 */
adminMarkerRoutes.post('/bulk-import', async (c) => {
  const user = c.get('user');

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

  const confirmDuplicates = formData.get('confirmDuplicates') === 'true';
  let skipRows = new Set<number>();
  const skipRowsRaw = formData.get('skipRows');
  if (typeof skipRowsRaw === 'string' && skipRowsRaw.trim() !== '') {
    try {
      const parsed = JSON.parse(skipRowsRaw) as unknown;
      if (Array.isArray(parsed)) {
        skipRows = new Set(parsed.filter((n): n is number => typeof n === 'number'));
      }
    } catch {
      return c.json({ error: { code: 400, message: 'skipRows must be a JSON array of row numbers' } }, 400);
    }
  }

  const csvText = await file.text();

  let parsedRows;
  let errors;
  try {
    ({ rows: parsedRows, errors } = parseMarkersImportCsv(csvText));
  } catch {
    return c.json(
      { error: { code: 400, message: 'File could not be parsed as CSV. Check the file format and try again.' } },
      400
    );
  }

  // AC #3: row-count limit, checked against the raw row count (including
  // invalid rows) so a file crafted to dodge the limit via bad rows still
  // gets caught.
  const totalRowCount = parsedRows.length + errors.length;
  if (totalRowCount > MARKER_IMPORT_MAX_ROWS) {
    return c.json(
      {
        error: {
          code: 400,
          message: `File has ${totalRowCount} rows, exceeding the ${MARKER_IMPORT_MAX_ROWS}-row limit per upload. Split the file and re-upload.`,
        },
      },
      400
    );
  }

  // AC #4: all-or-nothing -- any invalid row blocks the entire file.
  if (errors.length > 0) {
    return c.json(
      { error: { code: 400, message: `${errors.length} row(s) failed validation.` }, validationErrors: errors },
      400
    );
  }

  if (parsedRows.length === 0) {
    return c.json({ error: { code: 400, message: 'File contains no data rows.' } }, 400);
  }

  // AC #5: duplicate review, unless the admin already confirmed past it
  // (second call with the same file).
  if (!confirmDuplicates) {
    const duplicates = await findDuplicateCandidates(parsedRows);
    if (duplicates.length > 0) {
      return c.json({ status: 'needs_duplicate_review', duplicates, totalRows: parsedRows.length });
    }
  }

  const result = await bulkImportMarkers(parsedRows, skipRows, user.sub, file.name);
  return c.json(
    { status: 'imported', created: result.created, skipped: result.skipped, total: parsedRows.length },
    201
  );
});

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
