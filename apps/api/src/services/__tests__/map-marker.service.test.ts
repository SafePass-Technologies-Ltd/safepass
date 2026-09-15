/**
 * Map Marker Service Tests — T-028a (FEAT-038 CSV bulk import).
 *
 * Covers the service half of FEAT-038:
 *   - the downloadable CSV template (AC: download a template),
 *   - per-row parsing/validation with row numbers and reasons (AC: invalid
 *     rows are reported; nothing commits unless the whole file is valid),
 *   - the 500-row limit constant (AC: 500-row limit),
 *   - ~50m duplicate detection (AC: duplicates flagged for confirm or skip),
 *   - the commit path: verified-by-default markers plus the import audit row
 *     (AC: every import is logged with uploader, filename, row count).
 *
 * The database is mocked — no test touches PostgreSQL. Route-level behaviour
 * (auth, status codes, multipart handling, duplicate-review flow) lives in
 * routes/__tests__/map-marker.routes.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockTxInsert: vi.fn(),
  mockTxValues: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    query: { mapMarkers: { findMany: hoisted.mockFindMany } },
    transaction: hoisted.mockTransaction,
  },
}));

import { mapMarkers, mapMarkerImports } from '../../db/schema';
import {
  MARKER_IMPORT_CSV_HEADERS,
  MARKER_IMPORT_MAX_ROWS,
  buildMarkerImportCsvTemplate,
  parseMarkersImportCsv,
  findDuplicateCandidates,
  bulkImportMarkers,
  type CsvImportRow,
} from '../map-marker.service';

/** Every CSV column, defaulted to a valid value; override one field per case. */
type RowFields = Partial<Record<(typeof MARKER_IMPORT_CSV_HEADERS)[number], string>>;

function validFields(overrides: RowFields = {}): Record<string, string> {
  return {
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
}

/** Build a CSV string (header + given data rows) in the documented column order. */
function toCsv(rows: Array<Record<string, string>>): string {
  return (
    [
      MARKER_IMPORT_CSV_HEADERS.join(','),
      ...rows.map((row) => MARKER_IMPORT_CSV_HEADERS.map((header) => row[header] ?? '').join(',')),
    ].join('\n') + '\n'
  );
}

/** Parse exactly one row and hand back the validated result (fails loudly if it didn't validate). */
function parseOne(overrides: RowFields = {}): CsvImportRow {
  const { rows } = parseMarkersImportCsv(toCsv([validFields(overrides)]));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mockFindMany.mockResolvedValue([]);
  hoisted.mockTxInsert.mockReturnValue({ values: hoisted.mockTxValues });
  hoisted.mockTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ insert: hoisted.mockTxInsert })
  );
});

// ────────────────────────────────────────────────────────────
// Template + limit constants
// ────────────────────────────────────────────────────────────
describe('buildMarkerImportCsvTemplate (AC: download a CSV template)', () => {
  it('starts with the documented header row', () => {
    const csvText = buildMarkerImportCsvTemplate();
    expect(csvText.split('\n')[0]).toBe(MARKER_IMPORT_CSV_HEADERS.join(','));
  });

  it('ships exactly one worked example row, quoting the comma-containing title', () => {
    const lines = buildMarkerImportCsvTemplate().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Example: Kilometer 84, Abuja-Kaduna Road"');
  });
});

