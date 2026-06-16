import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { roleUpgradeRequestedRoleEnum, roleUpgradeStatusEnum } from './enums';
import { users } from './users';
import { organizations } from './organizations';

/**
 * Tracks requests to elevate a user's role beyond the default `user`.
 *
 * Created automatically when a user submits corporate/transport org onboarding
 * (requestedRole = corporate_admin|transport_partner, organizationId set), or
 * manually for admin/super_admin/monitoring_officer elevation. The user's
 * actual `role` column is only updated once an admin approves the request.
 */
export const roleUpgradeRequests = pgTable(
  'role_upgrade_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    requestedRole: roleUpgradeRequestedRoleEnum('requested_role').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    status: roleUpgradeStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('role_upgrade_requests_status_idx').on(table.status),
    userIdx: index('role_upgrade_requests_user_idx').on(table.userId),
  })
);
