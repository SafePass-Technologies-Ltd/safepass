/**
 * Role Upgrade Routes — admin approval workflow for elevating user roles.
 *
 * GET   /v1/admin/role-upgrades        — list requests (?status=pending)
 * PATCH /v1/admin/role-upgrades/:id    — approve or reject a request
 *
 * Approving admin/super_admin requests requires the caller to already be
 * super_admin — a regular admin cannot grant admin-level access.
 *
 * Also exports `selfServiceRoleUpgradeRoutes`, mounted separately at
 * /v1/role-upgrades (no requireRole gate — any authenticated user), for a
 * plain `user` to request admin/monitoring_officer (staff) access on the
 * admin dashboard themselves. See its handlers below.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, organizations } from '../db/schema';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getRoleUpgradeRequests,
  getRoleUpgradeRequestById,
  approveRoleUpgradeRequest,
  rejectRoleUpgradeRequest,
  requiresSuperAdminReview,
  createRoleUpgradeRequest,
  getPendingRequestForUser,
} from '../services/role-upgrade.service';
import {
  sendRoleUpgradeApprovedEmail,
  sendRoleUpgradeRejectedEmail,
} from '../services/email.service';

// ────────────────────────────────────────────────────────────
// Self-service: a plain `user` requesting staff (admin/monitoring_officer)
// access on the admin dashboard. Mounted at /v1/role-upgrades — separate
// Hono instance from the admin-only /v1/admin/role-upgrades below since it
// deliberately has NO requireRole gate (every authenticated user, including
// a brand-new `user`-role signup, must be able to reach it).
// ────────────────────────────────────────────────────────────

const selfServiceRoleUpgradeRoutes = new Hono();
selfServiceRoleUpgradeRoutes.use('*', authMiddleware);

// Only staff-facing roles are self-requestable here. super_admin is never
// self-requestable (only ever hand-granted — see db/bootstrap-super-admin.ts
// per its own doc comment), and corporate_admin/transport_partner already
// have their own dedicated org-onboarding request flow (see
// organization.routes.ts) which also captures the organization details this
// generic endpoint has no way to collect.
const SelfServiceRequestSchema = z.object({
  requestedRole: z.enum(['admin', 'monitoring_officer']),
});

/**
 * POST /v1/role-upgrades/request
 * A user requests admin dashboard (staff) access. Creates a pending
 * role_upgrade_request for a super_admin/admin to review — does not change
 * the caller's role. Rejects a duplicate submission while one is already
 * pending, and rejects requesting a role the caller already has (or
 * outranks).
 */
selfServiceRoleUpgradeRoutes.post(
  '/request',
  zValidator('json', SelfServiceRequestSchema),
  async (c) => {
    const caller = c.get('user');
    const { requestedRole } = c.req.valid('json');

    if (caller.role === requestedRole || caller.role === 'super_admin' || caller.role === 'admin') {
      return c.json(
        { error: { code: 400, message: 'You already have this level of access or higher.' } },
        400
      );
    }

    const existing = await getPendingRequestForUser(caller.sub);
    if (existing) {
      return c.json(
        { error: { code: 409, message: 'You already have a pending role upgrade request.' } },
        409
      );
    }

    const request = await createRoleUpgradeRequest({ userId: caller.sub, requestedRole });
    return c.json(request, 201);
  }
);

/**
 * GET /v1/role-upgrades/mine
 * The caller's own most recent role upgrade request (any status) — lets
 * the request-access page show "pending review" / "rejected: <reason>"
 * instead of just a bare submit form after the first submission.
 */
selfServiceRoleUpgradeRoutes.get('/mine', async (c) => {
  const caller = c.get('user');

  const mine = await db.query.roleUpgradeRequests.findFirst({
    where: (table, { eq: eqOp }) => eqOp(table.userId, caller.sub),
    orderBy: (table, { desc }) => desc(table.createdAt),
  });

  return c.json({ request: mine ?? null });
});

export { selfServiceRoleUpgradeRoutes };

const roleUpgradeRoutes = new Hono();
roleUpgradeRoutes.use('*', authMiddleware);
roleUpgradeRoutes.use('*', requireRole('admin', 'super_admin'));

const StatusQuerySchema = z.enum(['pending', 'approved', 'rejected']);

/**
 * GET /v1/admin/role-upgrades
 * List role upgrade requests, optionally filtered by status.
 */
roleUpgradeRoutes.get('/', async (c) => {
  const statusParam = c.req.query('status');
  const parsed = statusParam ? StatusQuerySchema.safeParse(statusParam) : undefined;

  if (statusParam && !parsed?.success) {
    return c.json(
      { error: { code: 400, message: 'Invalid status. Must be pending, approved, or rejected.' } },
      400
    );
  }

  const requests = await getRoleUpgradeRequests(parsed?.data);
  return c.json({ requests });
});

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

/**
 * PATCH /v1/admin/role-upgrades/:id
 * Approve or reject a pending role upgrade request.
 * Body: { action: 'approve' | 'reject', reason?: string }
 */
roleUpgradeRoutes.patch('/:id', zValidator('json', ReviewSchema), async (c) => {
  const reviewer = c.get('user');
  const requestId = c.req.param('id');
  const { action, reason } = c.req.valid('json');

  const request = await getRoleUpgradeRequestById(requestId);
  if (!request) {
    return c.json({ error: { code: 404, message: 'Role upgrade request not found' } }, 404);
  }

  // Admin/super_admin elevation is too powerful for a regular admin to self-grant.
  if (requiresSuperAdminReview(request.requestedRole) && reviewer.role !== 'super_admin') {
    return c.json(
      {
        error: {
          code: 403,
          message: 'Only a super_admin can approve or reject admin/super_admin role upgrades',
        },
      },
      403
    );
  }

  try {
    if (action === 'approve') {
      const updated = await approveRoleUpgradeRequest(requestId, reviewer.sub);
      void notifyRequester(updated, 'approved');
      return c.json(updated);
    }

    const updated = await rejectRoleUpgradeRequest(requestId, reviewer.sub, reason);
    void notifyRequester(updated, 'rejected');
    return c.json(updated);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 400 | 404);
    }
    throw err;
  }
});

/** Looks up the requester and org, then fires the approval/rejection email. Best-effort. */
async function notifyRequester(
  request: { userId: string; requestedRole: string; organizationId: string | null; reason: string | null },
  outcome: 'approved' | 'rejected'
): Promise<void> {
  const requester = await db.query.users.findFirst({ where: eq(users.id, request.userId) });
  if (!requester) return;

  const organization = request.organizationId
    ? await db.query.organizations.findFirst({ where: eq(organizations.id, request.organizationId) })
    : null;

  // Phone auth users may have no email — skip notification in that case.
  if (!requester.email) return;

  if (outcome === 'approved') {
    await sendRoleUpgradeApprovedEmail({
      to: requester.email,
      fullName: requester.fullName,
      requestedRole: request.requestedRole,
      organizationName: organization?.name,
    });
  } else {
    await sendRoleUpgradeRejectedEmail({
      to: requester.email,
      fullName: requester.fullName,
      requestedRole: request.requestedRole,
      organizationName: organization?.name,
      reason: request.reason,
    });
  }
}

export { roleUpgradeRoutes };
