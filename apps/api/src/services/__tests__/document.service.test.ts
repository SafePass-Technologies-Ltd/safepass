/**
 * Document Service Tests — T-025 (document upload must actually store the file).
 *
 * Focuses on the service-level object-storage upload (`uploadDocumentFile`)
 * with the S3 client mocked, and on `createDocument` persisting the storage
 * reference into `file_url`. Follows the same mock-the-database approach as
 * account-deletion.service.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockEnv: {
    DOCUMENTS_BUCKET_NAME: 'safepass-documents' as string | undefined,
    DYNAMODB_REGION: 'eu-west-2',
  },
  mockS3Send: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    query: {
      documents: { findMany: vi.fn() },
    },
    insert: hoisted.mockInsert,
    delete: vi.fn(),
  },
}));

vi.mock('../../env', () => ({
  env: hoisted.mockEnv,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: hoisted.mockS3Send })),
  PutObjectCommand: vi.fn((input: unknown) => ({ input })),
}));

import {
  isDocumentStorageConfigured,
  uploadDocumentFile,
  createDocument,
} from '../document.service';

/** Build a stub `documents` row for toDocumentResponse to map. */
function stubDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    organizationId: 'org-1',
    entityType: null,
    entityId: null,
    documentType: null,
    fileUrl: null,
    fileName: null,
    verificationStatus: 'pending',
    verifiedBy: null,
    rejectionReason: null,
    documentName: 'Vehicle Insurance',
    expiryDate: null,
    complianceStatus: 'pending',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mockEnv.DOCUMENTS_BUCKET_NAME = 'safepass-documents';

  hoisted.mockInsert.mockReturnValue({ values: hoisted.mockInsertValues });
  hoisted.mockInsertValues.mockReturnValue({ returning: hoisted.mockInsertReturning });
});

// ────────────────────────────────────────────────────────────
// isDocumentStorageConfigured
// ────────────────────────────────────────────────────────────
describe('isDocumentStorageConfigured', () => {
  it('returns true when the documents bucket is configured', () => {
    expect(isDocumentStorageConfigured()).toBe(true);
  });

  it('returns false when the documents bucket is unset (local dev)', () => {
    hoisted.mockEnv.DOCUMENTS_BUCKET_NAME = undefined;
    expect(isDocumentStorageConfigured()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// uploadDocumentFile
// ────────────────────────────────────────────────────────────
describe('uploadDocumentFile', () => {
  const body = Buffer.from('%PDF-1.4 fake document bytes');

  it('throws when the documents bucket is not configured', async () => {
    hoisted.mockEnv.DOCUMENTS_BUCKET_NAME = undefined;

    await expect(
      uploadDocumentFile('doc-1', 'insurance.pdf', body, 'application/pdf')
    ).rejects.toThrow('DOCUMENTS_BUCKET_NAME is not configured');
  });

  it('uploads the file to S3 under a per-document prefix and returns the object key', async () => {
    hoisted.mockS3Send.mockResolvedValue({});

    const key = await uploadDocumentFile('doc-1', 'insurance.pdf', body, 'application/pdf');

    expect(hoisted.mockS3Send).toHaveBeenCalledTimes(1);
    const command = hoisted.mockS3Send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input.Bucket).toBe('safepass-documents');
    expect(command.input.Key).toMatch(/^documents\/doc-1\/\d+-insurance\.pdf$/);
    expect(command.input.Body).toBe(body);
    expect(command.input.ContentType).toBe('application/pdf');

    expect(key).toMatch(/^documents\/doc-1\/\d+-insurance\.pdf$/);
  });

  it('sanitizes unsafe characters out of the stored object name', async () => {
    hoisted.mockS3Send.mockResolvedValue({});

    const key = await uploadDocumentFile('doc-2', 'driver license (copy).pdf', body, 'application/pdf');

    const command = hoisted.mockS3Send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    // Every non [a-zA-Z0-9._-] character becomes '_' (spaces and parens each
    // map to one underscore).
    expect(command.input.Key).toMatch(/^documents\/doc-2\/\d+-driver_license__copy_\.pdf$/);
    expect(key).toBe(command.input.Key);
  });
});

// ────────────────────────────────────────────────────────────
// createDocument — persists the storage reference
// ────────────────────────────────────────────────────────────
describe('createDocument', () => {
  it('stores fileUrl and the supplied id in the inserted row', async () => {
    hoisted.mockInsertReturning.mockResolvedValue([
      stubDocumentRow({
        id: 'doc-1',
        fileName: 'insurance.pdf',
        fileUrl: 'documents/doc-1/123-insurance.pdf',
      }),
    ]);

    const doc = await createDocument({
      id: 'doc-1',
      organizationId: 'org-1',
      documentName: 'Vehicle Insurance',
      fileName: 'insurance.pdf',
      fileUrl: 'documents/doc-1/123-insurance.pdf',
    });

    const inserted = hoisted.mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.id).toBe('doc-1');
    expect(inserted.fileUrl).toBe('documents/doc-1/123-insurance.pdf');

    // Response shape unchanged (no fileUrl exposed) — matches the frozen contract.
    expect(doc.id).toBe('doc-1');
    expect(doc.fileName).toBe('insurance.pdf');
    expect('fileUrl' in doc).toBe(false);
  });

  it('stores null fileUrl when no storage reference is available', async () => {
    hoisted.mockInsertReturning.mockResolvedValue([stubDocumentRow()]);

    await createDocument({ organizationId: 'org-1', documentName: 'Other' });

    const inserted = hoisted.mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.fileUrl).toBeNull();
  });
});