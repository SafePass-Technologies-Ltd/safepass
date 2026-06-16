/**
 * Organization Service — manages corporate and transport partner organizations,
 * staff management, and organization wallet lifecycle.
 *
 * Handles:
 *   - Organization CRUD (corporate + transport_partner)
 *   - Staff/user management (add/remove/list users linked to an org)
 *   - Organization wallet integration (delegates to wallet.service)
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { organizations, users, roleUpgradeRequests as roleUpgradeRequestsTable } from '../db/schema';
import {
  createWallet,
  getWallet,
  getWalletTransactions as getTransactions,
} from './wallet.service';
import { createRoleUpgradeRequest } from './role-upgrade.service';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type OrgType = typeof organizations.$inferSelect['type'];
type OrgVerificationStatus = typeof organizations.$inferSelect['verificationStatus'];
type UserRole = typeof users.$inferSelect['role'];

const VALID_ORG_TYPES: readonly string[] = ['corporate', 'transport_partner'];

export interface OrganizationCreateInput {
  type: string;
  name: string;
  rcNumber?: string;
  industry?: string;
  address?: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail?: string;
}

export interface OrganizationUpdateInput {
  name?: string;
  rcNumber?: string;
  industry?: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  isActive?: boolean;
}

// ────────────────────────────────────────────────────────────
// Organization CRUD
// ────────────────────────────────────────────────────────────

/**
 * Create a new organization (corporate or transport partner).
 * Also creates an associated wallet.
 */
export async function createOrganization(
  input: OrganizationCreateInput
): Promise<typeof organizations.$inferSelect> {
  if (!VALID_ORG_TYPES.includes(input.type)) {
    throw Object.assign(
      new Error(`Invalid organization type: ${input.type}. Must be 'corporate' or 'transport_partner'.`),
      { statusCode: 400 }
    );
  }

  const [org] = await db
    .insert(organizations)
    .values({
      id: uuidv4(),
      type: input.type as OrgType,
      name: input.name,
      rcNumber: input.rcNumber ?? null,
      industry: input.industry ?? null,
      address: input.address ?? null,
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail ?? null,
      verificationStatus: 'pending',
      subscriptionPlan: 'none',
      isActive: true,
    })
    .returning();

  // Create a wallet for the organization.
  await createWallet({ ownerType: 'organization', ownerId: org.id });

  return org;
}

/**
 * Get an organization by ID.
 */
export async function getOrganizationById(
  orgId: string
): Promise<typeof organizations.$inferSelect | null> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  return org ?? null;
}

/**
 * List all organizations with optional type filter.
 */
export async function getAllOrganizations(
  type?: string,
  isActive?: boolean
): Promise<typeof organizations.$inferSelect[]> {
  const conditions = [];

  if (type && VALID_ORG_TYPES.includes(type)) {
    conditions.push(eq(organizations.type, type as OrgType));
  }

  if (isActive !== undefined) {
    conditions.push(eq(organizations.isActive, isActive));
  }

  return db.query.organizations.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(organizations.createdAt),
    limit: 100,
  });
}

/**
 * Update an organization's details.
 */
export async function updateOrganization(
  orgId: string,
  input: OrganizationUpdateInput
): Promise<typeof organizations.$inferSelect> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(organizations)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.rcNumber !== undefined ? { rcNumber: input.rcNumber } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  return updated;
}

/**
 * Update organization verification status (admin-only).
 */
export async function updateOrgVerification(
  orgId: string,
  verificationStatus: string
): Promise<typeof organizations.$inferSelect> {
  const validStatuses = ['pending', 'verified', 'rejected'];
  if (!validStatuses.includes(verificationStatus)) {
    throw Object.assign(
      new Error(`Invalid verification status: ${verificationStatus}`),
      { statusCode: 400 }
    );
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(organizations)
    .set({
      verificationStatus: verificationStatus as OrgVerificationStatus,
    })
    .where(eq(organizations.id, orgId))
    .returning();

  return updated;
}

// ────────────────────────────────────────────────────────────
// Staff / User Management (C-02)
// ────────────────────────────────────────────────────────────

/**
 * Add a user as a staff member of an organization.
 *
 * NOTE: this no longer promotes the user's role directly. Staff added via
 * this path (e.g. the org creator during onboarding) only gain dashboard
 * access once an admin approves a role_upgrade_requests entry — see
 * requestOrgRoleUpgrade. This function is retained for admin-driven staff
 * additions where the role is already approved (e.g. corporate_admin adding
 * an already-approved teammate to the same org without role change).
 */
export async function addStaffMember(
  orgId: string,
  userId: string
): Promise<typeof users.$inferSelect> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  if (!org.isActive) {
    throw Object.assign(new Error('Organization is not active'), { statusCode: 400 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(users)
    .set({
      organizationId: orgId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

/**
 * Submit a role upgrade request for the user who just created an organization.
 * The requestedRole matches the org type (corporate -> corporate_admin,
 * transport_partner -> transport_partner). The user's role is left as `user`
 * and their organizationId is NOT set until an admin approves the request —
 * this prevents self-signup from granting instant dashboard access.
 */
export async function requestOrgRoleUpgrade(
  orgId: string,
  userId: string,
  orgType: OrgType
): Promise<typeof roleUpgradeRequestsTable.$inferSelect> {
  const requestedRole = orgType === 'corporate' ? 'corporate_admin' : 'transport_partner';
  return createRoleUpgradeRequest({ userId, requestedRole, organizationId: orgId });
}

/**
 * Remove a staff member from an organization.
 */
export async function removeStaffMember(
  orgId: string,
  userId: string
): Promise<typeof users.$inferSelect> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.organizationId, orgId)),
  });

  if (!user) {
    throw Object.assign(new Error('User not found in this organization'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(users)
    .set({
      organizationId: null,
      role: 'user' as UserRole,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

/**
 * List all staff members of an organization.
 */
export async function getOrganizationStaff(
  orgId: string
): Promise<typeof users.$inferSelect[]> {
  return db.query.users.findMany({
    where: eq(users.organizationId, orgId),
    orderBy: desc(users.createdAt),
  });
}

// ────────────────────────────────────────────────────────────
// Organization Wallet (delegated)
// ────────────────────────────────────────────────────────────

/**
 * Get the wallet for an organization.
 */
export async function getOrganizationWallet(orgId: string) {
  return getWallet('organization', orgId);
}

/**
 * Get wallet transactions for an organization.
 * Resolves the wallet first, then fetches transactions.
 */
export async function getOrganizationWalletTransactions(
  orgId: string,
  limit = 50,
  offset = 0
) {
  const wallet = await getWallet('organization', orgId);
  if (!wallet) return [];
  return getTransactions(wallet.id, limit, offset);
}
