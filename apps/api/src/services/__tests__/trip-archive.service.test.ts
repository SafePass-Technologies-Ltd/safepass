/**
 * Trip Archive Service Tests — A-26 Trip Persistence & Archival.
 *
 * Covers the significant-change sampling filter (pure in-memory logic, no
 * database involved), the batched breadcrumb flush, and TripSummary
 * idempotency -- following the same mock-the-database-layer approach as
 * auth.service.test.ts.
 *
 * No purge/retention tests here: retention is tied to account lifecycle via
 * onDelete: 'cascade' FKs (see db/schema/trip-archive.ts), not a
 * standalone time-based purge function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────
// Hoisted mock function references (vi.mock is hoisted above imports).
// ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
  mockTripSummaryFindFirst: vi.fn(),
  mockTripFindFirst: vi.fn(),
  mockLocationHistoryFindMany: vi.fn(),
  mockIncidentsFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoNothing: vi.fn(),
  mockReturning: vi.fn(),
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    query: {
      trips: { findFirst: hoisted.mockTripFindFirst },
      tripSummaries: { findFirst: hoisted.mockTripSummaryFindFirst },
      tripLocationHistory: { findMany: hoisted.mockLocationHistoryFindMany },
      incidents: { findMany: hoisted.mockIncidentsFindMany },
    },
    insert: hoisted.mockInsert,
    select: hoisted.mockSelect,
  },
}));

import {
  sampleGpsPoint,
  flushBreadcrumbBuffer,
  computeAndWriteTripSummary,
  __resetInMemoryStateForTests,
} from '../trip-archive.service';

beforeEach(() => {
  vi.clearAllMocks();
  __resetInMemoryStateForTests();

  // db.insert(...).values(...).onConflictDoNothing(...).returning()
  hoisted.mockInsert.mockReturnValue({ values: hoisted.mockInsertValues });
  hoisted.mockInsertValues.mockReturnValue({
    onConflictDoNothing: hoisted.mockOnConflictDoNothing,
    // flushBreadcrumbBuffer calls db.insert(...).values(rows) directly
    // (bulk insert, no onConflict needed for breadcrumbs).
    then: undefined,
  });
  hoisted.mockOnConflictDoNothing.mockReturnValue({ returning: hoisted.mockReturning });

  // db.select({...}).from(...).where(...)
  hoisted.mockSelect.mockReturnValue({ from: hoisted.mockSelectFrom });
  hoisted.mockSelectFrom.mockReturnValue({ where: hoisted.mockSelectWhere });
});

// ────────────────────────────────────────────────────────────
// sampleGpsPoint — significant-change filter (pure, no DB)
// ────────────────────────────────────────────────────────────
describe('sampleGpsPoint', () => {
  it('always samples the first point seen for a trip', async () => {
    sampleGpsPoint('trip-1', { latitude: 6.5244, longitude: 3.3792, speed: 40, heading: 90 });

    hoisted.mockInsert.mockReturnValue({ values: hoisted.mockInsertValues });
    hoisted.mockInsertValues.mockResolvedValue(undefined);

    await flushBreadcrumbBuffer();

    expect(hoisted.mockInsert).toHaveBeenCalledTimes(1);
    const insertedRows = hoisted.mockInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].tripId).toBe('trip-1');
  });

  it('does NOT sample a point that is a tiny move within the significant-change thresholds', async () => {
    sampleGpsPoint('trip-2', {
      latitude: 6.5244,
      longitude: 3.3792,
      speed: 40,
      heading: 90,
      recordedAt: new Date('2026-01-01T00:00:00Z'),
    });

    // ~5 meters away, same heading, 5 seconds later -- below all thresholds.
    sampleGpsPoint('trip-2', {
      latitude: 6.52441,
      longitude: 3.3792,
      speed: 41,
      heading: 91,
      recordedAt: new Date('2026-01-01T00:00:05Z'),
    });

    hoisted.mockInsertValues.mockResolvedValue(undefined);
    await flushBreadcrumbBuffer();

    const insertedRows = hoisted.mockInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    // Only the first (always-sampled) point should have been queued.
    expect(insertedRows).toHaveLength(1);
  });

  it('samples a point once the distance threshold is exceeded', async () => {
    sampleGpsPoint('trip-3', {
      latitude: 6.5244,
      longitude: 3.3792,
      recordedAt: new Date('2026-01-01T00:00:00Z'),
    });

    // ~0.3km north -- well past the 200m significant-distance threshold.
    sampleGpsPoint('trip-3', {
      latitude: 6.5271,
      longitude: 3.3792,
      recordedAt: new Date('2026-01-01T00:00:01Z'),
    });

    hoisted.mockInsertValues.mockResolvedValue(undefined);
    await flushBreadcrumbBuffer();

    const insertedRows = hoisted.mockInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
  });

  it('samples a point once the elapsed-time threshold is exceeded even with no movement', async () => {
    sampleGpsPoint('trip-4', {
      latitude: 6.5244,
      longitude: 3.3792,
      recordedAt: new Date('2026-01-01T00:00:00Z'),
    });

    // Same coordinates, but 90 seconds later -- past the 60s threshold.
    sampleGpsPoint('trip-4', {
      latitude: 6.5244,
      longitude: 3.3792,
      recordedAt: new Date('2026-01-01T00:01:30Z'),
    });

    hoisted.mockInsertValues.mockResolvedValue(undefined);
    await flushBreadcrumbBuffer();

    const insertedRows = hoisted.mockInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
  });

  it('does not touch the database at all until a flush is triggered', () => {
    sampleGpsPoint('trip-5', { latitude: 6.5244, longitude: 3.3792 });
    expect(hoisted.mockInsert).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// flushBreadcrumbBuffer
// ────────────────────────────────────────────────────────────
describe('flushBreadcrumbBuffer', () => {
  it('is a no-op when nothing is buffered', async () => {
    await flushBreadcrumbBuffer();
    expect(hoisted.mockInsert).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// computeAndWriteTripSummary
// ────────────────────────────────────────────────────────────
describe('computeAndWriteTripSummary', () => {
  it('is idempotent -- returns the existing summary without inserting again', async () => {
    const existingSummary = { id: 'summary-1', tripId: 'trip-1', finalStatus: 'completed' };
    hoisted.mockTripSummaryFindFirst.mockResolvedValue(existingSummary);

    const result = await computeAndWriteTripSummary('trip-1', 'completed');

    expect(result).toBe(existingSummary);
    expect(hoisted.mockInsert).not.toHaveBeenCalled();
  });

  it('throws a 404 when the trip does not exist', async () => {
    hoisted.mockTripSummaryFindFirst.mockResolvedValue(null);
    hoisted.mockTripFindFirst.mockResolvedValue(null);

    await expect(computeAndWriteTripSummary('missing-trip', 'completed')).rejects.toThrow(
      'Trip not found'
    );
  });

  it('computes distance/speed from breadcrumbs and writes a new summary row', async () => {
    hoisted.mockTripSummaryFindFirst.mockResolvedValue(null);
    hoisted.mockTripFindFirst.mockResolvedValue({
      id: 'trip-9',
      origin: { latitude: 6.5, longitude: 3.3 },
      destination: { latitude: 6.6, longitude: 3.4 },
      startedAt: new Date('2026-01-01T00:00:00Z'),
      actualArrival: new Date('2026-01-01T01:00:00Z'),
      statusTransitionCounts: { delayed: 2 },
    });
    hoisted.mockLocationHistoryFindMany.mockResolvedValue([
      { latitude: 6.5, longitude: 3.3, speed: 40, heading: 0, recordedAt: new Date('2026-01-01T00:00:00Z') },
      { latitude: 6.55, longitude: 3.35, speed: 60, heading: 45, recordedAt: new Date('2026-01-01T00:30:00Z') },
    ]);
    hoisted.mockIncidentsFindMany.mockResolvedValue([{ id: 'incident-1' }]);

    // Four sequential db.select(...) calls (emergency/escalation/incident/message counts).
    hoisted.mockSelectWhere
      .mockResolvedValueOnce([{ count: 1 }]) // emergencyEvents
      .mockResolvedValueOnce([{ count: 2 }]) // escalations
      .mockResolvedValueOnce([{ count: 1 }]) // incidents count
      .mockResolvedValueOnce([{ count: 5 }]); // messages

    const insertedRow = { id: 'summary-9', tripId: 'trip-9', finalStatus: 'completed' };
    hoisted.mockReturning.mockResolvedValue([insertedRow]);

    const result = await computeAndWriteTripSummary('trip-9', 'completed');

    expect(result).toBe(insertedRow);
    expect(hoisted.mockInsert).toHaveBeenCalledTimes(1);

    const insertedValues = hoisted.mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues.tripId).toBe('trip-9');
    expect(insertedValues.durationSeconds).toBe(3600);
    expect(insertedValues.statusTransitionCounts).toEqual({ delayed: 2, emergency: 1, escalated: 2 });
    expect(insertedValues.incidentCount).toBe(1);
    expect(insertedValues.incidentIds).toEqual(['incident-1']);
    expect(insertedValues.messageCount).toBe(5);
    expect(insertedValues.finalStatus).toBe('completed');
    // Distance should be > 0 given the two distinct breadcrumb points.
    expect(insertedValues.totalDistanceKm as number).toBeGreaterThan(0);
    expect(insertedValues.averageSpeedKmh).toBe(50);
    expect(insertedValues.maxSpeedKmh).toBe(60);
  });
});
