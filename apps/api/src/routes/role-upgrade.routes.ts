/**
 * Role Upgrade Routes — admin approval workflow for elevating user roles.
 *
 * GET   /v1/admin/role-upgrades        — list requests (?status=pending)
 * PATCH /v1/admin/role-upgrades/:id    — approve or reject a request
 *
 * Approving admin/super_admin requests requires the caller to already be
 * super_admin — a regular admin cannot grant admin-level access.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getRoleUpgradeRequests,
  getRoleUpgradeRequestById,
  approveRoleUpgradeRequest,
  rejectRoleUpgradeRequest,
  requiresSuperAdminReview,
} from '../services/role-upgrade.service';

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
      return c.json(updated);
    }

    const updated = await rejectRoleUpgradeRequest(requestId, reviewer.sub, reason);
    return c.json(updated);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 400 | 404);
    }
    throw err;
  }
});

export { roleUpgradeRoutes };
