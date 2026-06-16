/**
 * Document Service — manages compliance documents for organizations.
 *
 * NOTE: No `documents` table exists in the Drizzle schema yet.
 * Documents are stored in-memory for now so the transport-dashboard
 * documents page works without a migration.
 *
 * TODO: Create a Drizzle migration for the `documents` table and replace
 * the in-memory store with proper DB calls before deploying to production.
 * Suggested columns:
 *   id uuid PK, organizationId uuid FK→organizations, documentName text,
 *   documentType text, status text, fileUrl text, expiryDate date nullable,
 *   createdAt timestamptz, updatedAt timestamptz
 */
import { v4 as uuidv4 } from 'uuid';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  organizationId: string;
  documentName: string;
  documentType: string;
  /** pending | valid | expired */
  status: string;
  /** ISO date string or null */
  expiryDate: string | null;
  /** Filename of the uploaded file (stored in-memory only) */
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  organizationId: string;
  documentName: string;
  documentType: string;
  expiryDate?: string | null;
  fileName?: string | null;
}

// ────────────────────────────────────────────────────────────
// In-memory store (replace with DB queries once migration exists)
// ────────────────────────────────────────────────────────────

const documentStore = new Map<string, Document>();

/**
 * Derive the initial status of a document based on its expiry date.
 * - No expiry → "valid"
 * - Expiry in the past → "expired"
 * - Expiry in the future → "valid"
 */
function deriveStatus(expiryDate?: string | null): string {
  if (!expiryDate) return 'pending';
  const expiry = new Date(expiryDate);
  return Number.isNaN(expiry.getTime()) || expiry < new Date() ? 'expired' : 'valid';
}

/**
 * List all documents belonging to the given organization, newest first.
 */
export async function listDocuments(organizationId: string): Promise<Document[]> {
  const results: Document[] = [];
  for (const doc of documentStore.values()) {
    if (doc.organizationId === organizationId) {
      results.push(doc);
    }
  }
  // Sort descending by createdAt
  results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return results;
}

/**
 * Create a new document record for an organization.
 * The file itself is not persisted server-side (in-memory mode); only metadata
 * and the original filename are stored. A proper file-upload integration
 * (e.g. S3 / GCS / local disk) should be wired once the DB migration lands.
 */
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const now = new Date().toISOString();
  const doc: Document = {
    id: uuidv4(),
    organizationId: input.organizationId,
    documentName: input.documentName,
    documentType: input.documentType,
    status: deriveStatus(input.expiryDate),
    expiryDate: input.expiryDate ?? null,
    fileName: input.fileName ?? null,
    createdAt: now,
    updatedAt: now,
  };
  documentStore.set(doc.id, doc);
  return doc;
}

/**
 * Delete a document by ID. Returns the deleted document, or null if not found.
 */
export async function deleteDocument(id: string): Promise<Document | null> {
  const doc = documentStore.get(id);
  if (!doc) return null;
  documentStore.delete(id);
  return doc;
}

/**
 * Find a single document by ID.
 */
export async function getDocumentById(id: string): Promise<Document | null> {
  return documentStore.get(id) ?? null;
}
