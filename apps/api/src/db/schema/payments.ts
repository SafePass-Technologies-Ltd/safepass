import { pgTable, uuid, varchar, doublePrecision, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { paymentStatusEnum, paymentTypeEnum, paymentGatewayEnum } from './enums';
import { users } from './users';
import { trips } from './trips';
import { organizations } from './organizations';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tripId: uuid('trip_id').references(() => trips.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    amount: doublePrecision('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('NGN'),
    status: paymentStatusEnum('status').notNull(),
    paymentType: paymentTypeEnum('payment_type').notNull(),
    gateway: paymentGatewayEnum('gateway').notNull(),
    gatewayReference: varchar('gateway_reference', { length: 255 }),
    gatewayResponse: jsonb('gateway_response'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('payments_user_idx').on(table.userId),
    tripIdIdx: index('payments_trip_idx').on(table.tripId),
    gatewayRefIdx: uniqueIndex('payments_gateway_ref_idx').on(table.gatewayReference),
  })
);
