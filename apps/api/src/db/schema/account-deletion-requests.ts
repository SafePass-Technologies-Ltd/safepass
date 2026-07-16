/**
 * Account Deletion Requests — M-38 "Account Deletion" / A-27 "Account
 * Deletion Oversight & Legal Holds".
 *
 * See docs/SafePass/schema.md's AccountDeletionRequest entity and Account
 * Deletion Data Retention Matrix, docs/SafePass/user_flow.md's Flow 10, and
 * docs/SafePass/risk_log.md R-013/R-014.
 *
 * One row per deletion attempt (not one row per user) -- a user who cancels
 * and later re-requests deletion gets a new row; historical
 * cancelled/completed rows are retained as the permanent audit trail (see
 * schema.md's retention matrix: "AccountDeletionRequest ... Retained").
 */
import { pgTable, uuid, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';
import { accountDeletionStatusEnum } from './enums';
import { users } from './users';

/** Snapshot of pre-flight validation results, captured at request time for audit. */
export interface DeletionPreFlightChecks {
  hadActiveTrip: boolean;
  walletBalanceAtRequest: number;
  walletForfeited: boolean;
  wasSoleOrgAdmin: boolean;
}

export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: accountDeletionStatusEnum('status').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    // requestedAt + 14 days -- the sweep job (jobs/account-deletion-sweep.job.ts)
    // only acts on rows where scheduledFor <= now.
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    preFlightChecks: jsonb('pre_flight_checks').$type<DeletionPreFlightChecks>().notNull(),
    legalHoldReason: text('legal_hold_reason'),
    legalHoldRefs: jsonb('legal_hold_refs').$type<string[]>().notNull().default([]),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    forceDeletedBy: uuid('force_deleted_by').references(() => users.id),
    forceDeleteReason: text('force_delete_reason'),
    // Legal-hold override (A-27, super_admin only) is a distinct action from
    // force-delete (which bypasses the cooling-off period entirely) -- track
    // it separately so the audit trail distinguishes "held then overridden"
    // from "force-deleted before the window even elapsed".
    holdOverriddenBy: uuid('hold_overridden_by').references(() => users.id),
    holdOverrideReason: text('hold_override_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('account_deletion_requests_user_idx').on(table.userId),
    statusIdx: index('account_deletion_requests_status_idx').on(table.status),
    scheduledForIdx: index('account_deletion_requests_scheduled_for_idx').on(table.scheduledFor),
  })
);
