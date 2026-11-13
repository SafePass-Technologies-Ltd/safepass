/**
 * Live-position failure reporting (T-050).
 *
 * The incident: the realtime-state DynamoDB table was ARCHIVED, so every
 * live-position write failed with `ResourceNotFoundException`. The write was
 * (correctly) fire-and-forget, but its failure was swallowed into a
 * `console.warn` string -- no metric, no alarm, nothing an operator could see.
 * Live positions simply stopped appearing on the operations map.
 *
 * These tests pin the replacement:
 *
 *   1. the write still never blocks or fails GPS ingestion (that is why the
 *      swallow exists at all),
 *   2. a failure produces ONE structured log line that carries the trip id,
 *   3. the same failure produces ONE CloudWatch EMF metric -- namespace
 *      `SafePass/DynamoDB`, metric `SaveLocationFailure`, dimensioned by table
 *      name only -- so an alarm can fire,
 *   4. the trip id is never a metric dimension: that would be one CloudWatch
 *      metric per journey.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_TRACKING_METRIC_NAMESPACE,
  SAVE_LOCATION_FAILURE_METRIC,
  reportSaveLocationFailure,
  trackTripLocationWrite,
} from '../live-tracking-monitor';

const TABLE = 'safepass-production-realtime-state';
const TRIP_ID = '6f1d2c3b-4a59-4e8f-9b7a-1c2d3e4f5a6b';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The AWS SDK's own shape for a missing table. */
function resourceNotFoundException() {
  return Object.assign(
    new Error(
      "Requested resource not found: Table: safepass-production-realtime-state not found"
    ),
    { name: 'ResourceNotFoundException' }
  );
}

/** The failure log line, parsed. */
function loggedFailure(): Record<string, unknown> {
  const line = vi
    .mocked(console.error)
    .mock.calls.map(([entry]) => String(entry))
    .find((entry) => entry.includes('save_trip_location_failed'));
  expect(line).toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
}

/** The EMF metric document, parsed. */
function emittedMetric(): Record<string, unknown> {
  const lines = vi
    .mocked(console.log)
    .mock.calls.map(([entry]) => String(entry))
    .filter((entry) => entry.includes('CloudWatchMetrics'));
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] as string) as Record<string, unknown>;
}

describe('trackTripLocationWrite', () => {
  it('returns immediately and never blocks the GPS path', async () => {
    // A write that never settles: the caller must not wait for it.
    const write = new Promise(() => undefined);

    const started = performance.now();
    trackTripLocationWrite(TRIP_ID, TABLE, write);

    expect(performance.now() - started).toBeLessThan(50);
  });

  it('does not throw and does not report when the write succeeds', async () => {
    expect(() =>
      trackTripLocationWrite(TRIP_ID, TABLE, Promise.resolve({ $metadata: { httpStatusCode: 200 } }))
    ).not.toThrow();

    // Let the resolution settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of swallowing it', async () => {
    trackTripLocationWrite(TRIP_ID, TABLE, Promise.reject(resourceNotFoundException()));

    // The rejection handler is scheduled on the microtask queue.
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('never turns a failed write into an unhandled rejection', async () => {
    // If the rejection escaped, vitest would fail this file with an unhandled
    // rejection rather than this assertion.
    trackTripLocationWrite(TRIP_ID, TABLE, Promise.reject(new Error('boom')));

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('is safe when the reporting itself is broken', async () => {
    vi.mocked(console.error).mockImplementation(() => {
      throw new Error('log sink exploded');
    });

    expect(() =>
      trackTripLocationWrite(TRIP_ID, TABLE, Promise.reject(resourceNotFoundException()))
    ).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
  });
});

describe('reportSaveLocationFailure', () => {
  it('writes one structured log line carrying the trip id and the DynamoDB error', () => {
    reportSaveLocationFailure({ tripId: TRIP_ID, tableName: TABLE, error: resourceNotFoundException() });

    const entry = loggedFailure();
    expect(entry.level).toBe('error');
    expect(entry.event).toBe('save_trip_location_failed');
    // The trip id is the searchable handle an operator needs.
    expect(entry.tripId).toBe(TRIP_ID);
    expect(entry.table).toBe(TABLE);
    expect(entry.code).toBe('ResourceNotFoundException');
    expect(String(entry.message)).toContain('resource not found');

    // Still one line: CloudWatch groups by line.
    const line = vi
      .mocked(console.error)
      .mock.calls.map(([entry]) => String(entry))
      .find((entry) => entry.includes('save_trip_location_failed'));
    expect(String(line)).not.toContain('\n');
  });

  it('emits the SaveLocationFailure metric with the table as the only dimension', () => {
    reportSaveLocationFailure({ tripId: TRIP_ID, tableName: TABLE, error: resourceNotFoundException() });

    const document = emittedMetric();
    const aws = document._aws as {
      CloudWatchMetrics: Array<{
        Namespace: string;
        Dimensions: string[][];
        Metrics: Array<{ Name: string; Unit: string }>;
      }>;
    };
    const [declaration] = aws.CloudWatchMetrics;

    expect(declaration?.Namespace).toBe(LIVE_TRACKING_METRIC_NAMESPACE);
    expect(declaration?.Namespace).toBe('SafePass/DynamoDB');
    expect(declaration?.Metrics).toEqual([
      { Name: SAVE_LOCATION_FAILURE_METRIC, Unit: 'Count' },
    ]);
    expect(document[SAVE_LOCATION_FAILURE_METRIC]).toBe(1);

    // Table name only: the trip id would be unbounded cardinality, and the
    // metric is deliberately not per-journey.
    expect(declaration?.Dimensions).toEqual([['TableName']]);
    expect(document.TableName).toBe(TABLE);
    expect(JSON.stringify(document)).not.toContain(TRIP_ID);
  });

  it('does not throw on a non-Error rejection value', () => {
    expect(() =>
      reportSaveLocationFailure({ tripId: TRIP_ID, tableName: TABLE, error: 'a string' })
    ).not.toThrow();

    expect(loggedFailure().message).toBe('a string');
  });
});
