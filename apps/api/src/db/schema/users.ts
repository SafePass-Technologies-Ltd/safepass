import { pgTable, uuid, varchar, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { authProviderEnum, userRoleEnum } from './enums';
import type { EmergencyContact, NotificationPreferences } from './types';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authProvider: authProviderEnum('auth_provider').notNull(),
    authProviderId: varchar('auth_provider_id', { length: 255 }).notNull(),
    // Nullable: phone auth users do not have an email from their provider.
    email: varchar('email', { length: 255 }),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    role: userRoleEnum('role').notNull().default('user'),
    organizationId: uuid('organization_id'),
    emergencyContacts: jsonb('emergency_contacts').notNull().$type<EmergencyContact[]>(),
    isVerified: boolean('is_verified').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    notificationPreferences: jsonb('notification_preferences')
      .$type<NotificationPreferences>()
      .default({ pushEnabled: true, emailEnabled: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    authProviderIdIdx: uniqueIndex('users_auth_provider_id_idx').on(
      table.authProvider,
      table.authProviderId
    ),
    emailIdx: index('users_email_idx').on(table.email),
    orgIdx: index('users_org_idx').on(table.organizationId),
  })
);
