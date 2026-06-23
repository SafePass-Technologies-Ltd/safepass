import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { orgTypeEnum, subscriptionPlanEnum, orgVerificationEnum } from './enums';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: orgTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    rcNumber: varchar('rc_number', { length: 50 }),
    industry: varchar('industry', { length: 100 }),
    address: text('address'),
    contactPerson: varchar('contact_person', { length: 255 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 20 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }),
    verificationStatus: orgVerificationEnum('verification_status').notNull().default('pending'),
    subscriptionPlan: subscriptionPlanEnum('subscription_plan').notNull().default('none'),
    slotCount: integer('slot_count').notNull().default(0),
    /**
     * Admin-entered slot count for Custom plan subscriptions.
     * Required when subscription_plan is 'custom'; null for all named plans.
     * Minimum value is 5. Monthly fee is derived from the tiered pricing algorithm.
     */
    customSlotCount: integer('custom_slot_count'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('orgs_name_idx').on(table.name),
    typeIdx: index('orgs_type_idx').on(table.type),
  })
);
