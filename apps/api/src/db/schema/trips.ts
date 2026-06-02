import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tripModeEnum, tripStatusEnum, vehicleTypeEnum } from './enums';
import type { Location } from './types';
import { users } from './users';
import { userVehicles } from './user-vehicles';
import { organizations } from './organizations';

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    registeredBy: uuid('registered_by').references(() => users.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    tripMode: tripModeEnum('trip_mode').notNull().default('passenger'),
    userVehicleId: uuid('user_vehicle_id').references(() => userVehicles.id),
    origin: jsonb('origin').notNull().$type<Location>(),
    destination: jsonb('destination').notNull().$type<Location>(),
    status: tripStatusEnum('status').notNull().default('draft'),
    scheduledDeparture: timestamp('scheduled_departure', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    estimatedArrival: timestamp('estimated_arrival', { withTimezone: true }),
    actualArrival: timestamp('actual_arrival', { withTimezone: true }),
    vehicleType: vehicleTypeEnum('vehicle_type'),
    vehiclePlateNumber: varchar('vehicle_plate_number', { length: 20 }),
    transportCompany: varchar('transport_company', { length: 255 }),
    driverName: varchar('driver_name', { length: 255 }),
    driverPhone: varchar('driver_phone', { length: 20 }),
    passengerCount: integer('passenger_count').default(1),
    routePolyline: text('route_polyline'),
    paymentIds: jsonb('payment_ids').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('trips_user_idx').on(table.userId),
    statusIdx: index('trips_status_idx').on(table.status),
    orgIdx: index('trips_org_idx').on(table.organizationId),
  })
);
