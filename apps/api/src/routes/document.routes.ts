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
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authMiddleware } from '../middleware/auth';
import { env } from '../env';
import {
  listDocuments,
  createDocument,
  deleteDocument,
  getDocumentById,
  isDocumentStorageConfigured,
  uploadDocumentFile,
} from '../services/document.service';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Local disk fallback for document files, used only when the documents
// bucket isn't configured (i.e. local development without AWS credentials —
// see DOCUMENTS_BUCKET_NAME in env.ts). Mirrors emergency.routes.ts's
// AUDIO_UPLOAD_DIR pattern; the static /uploads/* route in index.ts serves
// it in non-production environments.
const DOCUMENT_UPLOAD_DIR = resolve(__dirname, '../../uploads/documents');

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
  // Pipe the file to real storage and persist the returned reference in
  // `file_url` (previously the upload was discarded and only the filename
  // was stored). The document ID is minted here so the S3 key prefix and the
  // DB row ID stay aligned for tracing. In production the file goes to the
  // private documents bucket (S3 object key — never a public URL); in local
  // development without DOCUMENTS_BUCKET_NAME it falls back to local disk,
  // exactly like the emergency-audio path (emergency.routes.ts). Production
  // fails CLOSED rather than writing to ephemeral container disk.
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const documentId = uuidv4();
  let storedRef: string;
  if (isDocumentStorageConfigured()) {
    storedRef = await uploadDocumentFile(
      documentId,
      file.name,
      fileBuffer,
      file.type || 'application/octet-stream'
    );
  } else if (env.NODE_ENV !== 'production') {
    await mkdir(DOCUMENT_UPLOAD_DIR, { recursive: true });
    const safeFileName = `${documentId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = resolve(DOCUMENT_UPLOAD_DIR, safeFileName);
    await writeFile(filePath, fileBuffer);
    storedRef = `/uploads/documents/${safeFileName}`;
  } else {
    return c.json(
      { error: { code: 500, message: 'Document storage is not configured' } },
      500
    );
  }

  const doc = await createDocument({
    id: documentId,
    organizationId,
    documentName,
    documentType,
    entityType,
    entityId,
    expiryDate,
    fileName: file.name,
    fileUrl: storedRef,
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
