/**
 * Map Marker Service — manages safety map markers and user interactions.
 *
 * Handles:
 *   - Admin: marker CRUD (create, read, update, delete)
 *   - User: marker interactions (confirm, dispute, reclassify per M-14)
 *   - Proximity queries for route safety alerts
 */
import { v4 as uuidv4 } from 'uuid';
import { parse } from 'csv-parse/sync';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { mapMarkers, mapMarkerInteractions, mapMarkerImports } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type MarkerType = typeof mapMarkers.$inferSelect['markerType'];
type VerificationStatus = typeof mapMarkers.$inferSelect['verificationStatus'];
type Severity = typeof mapMarkers.$inferSelect['severity'];
type MarkerSource = typeof mapMarkers.$inferSelect['source'];
type MarkerAction = typeof mapMarkerInteractions.$inferSelect['action'];

const VALID_MARKER_TYPES: readonly string[] = [
  'kidnapping_hotspot', 'checkpoint', 'high_risk_zone',
  'recent_attack', 'safe_zone', 'admin_marker',
];

const VALID_SOURCES: readonly string[] = [
  'user_report', 'admin_manual', 'news_archive',
  'police_report', 'security_advisory', 'partner_data',
];

const VALID_SEVERITIES: readonly string[] = ['low', 'medium', 'high', 'critical'];

const VALID_VERIFICATION_STATUSES: readonly string[] = [
  'unverified', 'partially_confirmed', 'verified', 'disputed', 'rejected',
];

export interface MarkerCreateInput {
  incidentId?: string;
  markerType: string;
  category?: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  severity: string;
  source: string;
  createdBy: string;
  expiresAt?: Date;
}

