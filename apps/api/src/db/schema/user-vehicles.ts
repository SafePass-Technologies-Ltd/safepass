import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vehicleTypeEnum } from './enums';
import { users } from './users';

export const userVehicles = pgTable(
  'user_vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plateNumber: varchar('plate_number', { length: 20 }).notNull(),
    vehicleType: vehicleTypeEnum('vehicle_type').notNull(),
    make: varchar('make', { length: 100 }),
    model: varchar('model', { length: 100 }),
    colour: varchar('colour', { length: 50 }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('user_vehicles_user_idx').on(table.userId),
    userDefaultIdx: uniqueIndex('user_vehicles_default_idx')
      .on(table.userId, table.isDefault)
      .where(sql`is_default = true`),
  })
);
