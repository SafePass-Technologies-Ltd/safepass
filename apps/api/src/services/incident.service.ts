/**
 * Incident Service — manages incident reporting, verification workflow,
 * and admin incident management.
 *
 * Handles:
 *   - User incident reporting (9 incident types per M-13)
 *   - Admin verification workflow (approve/reject/review)
 *   - Incident querying and filtering
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { incidents } from '../db/schema';
import type { Location } from '../db/schema/types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type IncidentType = typeof incidents.$inferSelect['incidentType'];
type VerificationStatus = typeof incidents.$inferSelect['verificationStatus'];
type Severity = typeof incidents.$inferSelect['severity'];

const VALID_INCIDENT_TYPES: readonly string[] = [
  'kidnapping', 'armed_robbery', 'accident', 'roadblock',
  'police_checkpoint', 'fake_checkpoint', 'bad_road',
  'vehicle_breakdown', 'suspicious_activity',
];

const VALID_VERIFICATION_STATUSES: readonly string[] = [
  'unverified', 'partially_confirmed', 'verified', 'disputed', 'rejected',
];

const VALID_SEVERITIES: readonly string[] = [
  'low', 'medium', 'high', 'critical',
];

export interface IncidentCreateInput {
  reporterId: string;
  tripId?: string;
  incidentType: string;
  location: Location;
  description: string;
  photoUrl?: string;
}

export interface IncidentFilter {
  incidentType?: string;
  verificationStatus?: string;
  severity?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function asIncidentType(s: string): IncidentType | null {
  return VALID_INCIDENT_TYPES.includes(s) ? (s as IncidentType) : null;
}

function asVerificationStatus(s: string): VerificationStatus | null {
  return VALID_VERIFICATION_STATUSES.includes(s) ? (s as VerificationStatus) : null;
}

// ────────────────────────────────────────────────────────────
// Create (User-facing)
// ────────────────────────────────────────────────────────────

/**
 * Report a new incident. Only the reporter (authenticated user) can create.
 * Defaults to 'unverified' status with 0 verification weight.
 */
export async function createIncident(
  input: IncidentCreateInput
): Promise<typeof incidents.$inferSelect> {
  const incidentType = asIncidentType(input.incidentType);
  if (!incidentType) {
    throw Object.assign(
      new Error(`Invalid incident type: ${input.incidentType}`),
      { statusCode: 400 }
    );
  }

  const [incident] = await db
    .insert(incidents)
    .values({
      id: uuidv4(),
      reporterId: input.reporterId,
      tripId: input.tripId ?? null,
      incidentType,
      location: input.location,
      description: input.description,
      photoUrl: input.photoUrl ?? null,
      verificationStatus: 'unverified',
      verificationWeight: 0,
      severity: 'medium',
      isActive: true,
    })
    .returning();

  return incident;
}

// ────────────────────────────────────────────────────────────
// Read
// ────────────────────────────────────────────────────────────

/**
 * Get a single incident by ID.
 */
export async function getIncidentById(
  incidentId: string
): Promise<typeof incidents.$inferSelect | null> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  });
  return incident ?? null;
}

/**
 * List incidents for a specific user (their reports).
 */
export async function getUserIncidents(
  userId: string,
  filter: IncidentFilter = {}
): Promise<typeof incidents.$inferSelect[]> {
  const conditions = [eq(incidents.reporterId, userId)];

  if (filter.incidentType) {
    const t = asIncidentType(filter.incidentType);
    if (t) conditions.push(eq(incidents.incidentType, t));
  }

  if (filter.isActive !== undefined) {
    conditions.push(eq(incidents.isActive, filter.isActive));
  }

  return db.query.incidents.findMany({
    where: and(...conditions),
    orderBy: desc(incidents.createdAt),
    limit: filter.limit ?? 50,
    offset: filter.offset ?? 0,
  });
}

/**
 * List all incidents (admin-facing) with optional filters.
 */
export async function getAllIncidents(
  filter: IncidentFilter = {}
): Promise<typeof incidents.$inferSelect[]> {
  const conditions = [];

  if (filter.incidentType) {
    const t = asIncidentType(filter.incidentType);
    if (t) conditions.push(eq(incidents.incidentType, t));
  }

  if (filter.verificationStatus) {
    const s = asVerificationStatus(filter.verificationStatus);
    if (s) conditions.push(eq(incidents.verificationStatus, s));
  }

  if (filter.severity && VALID_SEVERITIES.includes(filter.severity)) {
    conditions.push(eq(incidents.severity, filter.severity as Severity));
  }

  if (filter.isActive !== undefined) {
    conditions.push(eq(incidents.isActive, filter.isActive));
  }

  return db.query.incidents.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(incidents.createdAt),
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  });
}

/**
 * Get incidents near a location (for proximity-based safety alerts).
 * Uses a simple bounding box approach for MVP — PostGIS spatial queries
 * can be added in a future iteration.
 */
export async function getIncidentsNearLocation(
  latitude: number,
  longitude: number,
  radiusKm = 5
): Promise<typeof incidents.$inferSelect[]> {
  // Approximate: 1 degree ≈ 111 km.
  const delta = radiusKm / 111;

  return db.query.incidents.findMany({
    where: and(
      eq(incidents.isActive, true),
      // Filter via raw SQL to access JSONB fields.
      sql`(${incidents.location}->>'latitude')::float BETWEEN ${latitude - delta} AND ${latitude + delta}`,
      sql`(${incidents.location}->>'longitude')::float BETWEEN ${longitude - delta} AND ${longitude + delta}`
    ),
    orderBy: desc(incidents.createdAt),
    limit: 50,
  });
}

// ────────────────────────────────────────────────────────────
// Admin: Verification Workflow
// ────────────────────────────────────────────────────────────

/**
 * Update an incident's verification status (admin-only).
 * Each status change adjusts the verification weight:
 *   verified → +10, partially_confirmed → +3, disputed → -2, rejected → -5
 */
export async function updateVerificationStatus(
  incidentId: string,
  newStatus: string,
  adminNotes?: string
): Promise<typeof incidents.$inferSelect> {
  const status = asVerificationStatus(newStatus);
  if (!status) {
    throw Object.assign(
      new Error(`Invalid verification status: ${newStatus}`),
      { statusCode: 400 }
    );
  }

  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  });

  if (!incident) {
    throw Object.assign(new Error('Incident not found'), { statusCode: 404 });
  }

  // Weight adjustment based on new status.
  const weightDelta: Record<string, number> = {
    verified: 10,
    partially_confirmed: 3,
    disputed: -2,
    rejected: -5,
    unverified: 0,
  };

  const newWeight = incident.verificationWeight + (weightDelta[status] ?? 0);

  const [updated] = await db
    .update(incidents)
    .set({
      verificationStatus: status,
      verificationWeight: newWeight,
      adminNotes: adminNotes ?? incident.adminNotes,
      updatedAt: new Date(),
      ...(status === 'rejected' ? { isActive: false } : {}),
    })
    .where(eq(incidents.id, incidentId))
    .returning();

  return updated;
}

/**
 * Mark an incident as inactive (soft delete — admin-only).
 */
export async function deactivateIncident(
  incidentId: string
): Promise<typeof incidents.$inferSelect> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  });

  if (!incident) {
    throw Object.assign(new Error('Incident not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(incidents)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(incidents.id, incidentId))
    .returning();

  return updated;
}
