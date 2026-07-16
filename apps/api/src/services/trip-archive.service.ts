/**
 * Trip Archive Service — A-26 "Trip Persistence & Archival (Yearly
 * Compliance Log + Route Replay)".
 *
 * Implements the two durable PostgreSQL writes described in
 * docs/SafePass/architecture.md's "Trip Data Persistence" section, both
 * decoupled from the high-frequency GPS ping path:
 *
 *   Tier 2 — trip_summaries: one row per trip, written once at
 *   completeTrip/cancelTrip (see computeAndWriteTripSummary).
 *
 *   Tier 3 — trip_location_history: sampled route breadcrumbs, written via
 *   an in-process batched/queued buffer (see sampleGpsPoint +
 *   flushBreadcrumbBuffer) rather than one row per raw GPS ping. A
 *   significant-change filter (distance / heading / elapsed time) bounds
 *   storage to a small, predictable number of rows per trip.
 *
 * Neither write path depends on DynamoDB's fire-and-forget tolerance
 * (dynamo.service.ts's saveTripLocation swallows failures by design for the
 * live-view path only) -- this service is the durable system of record for
 * yearly compliance analysis and dispute replay.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  trips,
  tripSummaries,
  tripLocationHistory,
  emergencyEvents,
  escalations,
  incidents,
  messages,
} from '../db/schema';

// ────────────────────────────────────────────────────────────
// Significant-change sampling thresholds
//
// A breadcrumb point is only persisted if it differs from the last stored
// point for its trip by at least one of these thresholds. Values are a
// deliberate cost/fidelity tradeoff (see architecture.md's Design notes) --
// not derived from a specific product requirement, chosen to bound storage
// to tens-hundreds of rows per trip while still being useful for route
// replay on typical inter-city trip distances/durations.
// ────────────────────────────────────────────────────────────

const SIGNIFICANT_DISTANCE_METERS = 200;
const SIGNIFICANT_HEADING_DEGREES = 30;
const SIGNIFICANT_TIME_SECONDS = 60;

// Buffered breadcrumbs are flushed to PostgreSQL on this interval, batched
// into a single bulk INSERT across all trips rather than one write per
// sampled point -- matches the "Persistent writes to PostgreSQL are
// batched/queued" strategy in architecture.md's Scalability section.
const FLUSH_INTERVAL_MS = 5_000;

export interface GpsSamplePoint {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  /**
   * On-device GPS reading time. Optional -- the mobile client does not
   * currently send this (see trip.service.ts's updateGpsPosition, which
   * stamps server-receive time). When present (e.g. a future mobile release
   * replaying offline-buffered points on reconnect), it is used instead of
   * server time so breadcrumbs are ordered by actual GPS reading time, not
   * arrival order -- satisfying A-26 acceptance criterion (3).
   */
  recordedAt?: Date;
}

interface BufferedPoint extends GpsSamplePoint {
  recordedAt: Date;
}

// In-process buffer + last-sampled-point cache, keyed by tripId. An
// in-process buffer (rather than SQS) is the simplest fit for this
// single-region, always-warm ECS Fargate deployment (see architecture.md's
// "Cold Starts" note) -- architecture.md explicitly allows either.
const pendingBuffer = new Map<string, BufferedPoint[]>();
const lastSampledPoint = new Map<string, BufferedPoint>();

