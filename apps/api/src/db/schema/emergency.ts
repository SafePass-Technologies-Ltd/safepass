import { pgTable, uuid, text, doublePrecision, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import {
  triggerTypeEnum,
  emergencyStatusEnum,
  escalationStatusEnum,
  checkInMethodEnum,
  checkInResponseEnum,
} from './enums';
import { users } from './users';
import { trips } from './trips';

// =============================================================================
// Emergency Events
// =============================================================================

export const emergencyEvents = pgTable(
  'emergency_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    triggerType: triggerTypeEnum('trigger_type').notNull(),
    status: emergencyStatusEnum('status').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: doublePrecision('speed'),
    locationTimestamp: timestamp('location_timestamp', { withTimezone: true }).notNull(),
    audioRecordingUrls: jsonb('audio_recording_urls').$type<string[]>().default([]),
    videoRecordingUrls: jsonb('video_recording_urls').$type<string[]>().default([]),
    emergencyContactNotified: boolean('emergency_contact_notified').notNull().default(false),
    officerId: uuid('officer_id').references(() => users.id),
    resolutionNotes: text('resolution_notes'),
    escalatedTo: uuid('escalated_to').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    tripIdIdx: index('emergency_trip_idx').on(table.tripId),
    statusIdx: index('emergency_status_idx').on(table.status),
  })
);

// =============================================================================
// Escalations
// =============================================================================

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    emergencyEventId: uuid('emergency_event_id').references(() => emergencyEvents.id),
    escalatedBy: uuid('escalated_by')
      .notNull()
      .references(() => users.id),
    escalatedTo: uuid('escalated_to').references(() => users.id),
    reason: text('reason').notNull(),
    notes: text('notes'),
    status: escalationStatusEnum('status').notNull(),
    resolutionNotes: text('resolution_notes'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    tripIdIdx: index('escalations_trip_idx').on(table.tripId),
    statusIdx: index('escalations_status_idx').on(table.status),
  })
);

// =============================================================================
// Check-Ins
// =============================================================================

export const checkIns = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    officerId: uuid('officer_id')
      .notNull()
      .references(() => users.id),
    method: checkInMethodEnum('method').notNull(),
    responseStatus: checkInResponseEnum('response_status').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdIdx: index('checkins_trip_idx').on(table.tripId),
  })
);
