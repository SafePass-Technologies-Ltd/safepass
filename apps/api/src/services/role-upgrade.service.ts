/**
 * Role Upgrade Service — manages the approval workflow for elevating a
 * user's role above the default `user`.
 *
 * Requests are created either automatically (org onboarding submits a
 * corporate_admin/transport_partner request) or manually (admin-initiated
 * elevation to admin/super_admin/monitoring_officer). A user's `role` column
 * is never changed until an authorized reviewer approves the request.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { roleUpgradeRequests, users } from '../db/schema';

type RequestedRole = typeof roleUpgradeRequests.$inferSelect['requestedRole'];
type RequestStatus = typeof roleUpgradeRequests.$inferSelect['status'];
type UserRole = typeof users.$inferSelect['role'];

/** Roles that require super_admin sign-off — too powerful for a regular admin to grant. */
const SUPER_ADMIN_GATED_ROLES: readonly RequestedRole[] = ['admin', 'super_admin'];

export interface RoleUpgradeRequestInput {
  userId: string;
  requestedRole: RequestedRole;
  organizationId?: string;
}

/**
 * Create a pending role upgrade request. Does not modify the user's role.
 */
export async function createRoleUpgradeRequest(
  input: RoleUpgradeRequestInput
): Promise<typeof roleUpgradeRequests.$inferSelect> {
  const [request] = await db
    .insert(roleUpgradeRequests)
    .values({
      userId: input.userId,
      requestedRole: input.requestedRole,
      organizationId: input.organizationId ?? null,
      status: 'pending',
    })
    .returning();

  return request;
}

/**
 * List role upgrade requests, optionally filtered by status.
 */
export async function getRoleUpgradeRequests(
  status?: RequestStatus
): Promise<typeof roleUpgradeRequests.$inferSelect[]> {
  return db.query.roleUpgradeRequests.findMany({
    where: status ? eq(roleUpgradeRequests.status, status) : undefined,
    orderBy: (table, { desc }) => desc(table.createdAt),
  });
}

/**
 * Get a single role upgrade request by ID.
 */
export async function getRoleUpgradeRequestById(
  id: string
): Promise<typeof roleUpgradeRequests.$inferSelect | null> {
  const request = await db.query.roleUpgradeRequests.findFirst({
    where: eq(roleUpgradeRequests.id, id),
  });
  return request ?? null;
}

/**
 * Returns true if approving/rejecting `requestedRole` requires the reviewer
 * to be a super_admin (i.e. the request targets admin or super_admin).
 */
export function requiresSuperAdminReview(requestedRole: RequestedRole): boolean {
  return SUPER_ADMIN_GATED_ROLES.includes(requestedRole);
}

/**
 * Approve a pending role upgrade request: promotes the user's role and
 * marks the request as approved. Caller must have already verified the
 * reviewer's authorization (see requiresSuperAdminReview).
 */
export async function approveRoleUpgradeRequest(
  requestId: string,
  reviewerId: string
): Promise<typeof roleUpgradeRequests.$inferSelect> {
  const request = await db.query.roleUpgradeRequests.findFirst({
    where: eq(roleUpgradeRequests.id, requestId),
  });

  if (!request) {
    throw Object.assign(new Error('Role upgrade request not found'), { statusCode: 404 });
  }

  if (request.status !== 'pending') {
    throw Object.assign(
      new Error(`Request has already been ${request.status}`),
      { statusCode: 400 }
    );
  }

  // Apply the role change and mark the request approved together.
  await db
    .update(users)
    .set({
      role: request.requestedRole as UserRole,
      organizationId: request.organizationId ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(users.id, request.userId));

  const [updated] = await db
    .update(roleUpgradeRequests)
    .set({
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(roleUpgradeRequests.id, requestId))
    .returning();

  return updated;
}

/**
 * Reject a pending role upgrade request. The user's role is left unchanged.
 */
export async function rejectRoleUpgradeRequest(
  requestId: string,
  reviewerId: string,
  reason?: string
): Promise<typeof roleUpgradeRequests.$inferSelect> {
  const request = await db.query.roleUpgradeRequests.findFirst({
    where: eq(roleUpgradeRequests.id, requestId),
  });

  if (!request) {
    throw Object.assign(new Error('Role upgrade request not found'), { statusCode: 404 });
  }

  if (request.status !== 'pending') {
    throw Object.assign(
      new Error(`Request has already been ${request.status}`),
      { statusCode: 400 }
    );
  }

  const [updated] = await db
    .update(roleUpgradeRequests)
    .set({
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(roleUpgradeRequests.id, requestId))
    .returning();

  return updated;
}

/**
 * Find an existing pending request for a user (used to avoid duplicate
 * submissions when a user resubmits org onboarding).
 */
export async function getPendingRequestForUser(
  userId: string
): Promise<typeof roleUpgradeRequests.$inferSelect | null> {
  const request = await db.query.roleUpgradeRequests.findFirst({
    where: and(eq(roleUpgradeRequests.userId, userId), eq(roleUpgradeRequests.status, 'pending')),
  });
  return request ?? null;
}
