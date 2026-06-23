import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { organizations } from './organizations';
import { trips } from './trips';

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export const orgSlotStatusEnum = pgEnum('org_slot_status', [
  'empty',
  'token_pending',
  'active',
]);

export const inviteTokenStatusEnum = pgEnum('invite_token_status', [
  'active',
  'expired',
  'redeemed',
  'revoked',
]);

export const scheduledTripStatusEnum = pgEnum('scheduled_trip_status', [
  'upcoming',
  'missed',
  'started',
  'cancelled',
]);

export const tripTagInviteStatusEnum = pgEnum('trip_tag_invite_status', [
  'pending',
  'accepted',
  'declined',
  'window_expired',
]);

// ─────────────────────────────────────────────
// org_slots
// ─────────────────────────────────────────────

export const orgSlots = pgTable('org_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  status: orgSlotStatusEnum('status').notNull().default('empty'),
  memberUserId: uuid('member_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// invite_tokens
// ─────────────────────────────────────────────

export const inviteTokens = pgTable(
  'invite_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => orgSlots.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    token: varchar('token', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedBy: uuid('redeemed_by').references(() => users.id),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    status: inviteTokenStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('invite_tokens_token_idx').on(table.token),
  })
);

// ─────────────────────────────────────────────
// scheduled_trips
// ─────────────────────────────────────────────

export const scheduledTrips = pgTable(
  'scheduled_trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    destination: jsonb('destination')
      .notNull()
      .$type<{ name: string; lat: number; lng: number }>(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    vehicle: jsonb('vehicle').$type<{
      type?: string;
      plate_number?: string;
      transport_company?: string;
    } | null>(),
    label: varchar('label', { length: 255 }),
    status: scheduledTripStatusEnum('status').notNull().default('upcoming'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    linkedTripId: uuid('linked_trip_id').references(() => trips.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('scheduled_trips_user_idx').on(table.userId),
    scheduledAtIdx: index('scheduled_trips_scheduled_at_idx').on(table.scheduledAt),
  })
);

// ─────────────────────────────────────────────
// trip_tag_invites
// ─────────────────────────────────────────────

export const tripTagInvites = pgTable(
  'trip_tag_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    initiatorUserId: uuid('initiator_user_id')
      .notNull()
      .references(() => users.id),
    taggedUserId: uuid('tagged_user_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    status: tripTagInviteStatusEnum('status').notNull().default('pending'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    linkedTripId: uuid('linked_trip_id').references(() => trips.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    tripIdIdx: index('trip_tag_invites_trip_idx').on(table.tripId),
    taggedUserIdIdx: index('trip_tag_invites_tagged_user_idx').on(table.taggedUserId),
  })
);
