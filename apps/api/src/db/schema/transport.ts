import { pgTable, uuid, varchar, text, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { orgVerificationEnum, documentEntityEnum, documentTypeEnum } from './enums';
import { users } from './users';
import { organizations } from './organizations';

// =============================================================================
// Transport Partner Vehicles
// =============================================================================

export const transportVehicles = pgTable(
  'transport_vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    plateNumber: varchar('plate_number', { length: 20 }).notNull(),
    make: varchar('make', { length: 100 }),
    model: varchar('model', { length: 100 }),
    year: integer('year'),
    capacity: integer('capacity'),
    photoUrl: text('photo_url'),
    isVerified: boolean('is_verified').notNull().default(false),
    qrCodeUrl: text('qr_code_url'),
    qrVerificationToken: varchar('qr_verification_token', { length: 50 }),
    qrGeneratedAt: timestamp('qr_generated_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('transport_vehicles_org_idx').on(table.organizationId),
    qrTokenIdx: uniqueIndex('transport_vehicles_qr_token_idx').on(table.qrVerificationToken),
  })
);

// =============================================================================
// Transport Partner Drivers
// =============================================================================

export const drivers = pgTable(
  'drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    licenseNumber: varchar('license_number', { length: 50 }).notNull(),
    photoUrl: text('photo_url'),
    assignedVehicleId: uuid('assigned_vehicle_id').references(() => transportVehicles.id),
    isVerified: boolean('is_verified').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('drivers_org_idx').on(table.organizationId),
    vehicleIdx: index('drivers_vehicle_idx').on(table.assignedVehicleId),
  })
);

// =============================================================================
// Documents
// =============================================================================

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    entityType: documentEntityEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    documentType: documentTypeEnum('document_type').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }),
    verificationStatus: orgVerificationEnum('verification_status').notNull().default('pending'),
    verifiedBy: uuid('verified_by').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('docs_entity_idx').on(table.entityType, table.entityId),
    orgIdx: index('docs_org_idx').on(table.organizationId),
  })
);
