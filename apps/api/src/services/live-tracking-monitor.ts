/**
 * Live-position write failure reporting (T-050).
 *
 * THE FAILURE THIS EXISTS FOR
 *
 * `updateGpsPosition` writes the current position to DynamoDB fire-and-forget,
 * because a DynamoDB hiccup must never block GPS ingestion -- the traveller's
 * position already landed in PostgreSQL, and the request must stay fast on a
 * bad network. That part is right.
 *
 * What was wrong is that the failure went to a bare `console.warn` string. When
 * the realtime-state table was ARCHIVED, every position write failed with
 * `ResourceNotFoundException` and live positions simply stopped appearing on
 * the operations map -- with no metric, no alarm, and a log line nothing
 * grouped on. Nobody found out from the platform; they found out from the map
 * being empty.
 *
 * So the signal is now two things, both cheap:
 *
 *  1. one structured JSON log line carrying the trip id (searchable, and the
 *     place an operator finds the actual DynamoDB error), and
 *  2. one CloudWatch EMF metric -- `SaveLocationFailure` in `SafePass/DynamoDB`,
 *     dimensioned by table name only -- so an alarm can fire on it.
 *
 * The metric dimension is the TABLE NAME, never the trip id: a per-trip
 * dimension would mint one CloudWatch metric per journey, which is unbounded
 * cardinality and a bill. The trip id belongs in the log line, where it costs
 * nothing.
 *
 * Deliberately NOT part of `/health/ready`: a readiness probe that fails when a
 * non-critical dependency degrades converts a partial, survivable failure into
 * a total API outage (the same reasoning as DELIVERY.md D-013).
 */
import { emitMetric } from '../utils/emf-metric';

/** CloudWatch namespace for realtime-state health. */
export const LIVE_TRACKING_METRIC_NAMESPACE = 'SafePass/DynamoDB';

/** Counts live-position writes that did not reach DynamoDB. */
export const SAVE_LOCATION_FAILURE_METRIC = 'SaveLocationFailure';

export interface SaveLocationFailureContext {
  tripId: string;
  /** Realtime-state table the write targeted (the only metric dimension). */
  tableName: string;
  error: unknown;
}

/** Reads a string `code` or `name` off an error, as AWS SDK v3 errors expose one. */
function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === 'string' && code.length > 0) return code;
  if (typeof name === 'string' && name.length > 0) return name;
  return null;
}

/**
 * Emits the two failure signals. Never throws: this runs inside a rejection
 * handler, and a reporting bug must not become an unhandled rejection.
 */
export function reportSaveLocationFailure(context: SaveLocationFailureContext): void {
  const { tripId, tableName, error } = context;

  try {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'save_trip_location_failed',
        // Searchable per journey; deliberately not a metric dimension.
        tripId,
        table: tableName,
        code: errorCodeOf(error),
        message:
          error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      })
    );

    emitMetric({
      namespace: LIVE_TRACKING_METRIC_NAMESPACE,
      name: SAVE_LOCATION_FAILURE_METRIC,
      value: 1,
      unit: 'Count',
      dimensions: { TableName: tableName },
    });
  } catch {
    // Observability must never be the reason a request path throws.
  }
}

/**
 * Watches a live-position write without blocking the caller.
 *
 * Returns immediately -- GPS ingestion never waits on DynamoDB -- and reports
 * only on failure. The write promise is consumed here, so a rejected write can
 * never surface as an unhandled rejection in the request path.
 */
export function trackTripLocationWrite(
  tripId: string,
  tableName: string,
  write: Promise<unknown>
): void {
  write.then(
    () => undefined,
    (error: unknown) => {
      reportSaveLocationFailure({ tripId, tableName, error });
    }
  );
}
