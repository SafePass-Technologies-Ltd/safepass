import { db } from '../db';
import { users, userVehicles } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { User, UserUpdate, UserVehicleCreate, UserVehicleUpdate, EmergencyContact } from '@safepass/shared';

// =============================================================================
// User Profile
// =============================================================================

/**
 * Get user by ID (full profile).
 * Converts Drizzle Date fields to ISO strings for API responses.
 */
export async function getUserById(userId: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) return null;

  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  } as unknown as User;
}

/**
 * Update user profile (phone, emergency contacts, notification preferences).
 */
export async function updateUser(
  userId: string,
  data: UserUpdate
): Promise<User> {
  const updateData: Record<string, unknown> = {};

  if (data.phone !== undefined) {
    updateData.phone = data.phone;
  }
  if (data.emergencyContacts !== undefined) {
    updateData.emergencyContacts = data.emergencyContacts;
  }
  if (data.notificationPreferences !== undefined) {
    updateData.notificationPreferences = data.notificationPreferences;
  }

  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  return updated as unknown as User;
}

// =============================================================================
// Emergency Contacts
// =============================================================================

/**
 * Get user's emergency contacts.
 */
export async function getEmergencyContacts(
  userId: string
): Promise<EmergencyContact[]> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { emergencyContacts: true },
  });
  return (user?.emergencyContacts as EmergencyContact[]) ?? [];
}

/**
 * Update user's emergency contacts.
 */
export async function updateEmergencyContacts(
  userId: string,
  contacts: EmergencyContact[]
): Promise<EmergencyContact[]> {
  const [updated] = await db
    .update(users)
    .set({
      emergencyContacts: contacts,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ emergencyContacts: users.emergencyContacts });

  return (updated?.emergencyContacts as EmergencyContact[]) ?? [];
}

// =============================================================================
// User Vehicles (saved personal vehicles)
// =============================================================================

/**
 * Get all vehicles saved by a user.
 */
export async function getUserVehicles(userId: string) {
  return db
    .select()
    .from(userVehicles)
    .where(eq(userVehicles.userId, userId))
    .orderBy(userVehicles.createdAt);
}

/**
 * Create a new saved vehicle for a user.
 */
export async function createUserVehicle(
  userId: string,
  data: UserVehicleCreate
) {
  const [vehicle] = await db
    .insert(userVehicles)
    .values({
      id: uuidv4(),
      userId,
      plateNumber: data.plateNumber,
      vehicleType: data.vehicleType,
      make: data.make ?? null,
      model: data.model ?? null,
      colour: data.colour ?? null,
      isDefault: data.isDefault ?? false,
    })
    .returning();

  // If set as default, unset other defaults
  if (data.isDefault) {
    await db
      .update(userVehicles)
      .set({ isDefault: false })
      .where(and(eq(userVehicles.userId, userId), eq(userVehicles.isDefault, true)));
    await db
      .update(userVehicles)
      .set({ isDefault: true })
      .where(eq(userVehicles.id, vehicle.id));
  }

  return vehicle;
}

/**
 * Update a saved vehicle.
 */
export async function updateUserVehicle(
  vehicleId: string,
  userId: string,
  data: UserVehicleUpdate
) {
  const updateData: Record<string, unknown> = {};

  if (data.plateNumber !== undefined) updateData.plateNumber = data.plateNumber;
  if (data.vehicleType !== undefined) updateData.vehicleType = data.vehicleType;
  if (data.make !== undefined) updateData.make = data.make;
  if (data.model !== undefined) updateData.model = data.model;
  if (data.colour !== undefined) updateData.colour = data.colour;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

  const [updated] = await db
    .update(userVehicles)
    .set(updateData)
    .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)))
    .returning();

  // Handle default logic
  if (data.isDefault === true) {
    await db
      .update(userVehicles)
      .set({ isDefault: false })
      .where(
        and(
          eq(userVehicles.userId, userId),
          eq(userVehicles.isDefault, true)
        )
      );
    await db
      .update(userVehicles)
      .set({ isDefault: true })
      .where(eq(userVehicles.id, vehicleId));
  }

  return updated;
}

/**
 * Delete a saved vehicle.
 */
export async function deleteUserVehicle(
  vehicleId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .delete(userVehicles)
    .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId)))
    .returning({ id: userVehicles.id });

  return result.length > 0;
}