let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Haversine great-circle distance between two points, in meters. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Smallest angular difference between two headings (0-360deg), in degrees. */
function headingDeltaDegrees(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Decide whether a new GPS point is a "significant change" from the last
 * sampled point for this trip -- i.e. whether it should be queued for
 * durable storage. Returns true unconditionally for the first point seen
 * for a trip (nothing to compare against yet, and a cold API restart clears
 * the in-memory cache -- bounded storage is the goal, not exact dedup).
 */
function isSignificantChange(tripId: string, point: BufferedPoint): boolean {
  const last = lastSampledPoint.get(tripId);
  if (!last) return true;

  const distanceMeters = haversineMeters(
    last.latitude,
    last.longitude,
    point.latitude,
    point.longitude
  );
  if (distanceMeters >= SIGNIFICANT_DISTANCE_METERS) return true;

  if (
    point.heading != null &&
    last.heading != null &&
    headingDeltaDegrees(last.heading, point.heading) >= SIGNIFICANT_HEADING_DEGREES
  ) {
    return true;
  }

  const elapsedSeconds =
    Math.abs(point.recordedAt.getTime() - last.recordedAt.getTime()) / 1000;
  if (elapsedSeconds >= SIGNIFICANT_TIME_SECONDS) return true;

  return false;
}

/**
 * Sample a raw GPS ping for Tier 3 breadcrumb history. Called from
 * trip.service.ts's updateGpsPosition on every ping -- but this function
 * itself never touches the database; it only decides whether to queue the
 * point in memory. The actual durable write happens on the batch flush
 * interval (see startBreadcrumbFlushing), so this call never blocks or
 * slows the live GPS ingestion path (A-26 acceptance criterion 2).
 */
export function sampleGpsPoint(tripId: string, point: GpsSamplePoint): void {
  const bufferedPoint: BufferedPoint = {
    ...point,
    recordedAt: point.recordedAt ?? new Date(),
  };

  if (!isSignificantChange(tripId, bufferedPoint)) return;

  lastSampledPoint.set(tripId, bufferedPoint);

  const existing = pendingBuffer.get(tripId);
  if (existing) {
    existing.push(bufferedPoint);
  } else {
    pendingBuffer.set(tripId, [bufferedPoint]);
  }
}

/**
 * Flush all currently-buffered breadcrumb points to PostgreSQL in a single
 * bulk INSERT, then clear the buffer. Safe to call concurrently with
 * sampleGpsPoint -- points added after this function reads the buffer are
 * left for the next flush.
 */
export async function flushBreadcrumbBuffer(): Promise<void> {
  if (pendingBuffer.size === 0) return;

  const rows: (typeof tripLocationHistory.$inferInsert)[] = [];
  for (const [tripId, points] of pendingBuffer.entries()) {
    for (const point of points) {
      rows.push({
        id: uuidv4(),
        tripId,
        latitude: point.latitude,
        longitude: point.longitude,
        speed: point.speed ?? null,
        heading: point.heading ?? null,
        recordedAt: point.recordedAt,
      });
    }
  }
  pendingBuffer.clear();

  if (rows.length === 0) return;

  await db.insert(tripLocationHistory).values(rows);
}

/**
 * Start the periodic breadcrumb flush. Call once at server boot (see
 * server.ts) -- mirrors initDynamoTable's non-fatal-at-boot pattern: a
 * flush failure is logged and retried on the next tick rather than crashing
 * the process, since archival durability degrading briefly is preferable to
 * taking down live trip monitoring.
 */
export function startBreadcrumbFlushing(): void {
  if (flushTimer) return; // already started
  flushTimer = setInterval(() => {
    flushBreadcrumbBuffer().catch((err: unknown) => {
      console.warn(
        '[trip-archive] breadcrumb flush failed, will retry next interval:',
        (err as Error)?.message
      );
    });
  }, FLUSH_INTERVAL_MS);
  // Don't let this interval keep the process alive on its own during tests
  // or graceful shutdown.
  flushTimer.unref?.();
}

// ────────────────────────────────────────────────────────────
// Tier 2 — TripSummary
// ────────────────────────────────────────────────────────────

/**
 * Compute and durably write the TripSummary row for a trip, at
 * completion/cancellation. Idempotent: relies on trip_summaries.trip_id's
 * unique constraint via onConflictDoNothing, so re-firing the completion
 * handler (e.g. a retried request) never creates a duplicate row (A-26
 * acceptance criterion 1). Returns the existing summary if one was already
 * written.
 *
 * Flushes this trip's pending breadcrumb buffer first so the summary's
 * distance/speed/destination-delta figures reflect the most recent sampled
 * points, not a stale in-memory buffer that hasn't hit PostgreSQL yet.
 */
export async function computeAndWriteTripSummary(
  tripId: string,
  finalStatus: 'completed' | 'cancelled'
): Promise<typeof tripSummaries.$inferSelect> {
  const existing = await db.query.tripSummaries.findFirst({
    where: eq(tripSummaries.tripId, tripId),
  });
  if (existing) return existing;

  // Ensure any breadcrumbs still sitting in the in-process buffer for this
  // trip are durable before we read them back out.
  await flushBreadcrumbBuffer();

  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  const breadcrumbs = await db.query.tripLocationHistory.findMany({
    where: eq(tripLocationHistory.tripId, tripId),
    orderBy: asc(tripLocationHistory.recordedAt),
  });

  // Distance: sum of consecutive haversine segments across sampled
  // breadcrumbs. Fallback (schema.md): when no breadcrumbs were recorded at
  // all (e.g. a trip cancelled moments after starting), architecture.md
  // allows falling back to the planned route_polyline -- this codebase has
  // no polyline-decoding utility anywhere yet (checked), and adding one
  // solely for this rare edge case was judged out of scope; the fallback
  // used here instead is the straight-line origin-to-destination distance,
  // a reasonable proxy for "roughly how far this trip was meant to cover".
  let totalDistanceKm: number | null = null;
  if (breadcrumbs.length >= 2) {
    let sumMeters = 0;
    for (let i = 1; i < breadcrumbs.length; i++) {
      sumMeters += haversineMeters(
        breadcrumbs[i - 1].latitude,
        breadcrumbs[i - 1].longitude,
        breadcrumbs[i].latitude,
        breadcrumbs[i].longitude
      );
    }
    totalDistanceKm = sumMeters / 1000;
  } else if (breadcrumbs.length === 0 && trip.origin && trip.destination) {
    totalDistanceKm =
      haversineMeters(
        trip.origin.latitude,
        trip.origin.longitude,
        trip.destination.latitude,
        trip.destination.longitude
      ) / 1000;
  }

  const durationSeconds =
    trip.startedAt && trip.actualArrival
      ? Math.max(
          0,
          Math.round((trip.actualArrival.getTime() - trip.startedAt.getTime()) / 1000)
        )
      : null;

  const speeds = breadcrumbs
    .map((b) => b.speed)
    .filter((s): s is number => s != null);
  const averageSpeedKmh =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
  const maxSpeedKmh = speeds.length > 0 ? Math.max(...speeds) : null;

  const destinationDeltaMeters =
    breadcrumbs.length > 0 && trip.destination
      ? haversineMeters(
          breadcrumbs[breadcrumbs.length - 1].latitude,
          breadcrumbs[breadcrumbs.length - 1].longitude,
          trip.destination.latitude,
          trip.destination.longitude
        )
      : null;

  // Emergency/escalated counts are derived from their own durable tables
  // (the authoritative source -- both bypass adminUpdateTripStatus, see
  // emergency.routes.ts and admin-emergency.routes.ts) rather than a
  // separately-maintained counter, so they can never drift out of sync.
  const [[{ count: emergencyCount }], [{ count: escalatedCount }], [{ count: incidentCountRow }], [{ count: messageCountRow }], incidentRows] =
    await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(emergencyEvents)
        .where(eq(emergencyEvents.tripId, tripId)),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(escalations)
        .where(eq(escalations.tripId, tripId)),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(incidents)
        .where(eq(incidents.tripId, tripId)),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(messages)
        .where(eq(messages.tripId, tripId)),
      db.query.incidents.findMany({
        where: eq(incidents.tripId, tripId),
        columns: { id: true },
      }),
    ]);

  const [inserted] = await db
    .insert(tripSummaries)
    .values({
      id: uuidv4(),
      tripId,
      totalDistanceKm,
      durationSeconds,
      averageSpeedKmh,
      maxSpeedKmh,
      statusTransitionCounts: {
        delayed: trip.statusTransitionCounts?.delayed ?? 0,
        emergency: emergencyCount,
        escalated: escalatedCount,
      },
      incidentCount: incidentCountRow,
      incidentIds: incidentRows.map((i) => i.id),
      messageCount: messageCountRow,
      destinationDeltaMeters,
      finalStatus,
      createdAt: new Date(),
    })
    // Idempotency guard: if a concurrent/retried call already inserted the
    // row for this trip, do nothing rather than erroring or duplicating.
    .onConflictDoNothing({ target: tripSummaries.tripId })
    .returning();

  if (inserted) return inserted;

  // A concurrent call won the race -- return the row it wrote.
  const winner = await db.query.tripSummaries.findFirst({
    where: eq(tripSummaries.tripId, tripId),
  });
  if (!winner) {
    // Should be unreachable (insert either succeeded or conflicted against
    // an existing row), but fail loudly rather than returning undefined.
    throw new Error(`Failed to compute or retrieve TripSummary for trip ${tripId}`);
  }
  return winner;
}

