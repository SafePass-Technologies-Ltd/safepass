/**
 * Driver Service — manages transport partner drivers.
 *
 * Uses the `drivers` Drizzle table. All queries are scoped to the requesting
 * user's organizationId so partners only see their own drivers.
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { drivers } from '../db/schema';

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
