import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * FCM device tokens table — stores Firebase Cloud Messaging push tokens
 * for each user device. A user may have tokens on multiple devices or
 * platforms simultaneously.
 *
 * Tokens are upserted (insert-or-update on conflict) so the table always
 * reflects the current set of active registrations. Stale tokens returned
 * by FCM as registration-token-not-registered errors are deleted on send.
 */
export const fcmTokens = pgTable(
  'fcm_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 500 }).notNull().unique(),
    /** Device platform — used for platform-specific notification options. */
    platform: varchar('platform', { length: 20 }).notNull().$type<'android' | 'ios' | 'web'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('fcm_tokens_user_idx').on(table.userId),
    tokenIdx: uniqueIndex('fcm_tokens_token_idx').on(table.token),
  })
);