/**
 * Fetch a trip's TripSummary. Follows the same trip-visibility rules as the
 * Trip itself -- callers must check trip access via getTripById before
 * calling this (see trip.routes.ts), matching schema.md's "no additional
 * restriction beyond normal trip access" for TripSummary.
 */
export async function getTripSummary(
  tripId: string
): Promise<typeof tripSummaries.$inferSelect | null> {
  const summary = await db.query.tripSummaries.findFirst({
    where: eq(tripSummaries.tripId, tripId),
  });
  return summary ?? null;
}

// ────────────────────────────────────────────────────────────
// Tier 3 — TripLocationHistory (admin/super_admin read-only)
// ────────────────────────────────────────────────────────────

/**
 * Fetch the full sampled breadcrumb trail for a trip, ordered by recorded
 * time (not insert order -- tolerates offline/reconnect backfilled points).
 *
 * ADMIN-ONLY per schema.md/risk_log.md R-013: callers of this function must
 * already be gated to admin/super_admin at the route layer (see
 * trip.routes.ts's route-history endpoint) -- this function itself performs
 * no role check, matching adminUpdateTripStatus's existing pattern of
 * trusting the route-level requireRole() gate.
 */
export async function getTripLocationHistory(
  tripId: string
): Promise<(typeof tripLocationHistory.$inferSelect)[]> {
  return db.query.tripLocationHistory.findMany({
    where: eq(tripLocationHistory.tripId, tripId),
    orderBy: asc(tripLocationHistory.recordedAt),
  });
}

// ────────────────────────────────────────────────────────────
// Retention (R-013, revised): no fixed-duration purge job.
//
// trip_summaries and trip_location_history are retained indefinitely by
// default -- there is no scheduled/automatic purge. Retention is instead
// tied to account lifecycle: rows are removed only when the associated
// user's account is deleted (see trip_id's onDelete: 'cascade' FK to trips
// in trip-archive.ts -- these tables cascade whenever a trip row is
// deleted, which is how they'll be cleaned up if/when a
// user/account-deletion flow deletes that user's trips). No standalone
// time-based purge function exists here by design -- see
// docs/SafePass/risk_log.md R-013 for the retention-policy history.
// ────────────────────────────────────────────────────────────

// Exposed for tests to reset in-memory state between cases.
export function __resetInMemoryStateForTests(): void {
  pendingBuffer.clear();
  lastSampledPoint.clear();
}
