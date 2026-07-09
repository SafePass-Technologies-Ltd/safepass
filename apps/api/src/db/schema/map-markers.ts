import { pgTable, uuid, varchar, text, doublePrecision, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { markerTypeEnum, verificationStatusEnum, severityEnum, markerSourceEnum, markerActionEnum } from './enums';
import { users } from './users';
import { incidents } from './incidents';

// =============================================================================
// Map Marker Bulk Imports (A-09 CSV bulk import audit log)
// =============================================================================
// One row per CSV bulk-import operation (not per marker) -- per features.md's
// A-09 acceptance criterion #7: "Every bulk import is logged (uploaded_by
// admin, filename, row count, timestamp) for audit purposes."

export const mapMarkers = pgTable(
  'map_markers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id').references(() => incidents.id),
    markerType: markerTypeEnum('marker_type').notNull(),
    category: varchar('category', { length: 100 }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    severity: severityEnum('severity').notNull(),
    source: markerSourceEnum('source').notNull(),
    verificationStatus: verificationStatusEnum('verification_status').notNull().default('unverified'),
    verificationWeight: integer('verification_weight').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index('markers_type_idx').on(table.markerType),
    statusIdx: index('markers_status_idx').on(table.verificationStatus),
    activeGeoIdx: index('markers_active_geo_idx').on(table.isActive, table.latitude, table.longitude),
  })
);

export const mapMarkerImports = pgTable(
  'map_marker_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    rowCount: integer('row_count').notNull(),
    createdCount: integer('created_count').notNull(),
    skippedDuplicateCount: integer('skipped_duplicate_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uploadedByIdx: index('marker_imports_uploaded_by_idx').on(table.uploadedBy),
  })
);

export const mapMarkerInteractions = pgTable(
  'map_marker_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    markerId: uuid('marker_id')
      .notNull()
      .references(() => mapMarkers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    action: markerActionEnum('action').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    markerIdx: index('marker_interactions_marker_idx').on(table.markerId),
    userIdx: index('marker_interactions_user_idx').on(table.userId),
  })
);
