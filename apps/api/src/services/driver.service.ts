/**
 * Driver Service — manages transport partner drivers.
 *
 * Uses the `drivers` Drizzle table. All queries are scoped to the requesting
 * user's organizationId so partners only see their own drivers.
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { drivers, transportVehicles } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface DriverCreateInput {
  organizationId: string;
  fullName: string;
  phone: string;
  licenseNumber: string;
}

/**
 * Shapes a raw DB row into the shape expected by the transport dashboard,
 * adding a `status` string derived from `isActive`.
 */
function toDriverResponse(row: typeof drivers.$inferSelect) {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    licenseNumber: row.licenseNumber,
    assignedVehicleId: row.assignedVehicleId ?? null,
    status: row.isActive ? 'active' : 'inactive',
  };
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * List all drivers belonging to an organization.
 */
export async function getDriversByOrg(organizationId: string) {
  const rows = await db.query.drivers.findMany({
    where: eq(drivers.organizationId, organizationId),
    orderBy: desc(drivers.createdAt),
  });
  return rows.map(toDriverResponse);
}

/**
 * Create a new driver record under the given organization.
 */
export async function createDriver(input: DriverCreateInput) {
  const [row] = await db
    .insert(drivers)
    .values({
      organizationId: input.organizationId,
      fullName: input.fullName,
      phone: input.phone,
      licenseNumber: input.licenseNumber,
      isActive: true,
      isVerified: false,
    })
    .returning();
  return toDriverResponse(row);
}

/**
 * Assign (or unassign, with vehicleId: null) a driver to a vehicle --
 * Screen 36's "Link to Vehicle: Assign driver to a vehicle from dropdown."
 * Both the driver and the vehicle (if provided) must belong to the same
 * organization as the caller, preventing cross-tenant assignment.
 */
export async function assignDriverVehicle(
  driverId: string,
  organizationId: string,
  vehicleId: string | null
) {
  const driver = await db.query.drivers.findFirst({
    where: and(eq(drivers.id, driverId), eq(drivers.organizationId, organizationId)),
  });
  if (!driver) {
    throw Object.assign(new Error('Driver not found'), { statusCode: 404 });
  }

  if (vehicleId) {
    const vehicle = await db.query.transportVehicles.findFirst({
      where: and(eq(transportVehicles.id, vehicleId), eq(transportVehicles.organizationId, organizationId)),
    });
    if (!vehicle) {
      throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });
    }
  }

  const [row] = await db
    .update(drivers)
    .set({ assignedVehicleId: vehicleId })
    .where(and(eq(drivers.id, driverId), eq(drivers.organizationId, organizationId)))
    .returning();

  return toDriverResponse(row);
}
