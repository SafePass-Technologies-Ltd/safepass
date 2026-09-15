/**
 * Map Marker Route Tests — T-028a (FEAT-038 CSV bulk import).
 *
 * Route-level proof for the two admin marker-import endpoints:
 *   GET  /v1/admin/markers/csv-template  (AC: download a template)
 *   POST /v1/admin/markers/bulk-import   (AC: upload a batch)
 *
 * Exercises the REAL auth middleware + `requireRole` (tokens are signed with a
 * test secret) and the REAL CSV parser/template builder, while mocking the two
 * DB-touching service calls (`findDuplicateCandidates`, `bulkImportMarkers`) so
 * the route can be asserted without a database. Covers:
 *   - officer+ auth (401 unauthenticated, 403 non-admin),
 *   - 201 happy-path commit and the created/skipped/total envelope,
 *   - all-or-nothing validation (400 + validationErrors, nothing committed),
 *   - the 500-row limit, including invalid rows counting toward it,
 *   - the 200 needs_duplicate_review flow and confirm/skip on re-upload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const hoisted = vi.hoisted(() => ({
  mockFindDuplicates: vi.fn(),
  mockBulkImport: vi.fn(),
}));

// auth.ts reads the JWT secrets at module scope; a full env is not needed.
vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

vi.mock('../../db', () => ({ db: {} }));

// Keep the REAL parser/template/limit constant; stub only the DB-touching calls.
vi.mock('../../services/map-marker.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/map-marker.service')>();
  return {
    ...actual,
    findDuplicateCandidates: hoisted.mockFindDuplicates,
    bulkImportMarkers: hoisted.mockBulkImport,
  };
});

import { errorHandler } from '../../middleware/error';
import { issueAccessToken } from '../../middleware/auth';
import { adminMarkerRoutes } from '../map-marker.routes';
import { MARKER_IMPORT_CSV_HEADERS, MARKER_IMPORT_MAX_ROWS } from '../../services/map-marker.service';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/admin/markers', adminMarkerRoutes);

const CSV_HEADER = MARKER_IMPORT_CSV_HEADERS.join(',');

/** One valid CSV data row in the documented column order, with field overrides. */
function row(overrides: Partial<Record<(typeof MARKER_IMPORT_CSV_HEADERS)[number], string>> = {}): string {
  const fields: Record<string, string> = {
    markerType: 'kidnapping_hotspot',
    category: 'Highway corridor',
    latitude: '9.0765',
    longitude: '7.3986',
    title: 'Abuja-Kaduna hotspot',
    description: 'Documented hotspot',
    severity: 'critical',
    source: 'security_advisory',
    expiresAt: '',
    ...overrides,
  };
  return MARKER_IMPORT_CSV_HEADERS.map((header) => fields[header] ?? '').join(',');
}

/** Header + the given data rows. */
function csv(...rows: string[]): string {
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}

interface UploadOptions {
  confirm?: boolean;
  skipRows?: unknown;
  fileName?: string;
  omitFile?: boolean;
}

function makeForm(csvText: string, opts: UploadOptions = {}): FormData {
  const form = new FormData();
  if (!opts.omitFile) {
    form.append('file', new File([csvText], opts.fileName ?? 'markers.csv', { type: 'text/csv' }));
  }
  if (opts.confirm) {
    form.append('confirmDuplicates', 'true');
    if (opts.skipRows !== undefined) form.append('skipRows', JSON.stringify(opts.skipRows));
  }
  return form;
}

async function authHeader(role: string): Promise<string> {
  const token = await issueAccessToken({ sub: 'admin-1', email: 'admin@safepass.test', role });
  return `Bearer ${token}`;
}

/** POST the import form as `role`, or with no Authorization header when null. */
async function post(form: FormData, role: string | null = 'admin'): Promise<Response> {
  const headers: Record<string, string> = {};
  if (role !== null) headers.Authorization = await authHeader(role);
  return app.request('/v1/admin/markers/bulk-import', { method: 'POST', headers, body: form });
}

async function getTemplate(role: string | null = 'admin'): Promise<Response> {
  const headers: Record<string, string> = {};
  if (role !== null) headers.Authorization = await authHeader(role);
  return app.request('/v1/admin/markers/csv-template', { method: 'GET', headers });
}

interface ErrorEnvelope {
  error: { code: number | string; message: string };
  validationErrors?: Array<{ row: number; reason: string }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mockFindDuplicates.mockResolvedValue([]);
  hoisted.mockBulkImport.mockResolvedValue({ created: 1, skipped: 0 });
});