export interface MarkerFilter {
  markerType?: string;
  verificationStatus?: string;
  severity?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface InteractionCreateInput {
  markerId: string;
  userId: string;
  action: string;
  notes?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function asMarkerType(s: string): MarkerType | null {
  return VALID_MARKER_TYPES.includes(s) ? (s as MarkerType) : null;
}

function asSource(s: string): MarkerSource | null {
  return VALID_SOURCES.includes(s) ? (s as MarkerSource) : null;
}

function asSeverity(s: string): Severity | null {
  return VALID_SEVERITIES.includes(s) ? (s as Severity) : null;
}

const WEIGHT_ADJUSTMENTS: Record<string, number> = {
  confirm: 1,
  dispute_not_there: -3,
  reclassify_police: 1,
  reclassify_suspicious: 1,
};

// ────────────────────────────────────────────────────────────
// Marker CRUD (Admin)
// ────────────────────────────────────────────────────────────

/**
 * Create a new map marker (admin or system).
 */
export async function createMarker(
  input: MarkerCreateInput
): Promise<typeof mapMarkers.$inferSelect> {
  const markerType = asMarkerType(input.markerType);
  if (!markerType) {
    throw Object.assign(
      new Error(`Invalid marker type: ${input.markerType}`),
      { statusCode: 400 }
    );
  }

  const source = asSource(input.source);
  if (!source) {
    throw Object.assign(
      new Error(`Invalid source: ${input.source}`),
      { statusCode: 400 }
    );
  }

  const severity = asSeverity(input.severity);
  if (!severity) {
    throw Object.assign(
      new Error(`Invalid severity: ${input.severity}`),
      { statusCode: 400 }
    );
  }

  const [marker] = await db
    .insert(mapMarkers)
    .values({
      id: uuidv4(),
      incidentId: input.incidentId ?? null,
      markerType,
      category: input.category ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      title: input.title,
      description: input.description ?? null,
      severity,
      source,
      createdBy: input.createdBy,
      verificationStatus: 'unverified',
      verificationWeight: 0,
      isActive: true,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  return marker;
}

/**
 * Get a marker by ID.
 */
export async function getMarkerById(
  markerId: string
): Promise<typeof mapMarkers.$inferSelect | null> {
  const marker = await db.query.mapMarkers.findFirst({
    where: eq(mapMarkers.id, markerId),
  });
  return marker ?? null;
}

/**
 * List markers with optional filters.
 */
export async function getAllMarkers(
  filter: MarkerFilter = {}
): Promise<typeof mapMarkers.$inferSelect[]> {
  const conditions = [];

  if (filter.markerType) {
    const t = asMarkerType(filter.markerType);
    if (t) conditions.push(eq(mapMarkers.markerType, t));
  }

  if (filter.verificationStatus && VALID_VERIFICATION_STATUSES.includes(filter.verificationStatus)) {
    conditions.push(eq(mapMarkers.verificationStatus, filter.verificationStatus as VerificationStatus));
  }

  if (filter.severity) {
    const s = asSeverity(filter.severity);
    if (s) conditions.push(eq(mapMarkers.severity, s));
  }

  if (filter.isActive !== undefined) {
    conditions.push(eq(mapMarkers.isActive, filter.isActive));
  }

  return db.query.mapMarkers.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(mapMarkers.createdAt),
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  });
}

/**
 * Get active markers near a location (for route safety display).
 */
export async function getMarkersNearLocation(
  latitude: number,
  longitude: number,
  radiusKm = 10
): Promise<typeof mapMarkers.$inferSelect[]> {
  const delta = radiusKm / 111;

  return db.query.mapMarkers.findMany({
    where: and(
      eq(mapMarkers.isActive, true),
      sql`${mapMarkers.latitude} BETWEEN ${latitude - delta} AND ${latitude + delta}`,
      sql`${mapMarkers.longitude} BETWEEN ${longitude - delta} AND ${longitude + delta}`
    ),
    orderBy: desc(mapMarkers.verificationWeight),
    limit: 100,
  });
}

/**
 * Update a marker (admin-only).
 */
export async function updateMarker(
  markerId: string,
  updates: {
    title?: string;
    description?: string;
    severity?: string;
    verificationStatus?: string;
    isActive?: boolean;
  }
): Promise<typeof mapMarkers.$inferSelect> {
  const marker = await db.query.mapMarkers.findFirst({
    where: eq(mapMarkers.id, markerId),
  });

  if (!marker) {
    throw Object.assign(new Error('Marker not found'), { statusCode: 404 });
  }

  // Validate optional fields before using them.
  if (updates.severity !== undefined && !asSeverity(updates.severity)) {
    throw Object.assign(new Error(`Invalid severity: ${updates.severity}`), { statusCode: 400 });
  }
  if (updates.verificationStatus !== undefined && !VALID_VERIFICATION_STATUSES.includes(updates.verificationStatus)) {
    throw Object.assign(new Error(`Invalid verification status: ${updates.verificationStatus}`), { statusCode: 400 });
  }

  const [updated] = await db
    .update(mapMarkers)
    .set({
      updatedAt: new Date(),
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.severity !== undefined ? { severity: asSeverity(updates.severity)! } : {}),
      ...(updates.verificationStatus !== undefined
        ? { verificationStatus: updates.verificationStatus as VerificationStatus }
        : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
    })
    .where(eq(mapMarkers.id, markerId))
    .returning();

  return updated;
}

/**
 * Delete (deactivate) a marker (admin-only).
 */
export async function deactivateMarker(markerId: string): Promise<void> {
  const marker = await db.query.mapMarkers.findFirst({
    where: eq(mapMarkers.id, markerId),
  });

  if (!marker) {
    throw Object.assign(new Error('Marker not found'), { statusCode: 404 });
  }

  await db
    .update(mapMarkers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mapMarkers.id, markerId));
}

// ────────────────────────────────────────────────────────────
// User Interactions (M-14)
// ────────────────────────────────────────────────────────────

/**
 * Record a user interaction with a marker (confirm, dispute, reclassify).
 * Adjusts the marker's verification weight based on the action.
 */
export async function interactWithMarker(
  input: InteractionCreateInput
): Promise<typeof mapMarkerInteractions.$inferSelect> {
  // Validate marker exists.
  const marker = await db.query.mapMarkers.findFirst({
    where: eq(mapMarkers.id, input.markerId),
  });

  if (!marker) {
    throw Object.assign(new Error('Marker not found'), { statusCode: 404 });
  }

  if (!marker.isActive) {
    throw Object.assign(new Error('Cannot interact with an inactive marker'), { statusCode: 400 });
  }

  const validActions = ['confirm', 'dispute_not_there', 'reclassify_police', 'reclassify_suspicious'];
  if (!validActions.includes(input.action)) {
    throw Object.assign(
      new Error(`Invalid action: ${input.action}. Valid: ${validActions.join(', ')}`),
      { statusCode: 400 }
    );
  }

  // Record interaction and adjust marker weight within a transaction.
  const [interaction] = await db.transaction(async (tx) => {
    const weightDelta = WEIGHT_ADJUSTMENTS[input.action] ?? 0;

    if (weightDelta !== 0) {
      await tx
        .update(mapMarkers)
        .set({
          verificationWeight: marker.verificationWeight + weightDelta,
          updatedAt: new Date(),
          // Auto-update status based on weight thresholds.
          verificationStatus:
            marker.verificationWeight + weightDelta >= 10
              ? 'verified'
              : marker.verificationWeight + weightDelta <= -5
                ? 'disputed'
                : marker.verificationStatus,
        })
        .where(eq(mapMarkers.id, input.markerId));
    }

    const [interaction] = await tx
      .insert(mapMarkerInteractions)
      .values({
        id: uuidv4(),
        markerId: input.markerId,
        userId: input.userId,
        action: input.action as MarkerAction,
        notes: input.notes ?? null,
      })
      .returning();

    return [interaction];
  });

  return interaction;
}

/**
 * Get all interactions for a marker.
 */
export async function getMarkerInteractions(
  markerId: string,
  limit = 50
): Promise<typeof mapMarkerInteractions.$inferSelect[]> {
  return db.query.mapMarkerInteractions.findMany({
    where: eq(mapMarkerInteractions.markerId, markerId),
    orderBy: desc(mapMarkerInteractions.createdAt),
    limit,
  });
}

// ────────────────────────────────────────────────────────────
// CSV Bulk Import (A-09) — per features.md's A-09 acceptance criteria and
// screens.md's Screen 14 "Bulk Import" states.
// ────────────────────────────────────────────────────────────

/** Column order for both the downloadable template and upload parsing. */
export const MARKER_IMPORT_CSV_HEADERS = [
  'markerType',
  'category',
  'latitude',
  'longitude',
  'title',
  'description',
  'severity',
  'source',
  'expiresAt',
] as const;

/** Bounds processing time and prevents an accidental mass-upload (AC #3). */
export const MARKER_IMPORT_MAX_ROWS = 500;

/** Radius (km) within which a same-type marker is flagged as a likely duplicate (AC #5: ~50m). */
const DUPLICATE_RADIUS_KM = 0.05;

// CSV import is admin-curated data only -- 'user_report' (mobile incident
// reports) and 'partner_data' aren't things an admin uploading a CSV would
// ever legitimately claim as the source, so both are excluded from the
// importable set even though they're valid `mapMarkers.source` values
// elsewhere in the system.
const CSV_IMPORTABLE_SOURCES: readonly string[] = [
  'news_archive',
  'police_report',
  'security_advisory',
  'admin_manual',
];

// Same rationale as above: 'safe_zone' isn't a hotspot/checkpoint/hazard
// marker (the thing this bulk-import mechanism exists to pre-seed per
// README's Cold-Start Strategy) and 'admin_marker' covers the generic case.
const CSV_IMPORTABLE_MARKER_TYPES: readonly string[] = [
  'kidnapping_hotspot',
  'checkpoint',
  'high_risk_zone',
  'recent_attack',
  'admin_marker',
];

// Rough bounding box around Nigeria -- used only as a soft WARNING (AC #2:
// "flagged as a warning, not a hard reject") since SafePass's own corridors
// (e.g. cross-border routes) could legitimately fall just outside it, and a
// hard reject here would be more annoying than helpful for an otherwise
// valid row.
const NIGERIA_BOUNDS = { minLat: 4, maxLat: 14, minLng: 2.5, maxLng: 15.5 };

export interface CsvImportRow {
  /** 1-indexed data row number (excludes the header row) -- shown to the admin in error/duplicate messages. */
  row: number;
  markerType: MarkerType;
  category: string | null;
  latitude: number;
  longitude: number;
  title: string;
  description: string | null;
  severity: Severity;
  source: MarkerSource;
  expiresAt: Date | null;
  /** Set when latitude/longitude fall outside Nigeria's rough bounding box -- informational only, never blocks import. */
  outOfBoundsWarning: boolean;
}

export interface CsvRowError {
  row: number;
  reason: string;
}

export interface CsvValidationResult {
  rows: CsvImportRow[];
  errors: CsvRowError[];
}

export interface DuplicateCandidate {
  row: number;
  title: string;
  markerType: MarkerType;
  existingMarkerId: string;
  existingTitle: string;
  distanceKm: number;
}

/**
 * CSV-quotes a single field per RFC 4180: wraps in double quotes (escaping
 * any embedded double quote as "") whenever the value contains a comma,
 * quote, or newline. Needed even for our own hardcoded template below --
 * the example title below legitimately contains a comma.
 */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Returns the downloadable CSV template: headers + one worked example row
 * (AC #1). Plain string, not a stream -- the expected file size (a handful
 * of KB even at the 500-row cap) doesn't justify streaming.
 */
export function buildMarkerImportCsvTemplate(): string {
  const exampleRow = [
    'kidnapping_hotspot',
    'Highway corridor',
    '9.0765',
    '7.3986',
    'Example: Kilometer 84, Abuja-Kaduna Road',
    'Documented kidnapping hotspot per security advisory -- replace with real data before import.',
    'critical',
    'security_advisory',
    '',
  ];
  return [
    MARKER_IMPORT_CSV_HEADERS.join(','),
    exampleRow.map(csvField).join(','),
  ].join('\n') + '\n';
}

/**
 * Parses and validates a CSV file's contents against the A-09 column spec.
 * Never throws on malformed row DATA (collected as row errors instead) --
 * only throws if the file itself isn't parseable CSV at all (e.g. binary
 * garbage), which the route layer turns into a 400.
 */
export function parseMarkersImportCsv(csvText: string): CsvValidationResult {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const rows: CsvImportRow[] = [];
  const errors: CsvRowError[] = [];

  records.forEach((record, index) => {
    const row = index + 1; // 1-indexed data row, excluding the header line
    const reasons: string[] = [];

    const markerTypeRaw = record.markerType?.trim();
    if (!markerTypeRaw) reasons.push('markerType is required');
    else if (!CSV_IMPORTABLE_MARKER_TYPES.includes(markerTypeRaw)) {
      reasons.push(`markerType must be one of: ${CSV_IMPORTABLE_MARKER_TYPES.join(', ')}`);
    }

    const severityRaw = record.severity?.trim();
    if (!severityRaw) reasons.push('severity is required');
    else if (!VALID_SEVERITIES.includes(severityRaw)) {
      reasons.push(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }

    const sourceRaw = record.source?.trim();
    if (!sourceRaw) reasons.push('source is required');
    else if (!CSV_IMPORTABLE_SOURCES.includes(sourceRaw)) {
      reasons.push(`source must be one of: ${CSV_IMPORTABLE_SOURCES.join(', ')}`);
    }

    const title = record.title?.trim();
    if (!title) reasons.push('title is required');

    const latitude = Number(record.latitude);
    if (record.latitude === undefined || record.latitude === '' || Number.isNaN(latitude)) {
      reasons.push('latitude is required and must be a number');
    } else if (latitude < -90 || latitude > 90) {
      reasons.push('latitude must be between -90 and 90');
    }

    const longitude = Number(record.longitude);
    if (record.longitude === undefined || record.longitude === '' || Number.isNaN(longitude)) {
      reasons.push('longitude is required and must be a number');
    } else if (longitude < -180 || longitude > 180) {
      reasons.push('longitude must be between -180 and 180');
    }

    let expiresAt: Date | null = null;
    if (record.expiresAt && record.expiresAt.trim() !== '') {
      const parsed = new Date(record.expiresAt.trim());
      if (Number.isNaN(parsed.getTime())) {
        reasons.push('expiresAt must be a parseable ISO 8601 date-time if present');
      } else {
        expiresAt = parsed;
      }
    }

    if (reasons.length > 0) {
      errors.push({ row, reason: reasons.join('; ') });
      return;
    }

    const outOfBoundsWarning =
      latitude < NIGERIA_BOUNDS.minLat ||
      latitude > NIGERIA_BOUNDS.maxLat ||
      longitude < NIGERIA_BOUNDS.minLng ||
      longitude > NIGERIA_BOUNDS.maxLng;

    rows.push({
      row,
      markerType: markerTypeRaw as MarkerType,
      category: record.category?.trim() || null,
      latitude,
      longitude,
      title: title!,
      description: record.description?.trim() || null,
      severity: severityRaw as Severity,
      source: sourceRaw as MarkerSource,
      expiresAt,
      outOfBoundsWarning,
    });
  });

  return { rows, errors };
}

/**
 * Flags rows that are likely duplicates of an existing active marker: same
 * markerType within DUPLICATE_RADIUS_KM (~50m) (AC #5). Uses the same
 * bounding-box approach as getMarkersNearLocation rather than a true
 * geospatial index -- fine at this radius/row-count scale (500 rows max,
 * each a handful of lookups).
 */
export async function findDuplicateCandidates(
  rows: CsvImportRow[]
): Promise<DuplicateCandidate[]> {
  const delta = DUPLICATE_RADIUS_KM / 111; // ~111km per degree of latitude
  const duplicates: DuplicateCandidate[] = [];

  for (const row of rows) {
    const nearby = await db.query.mapMarkers.findMany({
      where: and(
        eq(mapMarkers.isActive, true),
        eq(mapMarkers.markerType, row.markerType),
        sql`${mapMarkers.latitude} BETWEEN ${row.latitude - delta} AND ${row.latitude + delta}`,
        sql`${mapMarkers.longitude} BETWEEN ${row.longitude - delta} AND ${row.longitude + delta}`
      ),
      limit: 1,
    });

    if (nearby.length > 0) {
      const match = nearby[0];
      // Rough planar distance -- adequate at ~50m scale, no need for haversine.
      const dLat = (row.latitude - match.latitude) * 111;
      const dLng = (row.longitude - match.longitude) * 111 * Math.cos((row.latitude * Math.PI) / 180);
      duplicates.push({
        row: row.row,
        title: row.title,
        markerType: row.markerType,
        existingMarkerId: match.id,
        existingTitle: match.title,
        distanceKm: Math.sqrt(dLat * dLat + dLng * dLng),
      });
    }
  }

  return duplicates;
}

/**
 * Commits a validated (and duplicate-reviewed) set of rows as new markers,
 * skipping any row numbers the admin chose to skip as duplicates, then
 * records the import for audit purposes (AC #7).
 */
export async function bulkImportMarkers(
  rows: CsvImportRow[],
  skipRows: Set<number>,
  createdBy: string,
  fileName: string
): Promise<{ created: number; skipped: number }> {
  const toCreate = rows.filter((r) => !skipRows.has(r.row));

  await db.transaction(async (tx) => {
    if (toCreate.length > 0) {
      await tx.insert(mapMarkers).values(
        toCreate.map((r) => ({
          id: uuidv4(),
          markerType: r.markerType,
          category: r.category,
          latitude: r.latitude,
          longitude: r.longitude,
          title: r.title,
          description: r.description,
          severity: r.severity,
          source: r.source,
          createdBy,
          // Admin-sourced bulk data is trusted by default (AC #6), matching
          // README's cold-start Layer 3 model ("Verified -- admin-approved").
          verificationStatus: 'verified' as VerificationStatus,
          verificationWeight: 10,
          isActive: true,
          expiresAt: r.expiresAt,
        }))
      );
    }

    await tx.insert(mapMarkerImports).values({
      id: uuidv4(),
      uploadedBy: createdBy,
      fileName,
      rowCount: rows.length,
      createdCount: toCreate.length,
      skippedDuplicateCount: skipRows.size,
    });
  });

  return { created: toCreate.length, skipped: skipRows.size };
}
