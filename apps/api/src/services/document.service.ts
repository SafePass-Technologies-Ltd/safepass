/**
 * Document Service — manages compliance documents for organizations.
 *
 * Uses the `documents` Drizzle table (transport.ts). All queries are scoped to
 * the requesting organization so partners only see their own documents.
 *
 * The `complianceStatus` column tracks the client-facing lifecycle:
 *   pending  — uploaded, awaiting review or expiry evaluation
 *   valid    — expiry date is in the future (or not set)
 *   expired  — expiry date is in the past
 *
 * This is separate from `verificationStatus` (org_verification enum) which
 * records the admin review state (pending | verified | rejected).
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { documents } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  organizationId: string;
  documentName: string;
  documentType: string | null;
  /** pending | valid | expired */
  status: string;
  /** ISO date string or null */
  expiryDate: string | null;
  /** Original filename of the uploaded file. */
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  organizationId: string;
  documentName: string;
  documentType?: string | null;
  expiryDate?: string | null;
  fileName?: string | null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Derive the compliance status from an expiry date.
 * - No expiry → "valid"  (document is considered always valid until reviewed)
 * - Expiry in the past  → "expired"
 * - Expiry in the future → "valid"
 */
function deriveStatus(expiryDate?: string | null): string {
  if (!expiryDate) return 'pending';
  const expiry = new Date(expiryDate);
  return Number.isNaN(expiry.getTime()) || expiry < new Date() ? 'expired' : 'valid';
}

/**
 * Map a raw DB row to the public Document shape.
 */
function toDocumentResponse(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentName: row.documentName ?? '',
    documentType: row.documentType ?? null,
    status: row.complianceStatus,
    expiryDate: row.expiryDate ? row.expiryDate.toISOString() : null,
    fileName: row.fileName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * List all documents belonging to the given organization, newest first.
 */
export async function listDocuments(organizationId: string): Promise<Document[]> {
  const rows = await db.query.documents.findMany({
    where: eq(documents.organizationId, organizationId),
    orderBy: desc(documents.createdAt),
  });
  return rows.map(toDocumentResponse);
}

/**
 * Create a new document record for an organization.
 *
 * File upload is not handled here — a file storage integration (S3 / GCS)
 * should set `fileUrl` once available. For now only metadata is persisted.
 */
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const status = deriveStatus(input.expiryDate);

  const [row] = await db
    .insert(documents)
    .values({
      organizationId: input.organizationId,
      documentName: input.documentName,
      fileName: input.fileName ?? null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      complianceStatus: status,
    })
    .returning();

  return toDocumentResponse(row);
}

/**
 * Delete a document by ID. Scoped to the organization to prevent cross-tenant
 * deletion. Returns the deleted document, or null if not found.
 */
export async function deleteDocument(
  id: string,
  organizationId: string
): Promise<Document | null> {
  const existing = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, organizationId)),
  });

  if (!existing) return null;

  const [row] = await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)))
    .returning();

  return toDocumentResponse(row);
}

/**
 * Find a single document by ID.
 */
export async function getDocumentById(id: string): Promise<Document | null> {
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });
  return row ? toDocumentResponse(row) : null;
}