// ────────────────────────────────────────────────────────────
// Auth — officer+ (admin, monitoring_officer, super_admin)
// ────────────────────────────────────────────────────────────
describe('admin marker import — auth', () => {
  it('rejects a missing token with 401 and imports nothing', async () => {
    const res = await post(makeForm(csv(row())), null);

    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe(401);
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401', async () => {
    const res = await app.request('/v1/admin/markers/bulk-import', {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-real-token' },
      body: makeForm(csv(row())),
    });

    expect(res.status).toBe(401);
  });

  it.each(['traveller', 'driver', 'corporate_admin'])(
    'rejects the non-admin role %s with 403 and imports nothing',
    async (role) => {
      const res = await post(makeForm(csv(row())), role);

      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe(403);
      expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'monitoring_officer', 'super_admin'])(
    'allows the admin role %s to import (201)',
    async (role) => {
      const res = await post(makeForm(csv(row())), role);
      expect(res.status).toBe(201);
    }
  );
});

// ────────────────────────────────────────────────────────────
// CSV template download
// ────────────────────────────────────────────────────────────
describe('GET /v1/admin/markers/csv-template (AC: download a template)', () => {
  it('returns the CSV template as a downloadable attachment', async () => {
    const res = await getTemplate();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(
      'safepass-marker-import-template.csv'
    );

    const text = await res.text();
    expect(text.split('\n')[0]).toBe(CSV_HEADER);
    expect(text.trim().split('\n')).toHaveLength(2);
  });

  it('is admin-only (403 for a traveller)', async () => {
    const res = await getTemplate('traveller');
    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────
// Happy path
// ────────────────────────────────────────────────────────────
describe('POST /v1/admin/markers/bulk-import — happy path', () => {
  it('imports a valid file and returns the created/skipped/total envelope (201)', async () => {
    hoisted.mockBulkImport.mockResolvedValue({ created: 2, skipped: 0 });

    const res = await post(makeForm(csv(row(), row({ title: 'Second hotspot' }))));

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      created: number;
      skipped: number;
      total: number;
    };
    expect(body).toEqual({ status: 'imported', created: 2, skipped: 0, total: 2 });

    // Duplicate detection ran, then the parsed rows were handed to the service
    // with the authenticated admin's id and the uploaded filename.
    expect(hoisted.mockFindDuplicates).toHaveBeenCalledTimes(1);
    const [rowsArg, skipArg, userArg, fileArg] = hoisted.mockBulkImport.mock.calls[0]!;
    expect(rowsArg).toHaveLength(2);
    expect(skipArg).toBeInstanceOf(Set);
    expect((skipArg as Set<number>).size).toBe(0);
    expect(userArg).toBe('admin-1');
    expect(fileArg).toBe('markers.csv');
  });
});

// ────────────────────────────────────────────────────────────
// Validation — all-or-nothing
// ────────────────────────────────────────────────────────────
describe('POST /v1/admin/markers/bulk-import — validation (all-or-nothing)', () => {
  it('rejects a file with one invalid row, reporting its row number + reason, and imports nothing', async () => {
    const res = await post(makeForm(csv(row(), row({ title: '' }))));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe(400);
    expect(body.error.message).toBe('1 row(s) failed validation.');
    expect(body.validationErrors).toEqual([
      { row: 2, reason: expect.stringContaining('title is required') },
    ]);
    // AC #4: a single bad row blocks the whole file.
    expect(hoisted.mockFindDuplicates).not.toHaveBeenCalled();
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('collects every failing field of a row into one reason', async () => {
    const res = await post(makeForm(csv(row({ markerType: '', severity: 'nope', latitude: '91' }))));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.validationErrors?.[0]?.row).toBe(1);
    expect(body.validationErrors?.[0]?.reason).toContain('markerType is required');
    expect(body.validationErrors?.[0]?.reason).toContain('severity must be one of');
    expect(body.validationErrors?.[0]?.reason).toContain('latitude must be between -90 and 90');
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('returns 400 when the file field is missing', async () => {
    const res = await post(makeForm('', { omitFile: true }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toBe('file is required');
  });

  it('returns 400 for a non-multipart request', async () => {
    const res = await app.request('/v1/admin/markers/bulk-import', {
      method: 'POST',
      headers: {
        Authorization: await authHeader('admin'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ file: 'nope' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toBe('Request must be multipart/form-data');
  });

  it('returns 400 when the file is not parseable CSV', async () => {
    const res = await post(makeForm('markerType,title\nkidnapping_hotspot,foo"bar\n'));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toContain('could not be parsed as CSV');
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('returns 400 when the file has no data rows', async () => {
    const res = await post(makeForm(csv()));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toBe('File contains no data rows.');
  });
});

// ────────────────────────────────────────────────────────────
// Row limit (AC: 500-row limit)
// ────────────────────────────────────────────────────────────
describe('POST /v1/admin/markers/bulk-import — 500-row limit', () => {
  it('rejects a file above the limit (400) with the limit stated', async () => {
    const rows = Array.from({ length: MARKER_IMPORT_MAX_ROWS + 1 }, (_, i) =>
      row({ title: `Hotspot ${i}` })
    );

    const res = await post(makeForm(csv(...rows)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toContain(`${MARKER_IMPORT_MAX_ROWS + 1} rows`);
    expect(body.error.message).toContain(`${MARKER_IMPORT_MAX_ROWS}-row limit`);
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the limit', async () => {
    const rows = Array.from({ length: MARKER_IMPORT_MAX_ROWS }, (_, i) =>
      row({ title: `Hotspot ${i}` })
    );
    hoisted.mockBulkImport.mockResolvedValue({ created: MARKER_IMPORT_MAX_ROWS, skipped: 0 });

    const res = await post(makeForm(csv(...rows)));

    expect(res.status).toBe(201);
    expect(hoisted.mockBulkImport).toHaveBeenCalledTimes(1);
  });

  it('counts invalid rows toward the limit (the limit wins over validation)', async () => {
    const rows = Array.from({ length: MARKER_IMPORT_MAX_ROWS }, (_, i) =>
      row({ title: `Hotspot ${i}` })
    );
    rows.push(row({ title: '' })); // 501st row is invalid, but still counts

    const res = await post(makeForm(csv(...rows)));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toContain('row limit');
    expect(body.validationErrors).toBeUndefined();
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// Duplicate review (AC: duplicates within 50m confirmed or skipped)
// ────────────────────────────────────────────────────────────
describe('POST /v1/admin/markers/bulk-import — duplicate review', () => {
  const duplicate = {
    row: 1,
    title: 'Abuja-Kaduna hotspot',
    markerType: 'kidnapping_hotspot',
    existingMarkerId: 'marker-existing',
    existingTitle: 'Existing hotspot',
    distanceKm: 0.02,
  };

  it('returns needs_duplicate_review (200) and commits nothing when duplicates are found', async () => {
    hoisted.mockFindDuplicates.mockResolvedValue([duplicate]);

    const res = await post(makeForm(csv(row())));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      duplicates: unknown[];
      totalRows: number;
    };
    expect(body.status).toBe('needs_duplicate_review');
    expect(body.duplicates).toEqual([duplicate]);
    expect(body.totalRows).toBe(1);
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('skips duplicate detection entirely when confirmDuplicates=true', async () => {
    hoisted.mockFindDuplicates.mockResolvedValue([duplicate]);

    const res = await post(makeForm(csv(row()), { confirm: true, skipRows: [] }));

    expect(res.status).toBe(201);
    expect(hoisted.mockFindDuplicates).not.toHaveBeenCalled();
    expect(hoisted.mockBulkImport).toHaveBeenCalledTimes(1);
  });

  it('passes the admin-chosen skipRows through to the import service', async () => {
    hoisted.mockBulkImport.mockResolvedValue({ created: 1, skipped: 1 });

    const res = await post(
      makeForm(csv(row(), row({ title: 'Second' })), { confirm: true, skipRows: [2] })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      created: number;
      skipped: number;
      total: number;
    };
    expect(body).toEqual({ status: 'imported', created: 1, skipped: 1, total: 2 });

    const [, skipArg] = hoisted.mockBulkImport.mock.calls[0]!;
    expect([...(skipArg as Set<number>)]).toEqual([2]);
  });

  it('passes an empty skip set when none was supplied', async () => {
    await post(makeForm(csv(row()), { confirm: true }));

    const [, skipArg] = hoisted.mockBulkImport.mock.calls[0]!;
    expect((skipArg as Set<number>).size).toBe(0);
  });

  it('filters non-numeric skipRows entries', async () => {
    await post(makeForm(csv(row()), { confirm: true, skipRows: [1, '2', null] }));

    const [, skipArg] = hoisted.mockBulkImport.mock.calls[0]!;
    expect([...(skipArg as Set<number>)]).toEqual([1]);
  });

  it('rejects malformed skipRows JSON with 400 and imports nothing', async () => {
    const form = new FormData();
    form.append('file', new File([csv(row())], 'markers.csv', { type: 'text/csv' }));
    form.append('confirmDuplicates', 'true');
    form.append('skipRows', 'not-json');

    const res = await post(form);

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.message).toBe('skipRows must be a JSON array of row numbers');
    expect(hoisted.mockBulkImport).not.toHaveBeenCalled();
  });

  it('ignores a skipRows value that parses but is not an array', async () => {
    const res = await post(makeForm(csv(row()), { confirm: true, skipRows: { row: 1 } }));

    expect(res.status).toBe(201);
    const [, skipArg] = hoisted.mockBulkImport.mock.calls[0]!;
    expect((skipArg as Set<number>).size).toBe(0);
  });
});
