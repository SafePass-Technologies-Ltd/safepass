/**
 * Trip Archival Tables — A-26 "Trip Persistence & Archival (Yearly
 * Compliance Log + Route Replay)".
 *
 * See docs/SafePass/architecture.md's "Trip Data Persistence (Yearly
 * Compliance Log)" section and docs/SafePass/schema.md's TripSummary /
 * TripLocationHistory entity definitions. Both tables are durable
 * PostgreSQL stores, distinct from the ephemeral DynamoDB-backed live
 * location (60s TTL) in dynamo.service.ts -- neither is written to on a
 * per-GPS-ping basis (see trip-archive.service.ts for the batched/queued
 * write path).
 *
 * Retention (R-013, revised): both tables are retained indefinitely by
 * default -- there is no fixed-duration/scheduled purge job. Retention is
 * instead tied to account lifecycle: both tables cascade-delete via
 * `trip_id` whenever the parent trip row is deleted (see each table's
 * `onDelete: 'cascade'` reference below), which is how they get cleaned up
 * if/when a user/account-deletion flow deletes that user's trips. No such
 * account-deletion flow exists in this codebase yet (see
 * docs/SafePass/risk_log.md R-013's residual note) -- these FKs simply
 * ensure that whenever trips *are* deleted, their archival rows never
 * become orphaned.
 */
import { pgTable, uuid, integer, doublePrecision, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tripSummaryFinalStatusEnum } from './enums';
import { trips } from './trips';

// =============================================================================
// trip_summaries — one row per trip, written once at completion/cancellation.
// =============================================================================

export const tripSummaries = pgTable(
  'trip_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One-to-one with trips: unique index enforces "at most one TripSummary
    // per trip" and doubles as the idempotency guard for
    // computeAndWriteTripSummary (re-firing the completion handler upserts
    // rather than duplicating -- see trip-archive.service.ts).
    // onDelete: 'cascade' -- this row is the durable archive OF a trip, so
    // it has no reason to outlive the trip itself. Also the mechanism this
    // table relies on for account-lifecycle-tied retention (see the module
    // doc comment above): whenever a trip is deleted, its summary goes too.
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' })
      .unique(),
    totalDistanceKm: doublePrecision('total_distance_km'),
    durationSeconds: integer('duration_seconds'),
    averageSpeedKmh: doublePrecision('average_speed_kmh'),
    maxSpeedKmh: doublePrecision('max_speed_kmh'),
    // { delayed, emergency, escalated } -- see schema.md's TripSummary.status_transition_counts.
    statusTransitionCounts: jsonb('status_transition_counts')
      .$type<{ delayed: number; emergency: number; escalated: number }>()
      .notNull()
      .default({ delayed: 0, emergency: 0, escalated: 0 }),
    incidentCount: integer('incident_count').notNull().default(0),
    incidentIds: jsonb('incident_ids').$type<string[]>().notNull().default([]),
    messageCount: integer('message_count').notNull().default(0),
    destinationDeltaMeters: doublePrecision('destination_delta_meters'),
    finalStatus: tripSummaryFinalStatusEnum('final_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdIdx: uniqueIndex('trip_summaries_trip_idx').on(table.tripId),
    createdAtIdx: index('trip_summaries_created_idx').on(table.createdAt),
  })
);

// =============================================================================
// trip_location_history — sampled route breadcrumbs, admin/super_admin-only
// read access (see schema.md's TripLocationHistory access-control note and
// R-013). Bounded per trip via the significant-change sampling filter in
// trip-archive.service.ts -- never one row per raw GPS ping.
// =============================================================================

export const tripLocationHistory = pgTable(
  'trip_location_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // onDelete: 'cascade' -- see trip_summaries.trip_id above; these
    // breadcrumbs are meaningless once their trip is gone, and this cascade
    // is how they get cleaned up under the account-lifecycle-tied retention
    // model (no independent time-based purge).
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    // Ordering column for route replay -- the on-device GPS reading time,
    // NOT insert time. May lag behind createdAt during offline/reconnect
    // buffering (see the module doc comment above).
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdIdx: index('trip_location_history_trip_idx').on(table.tripId),
    // Composite index supports "ORDER BY recorded_at" scoped to a single
    // trip -- the exact access pattern of the route-replay endpoint and the
    // TripSummary distance/speed computation.
    tripRecordedAtIdx: index('trip_location_history_trip_recorded_idx').on(
      table.tripId,
      table.recordedAt
    ),
  })
);