describe('MARKER_IMPORT_MAX_ROWS (AC: 500-row limit)', () => {
  it('is 500 rows per upload', () => {
    expect(MARKER_IMPORT_MAX_ROWS).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────
// Parsing / validation
// ────────────────────────────────────────────────────────────
describe('parseMarkersImportCsv — valid rows', () => {
  it('parses a valid row into a typed, 1-indexed import row', () => {
    const row = parseOne();
    expect(row.row).toBe(1);
    expect(row.markerType).toBe('kidnapping_hotspot');
    expect(row.category).toBe('Highway corridor');
    expect(row.latitude).toBeCloseTo(9.0765);
    expect(row.longitude).toBeCloseTo(7.3986);
    expect(row.title).toBe('Abuja-Kaduna hotspot');
    expect(row.description).toBe('Documented hotspot');
    expect(row.severity).toBe('critical');
    expect(row.source).toBe('security_advisory');
    expect(row.expiresAt).toBeNull();
    expect(row.outOfBoundsWarning).toBe(false);
  });

  it('parses a valid ISO expiresAt into a Date', () => {
    const row = parseOne({ expiresAt: '2027-01-31T23:59:00.000Z' });
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(row.expiresAt?.toISOString()).toBe('2027-01-31T23:59:00.000Z');
  });

  it('treats blank optional category/description as null', () => {
    const row = parseOne({ category: '', description: '' });
    expect(row.category).toBeNull();
    expect(row.description).toBeNull();
  });

  it('parses RFC 4180 quoted fields containing commas', () => {
    const csvText =
      `${MARKER_IMPORT_CSV_HEADERS.join(',')}\n` +
      'kidnapping_hotspot,"Km 84, Abuja-Kaduna Road",9.0765,7.3986,"Title, with comma",,critical,security_advisory,\n';
    const { rows, errors } = parseMarkersImportCsv(csvText);
    expect(errors).toHaveLength(0);
    expect(rows[0]?.category).toBe('Km 84, Abuja-Kaduna Road');
    expect(rows[0]?.title).toBe('Title, with comma');
  });

  it('flags coordinates outside the Nigeria bounding box as a warning, not an error (AC #2)', () => {
    const row = parseOne({ latitude: '51.5074', longitude: '-0.1278' });
    expect(row.outOfBoundsWarning).toBe(true);
    expect(row.title).toBe('Abuja-Kaduna hotspot');
  });
});

describe('parseMarkersImportCsv — row validation (AC: invalid rows reported with row number + reason)', () => {
  it('reports every missing required field in one row reason', () => {
    const { rows, errors } = parseMarkersImportCsv(
      toCsv([
        validFields({
          markerType: '',
          severity: '',
          source: '',
          title: '',
          latitude: '',
          longitude: '',
        }),
      ])
    );

    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.row).toBe(1);
    for (const fragment of [
      'markerType is required',
      'severity is required',
      'source is required',
      'title is required',
      'latitude is required and must be a number',
      'longitude is required and must be a number',
    ]) {
      expect(errors[0]!.reason).toContain(fragment);
    }
  });

  it('rejects marker types that are not importable (e.g. safe_zone)', () => {
    const { errors } = parseMarkersImportCsv(toCsv([validFields({ markerType: 'safe_zone' })]));
    expect(errors[0]!.reason).toContain('markerType must be one of');
  });

  it('rejects sources an admin CSV should not claim (e.g. user_report)', () => {
    const { errors } = parseMarkersImportCsv(toCsv([validFields({ source: 'user_report' })]));
    expect(errors[0]!.reason).toContain('source must be one of');
  });

  it('rejects an unknown severity', () => {
    const { errors } = parseMarkersImportCsv(toCsv([validFields({ severity: 'extreme' })]));
    expect(errors[0]!.reason).toContain('severity must be one of');
  });

  it('rejects out-of-range latitude and longitude', () => {
    const { errors } = parseMarkersImportCsv(
      toCsv([validFields({ latitude: '91', longitude: '181' })])
    );
    expect(errors[0]!.reason).toContain('latitude must be between -90 and 90');
    expect(errors[0]!.reason).toContain('longitude must be between -180 and 180');
  });

  it('rejects a non-numeric latitude', () => {
    const { errors } = parseMarkersImportCsv(toCsv([validFields({ latitude: 'north' })]));
    expect(errors[0]!.reason).toContain('latitude is required and must be a number');
  });

  it('rejects an unparseable expiresAt', () => {
    const { errors } = parseMarkersImportCsv(toCsv([validFields({ expiresAt: 'not-a-date' })]));
    expect(errors[0]!.reason).toContain('expiresAt must be a parseable ISO 8601 date-time');
  });

  it('numbers rows by data position, excluding the header, across valid and invalid rows', () => {
    const { rows, errors } = parseMarkersImportCsv(
      toCsv([validFields(), validFields({ title: '' }), validFields({ title: 'Third' })])
    );
    expect(rows.map((r) => r.row)).toEqual([1, 3]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.row).toBe(2);
  });

  it('returns no rows and no errors for a header-only file', () => {
    const { rows, errors } = parseMarkersImportCsv(`${MARKER_IMPORT_CSV_HEADERS.join(',')}\n`);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('throws only when the file itself is not parseable CSV (route turns this into a 400)', () => {
    expect(() =>
      parseMarkersImportCsv('markerType,title\nkidnapping_hotspot,foo"bar\n')
    ).toThrow(/Invalid Opening Quote/);
  });
});

// ────────────────────────────────────────────────────────────
// Duplicate detection
// ────────────────────────────────────────────────────────────
describe('findDuplicateCandidates (AC: duplicates within 50m flagged)', () => {
  it('flags a same-type active marker within ~50m and reports the distance', async () => {
    hoisted.mockFindMany.mockResolvedValue([
      {
        id: 'existing-1',
        title: 'Existing hotspot',
        markerType: 'kidnapping_hotspot',
        latitude: 9.0765,
        longitude: 7.3986,
      },
    ]);
    const [row] = parseMarkersImportCsv(
      toCsv([validFields({ latitude: '9.0766', longitude: '7.3987' })])
    ).rows;

    const duplicates = await findDuplicateCandidates([row!]);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      row: 1,
      title: 'Abuja-Kaduna hotspot',
      markerType: 'kidnapping_hotspot',
      existingMarkerId: 'existing-1',
      existingTitle: 'Existing hotspot',
    });
    expect(duplicates[0]!.distanceKm).toBeGreaterThan(0);
    expect(duplicates[0]!.distanceKm).toBeLessThan(0.05);
  });

  it('returns no candidates when the nearby lookup finds nothing', async () => {
    hoisted.mockFindMany.mockResolvedValue([]);
    const rows = parseMarkersImportCsv(toCsv([validFields()])).rows;
    expect(await findDuplicateCandidates(rows)).toEqual([]);
  });

  it('checks each row independently (one lookup per row)', async () => {
    hoisted.mockFindMany.mockResolvedValue([]);
    const rows = parseMarkersImportCsv(
      toCsv([validFields(), validFields({ title: 'Second' })])
    ).rows;
    await findDuplicateCandidates(rows);
    expect(hoisted.mockFindMany).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────
// Commit + audit log
// ────────────────────────────────────────────────────────────
describe('bulkImportMarkers (AC: all-or-nothing commit + audit log)', () => {
  function twoRows(): CsvImportRow[] {
    return parseMarkersImportCsv(toCsv([validFields(), validFields({ title: 'Second' })])).rows;
  }

  it('inserts a marker per row and records the import audit row', async () => {
    const result = await bulkImportMarkers(twoRows(), new Set(), 'admin-1', 'markers.csv');

    expect(result).toEqual({ created: 2, skipped: 0 });
    expect(hoisted.mockTransaction).toHaveBeenCalledTimes(1);
    expect(hoisted.mockTxInsert.mock.calls[0]![0]).toBe(mapMarkers);
    expect(hoisted.mockTxInsert.mock.calls[1]![0]).toBe(mapMarkerImports);

    const insertedMarkers = hoisted.mockTxValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedMarkers).toHaveLength(2);
    expect(insertedMarkers[0]!.createdBy).toBe('admin-1');

    const auditRow = hoisted.mockTxValues.mock.calls[1]![0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({
      uploadedBy: 'admin-1',
      fileName: 'markers.csv',
      rowCount: 2,
      createdCount: 2,
      skippedDuplicateCount: 0,
    });
  });

  it('marks bulk-imported markers verified with weight 10 (AC #6: admin data is trusted)', async () => {
    await bulkImportMarkers(twoRows(), new Set(), 'admin-1', 'markers.csv');

    const insertedMarkers = hoisted.mockTxValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    for (const marker of insertedMarkers) {
      expect(marker.verificationStatus).toBe('verified');
      expect(marker.verificationWeight).toBe(10);
      expect(marker.isActive).toBe(true);
    }
  });

  it('skips the row numbers the admin chose and counts them', async () => {
    const result = await bulkImportMarkers(twoRows(), new Set([2]), 'admin-1', 'markers.csv');

    expect(result).toEqual({ created: 1, skipped: 1 });
    const insertedMarkers = hoisted.mockTxValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedMarkers).toHaveLength(1);
    expect(insertedMarkers[0]!.title).toBe('Abuja-Kaduna hotspot');

    const auditRow = hoisted.mockTxValues.mock.calls[1]![0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({ rowCount: 2, createdCount: 1, skippedDuplicateCount: 1 });
  });

  it('does not count a skipRows entry that matches no file row (T-030 regression)', async () => {
    // A client could send a row number that isn't in the file (stale review
    // state, off-by-one, hand-crafted request). It must not inflate `skipped`
    // or the audit count -- created + skipped must equal the file's row count.
    const result = await bulkImportMarkers(twoRows(), new Set([999]), 'admin-1', 'markers.csv');

    expect(result).toEqual({ created: 2, skipped: 0 });
    const insertedMarkers = hoisted.mockTxValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedMarkers).toHaveLength(2);

    const auditRow = hoisted.mockTxValues.mock.calls[1]![0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({ rowCount: 2, createdCount: 2, skippedDuplicateCount: 0 });
    expect((auditRow.createdCount as number) + (auditRow.skippedDuplicateCount as number)).toBe(
      auditRow.rowCount
    );
  });

  it('counts only in-file skips when the set mixes real and phantom row numbers (T-030 regression)', async () => {
    const result = await bulkImportMarkers(twoRows(), new Set([2, 999]), 'admin-1', 'markers.csv');

    expect(result).toEqual({ created: 1, skipped: 1 });
    const auditRow = hoisted.mockTxValues.mock.calls[1]![0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({ rowCount: 2, createdCount: 1, skippedDuplicateCount: 1 });
  });

  it('still logs the import when every row is skipped', async () => {
    const result = await bulkImportMarkers(twoRows(), new Set([1, 2]), 'admin-1', 'markers.csv');

    expect(result).toEqual({ created: 0, skipped: 2 });
    expect(hoisted.mockTxInsert).toHaveBeenCalledTimes(1);
    expect(hoisted.mockTxInsert.mock.calls[0]![0]).toBe(mapMarkerImports);
    const auditRow = hoisted.mockTxValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({ createdCount: 0, skippedDuplicateCount: 2 });
  });

  it('carries the expiry date through to the inserted marker', async () => {
    const rows = parseMarkersImportCsv(
      toCsv([validFields({ expiresAt: '2027-01-31T23:59:00.000Z' })])
    ).rows;
    await bulkImportMarkers(rows, new Set(), 'admin-1', 'markers.csv');

    const insertedMarkers = hoisted.mockTxValues.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedMarkers[0]!.expiresAt).toBeInstanceOf(Date);
  });
});
