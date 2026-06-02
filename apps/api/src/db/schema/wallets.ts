import { pgTable, uuid, varchar, doublePrecision, boolean, text, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { walletOwnerTypeEnum, transactionTypeEnum, transactionStatusEnum } from './enums';
import { payments } from './payments';
import { trips } from './trips';

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: walletOwnerTypeEnum('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    balance: doublePrecision('balance').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('NGN'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: uniqueIndex('wallets_owner_idx').on(table.ownerType, table.ownerId),
  })
);

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    transactionType: transactionTypeEnum('transaction_type').notNull(),
    amount: doublePrecision('amount').notNull(),
    balanceBefore: doublePrecision('balance_before').notNull(),
    balanceAfter: doublePrecision('balance_after').notNull(),
    paymentId: uuid('payment_id').references(() => payments.id),
    tripId: uuid('trip_id').references(() => trips.id),
    description: text('description'),
    status: transactionStatusEnum('status').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    walletIdIdx: index('wallet_tx_wallet_idx').on(table.walletId),
    tripIdIdx: index('wallet_tx_trip_idx').on(table.tripId),
  })
);
