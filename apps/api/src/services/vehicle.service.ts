/**
 * Vehicle Service — manages transport partner fleet vehicles.
 *
 * Uses the `transport_vehicles` Drizzle table. Scopes all queries to the
 * requesting user's organizationId so partners only see their own fleet.
 *
 * NOTE: The `transportVehicles` table does not have a dedicated `vehicleType`
 * or `status` column. vehicleType is stored via `make` field workaround — see
 * TODO below. `status` is derived from `isActive` at read time.
 * TODO: add `vehicle_type varchar(50)` and `status varchar(20)` columns to
 * `transport_vehicles` in the next schema migration.
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { transportVehicles } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface VehicleCreateInput {
  plateNumber: string;
  make?: string;
  model?: string;
  /** Free-text vehicle type (sedan, suv, bus, truck, motorcycle). */
  vehicleType?: string;
  capacity?: number;
  year?: number;
}

export interface VehicleUpdateInput {
  plateNumber?: string;
  make?: string;
  model?: string;
  vehicleType?: string;
  capacity?: number;
  year?: number;
}

/**
 * Shapes a raw DB row into the shape expected by the transport dashboard:
 * adds a `status` string derived from `isActive`, and exposes `vehicleType`
 * from the `photoUrl` workaround column.
 *
 * TODO: remove this adapter once the migration adds proper columns.
 */
function toVehicleResponse(row: typeof transportVehicles.$inferSelect) {
  return {
    id: row.id,
    plateNumber: row.plateNumber,
    make: row.make ?? null,
    model: row.model ?? null,
    // vehicleType is stored in photoUrl as a stopgap until migration.
    vehicleType: row.photoUrl?.startsWith('__type:') ? row.photoUrl.slice(7) : null,
    capacity: row.capacity ?? null,
    year: row.year ?? null,
    status: row.isActive ? 'active' : 'inactive',
  };
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * List all vehicles belonging to an organization.
 */
export async function getVehiclesByOrg(organizationId: string) {
  const rows = await db.query.transportVehicles.findMany({
    where: eq(transportVehicles.organizationId, organizationId),
    orderBy: desc(transportVehicles.createdAt),
  });
  return rows.map(toVehicleResponse);
}

/**
 * Create a new vehicle under the given organization.
 * vehicleType is persisted in `photoUrl` with a `__type:` prefix until a
 * dedicated column is added via migration.
 */
export async function createVehicle(organizationId: string, input: VehicleCreateInput) {
  const [row] = await db
    .insert(transportVehicles)
    .values({
      organizationId,
      plateNumber: input.plateNumber,
      make: input.make ?? null,
      model: input.model ?? null,
      // Encode vehicleType in photoUrl until migration adds a proper column.
      photoUrl: input.vehicleType ? `__type:${input.vehicleType}` : null,
      capacity: input.capacity ?? null,
      year: input.year ?? null,
      isActive: true,
      isVerified: false,
    })
    .returning();
  return toVehicleResponse(row);
}

/**
 * Update a vehicle. Only the owner organization can update their vehicles.
 */
export async function updateVehicle(
  vehicleId: string,
  organizationId: string,
  input: VehicleUpdateInput
) {
  const existing = await db.query.transportVehicles.findFirst({
    where: and(
      eq(transportVehicles.id, vehicleId),
      eq(transportVehicles.organizationId, organizationId)
    ),
  });

  if (!existing) {
    throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });
  }

  const [row] = await db
    .update(transportVehicles)
    .set({
      ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber } : {}),
      ...(input.make !== undefined ? { make: input.make } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.vehicleType !== undefined ? { photoUrl: `__type:${input.vehicleType}` } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
    })
    .where(
      and(
        eq(transportVehicles.id, vehicleId),
        eq(transportVehicles.organizationId, organizationId)
      )
    )
    .returning();

  return toVehicleResponse(row);
}

/**
 * Soft-delete a vehicle by setting isActive = false.
 */
export async function deleteVehicle(vehicleId: string, organizationId: string) {
  const existing = await db.query.transportVehicles.findFirst({
    where: and(
      eq(transportVehicles.id, vehicleId),
      eq(transportVehicles.organizationId, organizationId)
    ),
  });

  if (!existing) {
    throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });
  }

  const [row] = await db
    .update(transportVehicles)
    .set({ isActive: false })
    .where(
      and(
        eq(transportVehicles.id, vehicleId),
        eq(transportVehicles.organizationId, organizationId)
      )
    )
    .returning();

  return toVehicleResponse(row);
}
