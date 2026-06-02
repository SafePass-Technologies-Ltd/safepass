import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { senderRoleEnum, messageTypeEnum } from './enums';
import { users } from './users';
import { trips } from './trips';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    senderRole: senderRoleEnum('sender_role').notNull(),
    content: text('content').notNull(),
    messageType: messageTypeEnum('message_type').notNull().default('text'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tripIdIdx: index('messages_trip_idx').on(table.tripId),
    createdAtIdx: index('messages_created_idx').on(table.createdAt),
  })
);
