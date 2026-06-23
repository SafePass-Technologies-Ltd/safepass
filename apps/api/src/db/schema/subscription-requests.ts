import { pgTable, uuid, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { subscriptionPlanEnum, subscriptionRequestStatusEnum } from './enums';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Tracks org admin requests to activate or change a subscription plan.
 *
 * MVP flow (manual invoicing):
 *   1. Org admin submits a request (status = 'pending').
 *   2. SafePass admin approves (writes plan + slot_count to organizations)
 *      or rejects (org plan is unchanged).
 *
 * At most one 'pending' request should exist per org at a time — the
 * service cancels previous pending requests before inserting a new one.
 */
export const subscriptionRequests = pgTable(
  'subscription_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    requestedPlan: subscriptionPlanEnum('requested_plan').notNull(),
    requestedSlotCount: integer('requested_slot_count').notNull(),
    notes: text('notes'),
    status: subscriptionRequestStatusEnum('status').notNull().default('pending'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('sub_requests_org_idx').on(table.orgId),
    statusIdx: index('sub_requests_status_idx').on(table.status),
  })
);
