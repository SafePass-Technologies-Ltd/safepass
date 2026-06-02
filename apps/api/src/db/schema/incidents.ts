import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { incidentTypeEnum, verificationStatusEnum, severityEnum } from './enums';
import type { Location } from './types';
import { users } from './users';
import { trips } from './trips';

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    tripId: uuid('trip_id').references(() => trips.id),
    incidentType: incidentTypeEnum('incident_type').notNull(),
    location: jsonb('location').notNull().$type<Location>(),
    description: text('description').notNull(),
    photoUrl: text('photo_url'),
    verificationStatus: verificationStatusEnum('verification_status').notNull().default('unverified'),
    verificationWeight: integer('verification_weight').notNull().default(0),
    adminNotes: text('admin_notes'),
    severity: severityEnum('severity').notNull().default('medium'),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reporterIdx: index('incidents_reporter_idx').on(table.reporterId),
    typeIdx: index('incidents_type_idx').on(table.incidentType),
    statusIdx: index('incidents_verification_idx').on(table.verificationStatus),
  })
);
