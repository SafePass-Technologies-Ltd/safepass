/**
 * Map Marker Service — manages safety map markers and user interactions.
 *
 * Handles:
 *   - Admin: marker CRUD (create, read, update, delete)
 *   - User: marker interactions (confirm, dispute, reclassify per M-14)
 *   - Proximity queries for route safety alerts
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { mapMarkers, mapMarkerInteractions } from '../db/schema';

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
