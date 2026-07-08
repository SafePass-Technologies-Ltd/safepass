/**
 * Document Routes — compliance document management for organizations.
 *
 * GET  /v1/documents?organizationId=  — list documents for an org
 * POST /v1/documents                  — upload a new document (multipart/form-data)
 * DELETE /v1/documents/:id            — delete a document by ID
 *
 * All routes require a valid Bearer JWT. Users may only access documents
 * belonging to their own organization; admins may access any org's documents.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import {
  listDocuments,
  createDocument,
  deleteDocument,
  getDocumentById,
} from '../services/document.service';

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

const VALID_DOC_TYPES = [
  'vehicle_insurance',
  'drivers_license',
  'road_worthiness',
  'hack_permit',
  'other',
] as const;

const adminRoles = new Set(['admin', 'monitoring_officer', 'super_admin']);

/**
 * Return true when the authenticated user is permitted to access documents
 * for the requested organization.
 */
function canAccessOrg(userOrgId: string | undefined, userRole: string, targetOrgId: string): boolean {
  if (adminRoles.has(userRole)) return true;
  return userOrgId === targetOrgId;
}

// ────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────

const documentRoutes = new Hono();
documentRoutes.use('*', authMiddleware);

/**
 * GET /v1/documents?organizationId=<uuid>&entityType=<vehicle|driver|organization>&entityId=<uuid>
 *
 * Returns all documents for the specified organization, optionally scoped
 * to one entity -- Screen 37: "Document List | Grouped by entity (vehicle,
 * driver, organization)", and used by the Vehicle Detail view's documents
 * section (entityType=vehicle&entityId=<vehicleId>). The caller must
 * belong to that organization or be an admin.
 */
documentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const organizationId = c.req.query('organizationId');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');

  if (!organizationId) {
    return c.json(
      { error: { code: 400, message: 'organizationId query parameter is required' } },
      400
    );
  }

  if (!canAccessOrg(user.orgId, user.role, organizationId)) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  const documents = await listDocuments(organizationId, { entityType, entityId });
  return c.json({ documents });
});

const VALID_ENTITY_TYPES = ['vehicle', 'driver', 'organization'] as const;

/**
 * POST /v1/documents  (multipart/form-data)
 *
 * Expected fields:
 *   documentName   string  required
 *   documentType   enum    required  (vehicle_insurance | drivers_license | road_worthiness | hack_permit | other)
 *   organizationId string  required
 *   entityType     enum    optional  (vehicle | driver | organization) -- Screen 37's entity selector
 *   entityId       string  optional  (required if entityType is 'vehicle' or 'driver')
 *   expiryDate     string  optional  (ISO date YYYY-MM-DD)
 *   file           File    required  (PDF or image)
 */
documentRoutes.post('/', async (c) => {
  const user = c.get('user');

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: 400, message: 'Request must be multipart/form-data' } }, 400);
  }

  const documentName = (formData.get('documentName') as string | null)?.trim();
  const documentType = formData.get('documentType') as string | null;
  const organizationId = (formData.get('organizationId') as string | null)?.trim();
  const entityType = (formData.get('entityType') as string | null)?.trim() || null;
  const entityId = (formData.get('entityId') as string | null)?.trim() || null;
  const expiryDate = (formData.get('expiryDate') as string | null)?.trim() || null;
  const file = formData.get('file') as File | null;

  // ── Field validation ──────────────────────────────────────

  if (!documentName) {
    return c.json({ error: { code: 400, message: 'documentName is required' } }, 400);
  }

  if (!documentType || !(VALID_DOC_TYPES as readonly string[]).includes(documentType)) {
    return c.json(
      {
        error: {
          code: 400,
          message: `documentType must be one of: ${VALID_DOC_TYPES.join(', ')}`,
        },
      },
      400
    );
  }

  if (!organizationId) {
    return c.json({ error: { code: 400, message: 'organizationId is required' } }, 400);
  }

  if (entityType && !(VALID_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return c.json(
      { error: { code: 400, message: `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}` } },
      400
    );
  }

  if ((entityType === 'vehicle' || entityType === 'driver') && !entityId) {
    return c.json(
      { error: { code: 400, message: 'entityId is required when entityType is vehicle or driver' } },
      400
    );
  }

  if (!file || !(file instanceof File)) {
    return c.json({ error: { code: 400, message: 'file is required' } }, 400);
  }

  // Validate optional expiry date format
  if (expiryDate) {
    const parsed = new Date(expiryDate);
    if (Number.isNaN(parsed.getTime())) {
      return c.json(
        { error: { code: 400, message: 'expiryDate must be a valid ISO date (YYYY-MM-DD)' } },
        400
      );
    }
  }

  // ── Authorization ─────────────────────────────────────────

  if (!canAccessOrg(user.orgId, user.role, organizationId)) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  // ── Persist ───────────────────────────────────────────────
  // TODO: pipe `file` to a storage backend (S3/GCS/local) and store the
  // returned URL instead of just the filename once the DB migration lands.

  const doc = await createDocument({
    organizationId,
    documentName,
    documentType,
    entityType,
    entityId,
    expiryDate,
    fileName: file.name,
  });

  return c.json(doc, 201);
});

/**
 * DELETE /v1/documents/:id
 *
 * Permanently removes a document record. The caller must belong to the
 * document's organization or be an admin.
 */
documentRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await getDocumentById(id);
  if (!existing) {
    return c.json({ error: { code: 404, message: 'Document not found' } }, 404);
  }

  if (!canAccessOrg(user.orgId, user.role, existing.organizationId)) {
    return c.json({ error: { code: 403, message: 'Access denied' } }, 403);
  }

  await deleteDocument(id, existing.organizationId);
  return c.json({ success: true });
});

export { documentRoutes };
