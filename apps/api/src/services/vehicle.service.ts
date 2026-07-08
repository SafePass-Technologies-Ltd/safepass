/**
 * Vehicle Service — manages transport partner fleet vehicles.
 *
 * Uses the `transport_vehicles` Drizzle table. Scopes all queries to the
 * requesting user's organizationId so partners only see their own fleet.
 */
import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { transportVehicles } from '../db/schema';
import { env } from '../env';

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
 * Shapes a raw DB row into the shape expected by the transport dashboard.
 * `status` is read directly from the dedicated column; falls back to deriving
 * it from `isActive` for rows that pre-date the migration.
 */
function toVehicleResponse(row: typeof transportVehicles.$inferSelect) {
  return {
    id: row.id,
    plateNumber: row.plateNumber,
    make: row.make ?? null,
    model: row.model ?? null,
    vehicleType: row.vehicleType ?? null,
    capacity: row.capacity ?? null,
    year: row.year ?? null,
    // The status column has a NOT NULL default of 'active', so it is always
    // present for new rows. For any legacy rows the column default covers it.
    status: row.status,
    // Screen 35's Vehicle Table needs both of these ("verification status,
    // QR status") -- previously omitted here even though the columns exist.
    isVerified: row.isVerified,
    qrCodeUrl: row.qrCodeUrl ?? null,
    qrGeneratedAt: row.qrGeneratedAt ? row.qrGeneratedAt.toISOString() : null,
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
 */
export async function createVehicle(organizationId: string, input: VehicleCreateInput) {
  const [row] = await db
    .insert(transportVehicles)
    .values({
      organizationId,
      plateNumber: input.plateNumber,
      make: input.make ?? null,
      model: input.model ?? null,
      vehicleType: input.vehicleType ?? null,
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
      ...(input.vehicleType !== undefined ? { vehicleType: input.vehicleType } : {}),
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
 * Generate (or regenerate) a vehicle's SafePass QR code (T-05).
 *
 * No image is rendered/stored here -- the token + verification URL are all
 * a QR code encodes anyway, so the dashboard renders the actual QR image
 * client-side (see apps/transport-dashboard's qr page) from
 * `qrCodeUrl` below. Regenerating invalidates the previous token
 * immediately (a fresh random token overwrites it in the same row), per
 * Screen 35: "Regenerate if compromised (invalidates previous token)".
 */
export async function generateVehicleQr(vehicleId: string, organizationId: string) {
  const existing = await db.query.transportVehicles.findFirst({
    where: and(
      eq(transportVehicles.id, vehicleId),
      eq(transportVehicles.organizationId, organizationId)
    ),
  });

  if (!existing) {
    throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });
  }

  // Short, URL-safe token -- collision odds are negligible at fleet scale,
  // and the qr_verification_token column has a unique index that would
  // surface a collision as a constraint violation rather than silently
  // colliding anyway.
  const token = crypto.randomBytes(6).toString('hex');
  const qrCodeUrl = `${env.VEHICLE_VERIFY_BASE_URL}/${token}`;

  const [row] = await db
    .update(transportVehicles)
    .set({
      qrVerificationToken: token,
      qrCodeUrl,
      qrGeneratedAt: new Date(),
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
 * Soft-delete a vehicle by setting status = 'inactive' and isActive = false.
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
    .set({ isActive: false, status: 'inactive' })
    .where(
      and(
        eq(transportVehicles.id, vehicleId),
        eq(transportVehicles.organizationId, organizationId)
      )
    )
    .returning();

  return toVehicleResponse(row);
}
