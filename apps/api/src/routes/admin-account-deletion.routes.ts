/**
 * Admin Account Deletion Routes — A-27 "Account Deletion Oversight &
 * Legal Holds".
 *
 * /v1/admin/account-deletions              — Legal Hold Queue listing
 * /v1/admin/account-deletions/:id/override — super_admin-only hold override
 *
 * Force-delete (POST /v1/admin/users/:id/force-delete) lives in
 * admin-user.routes.ts alongside the other per-user account actions
 * (suspend/activate), per screens.md Screen 15/17c.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { OverrideLegalHoldSchema } from '@safepass/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { listDeletionRequests, overrideLegalHold } from '../services/account-deletion.service';

const adminAccountDeletionRoutes = new Hono();
adminAccountDeletionRoutes.use('*', authMiddleware);
// Viewing the queue is available to admin/super_admin (matches the other
// admin oversight queues, e.g. adminTripRoutes); only super_admin may act
// on a legal hold (see the per-route gate on POST .../override below).
adminAccountDeletionRoutes.use('*', requireRole('admin', 'super_admin'));

/**
 * GET /v1/admin/account-deletions?status=legal_hold
 * List deletion requests for the Legal Hold Queue. Query `status` filters
 * to one of pending/legal_hold/completed/cancelled/force_deleted; omitted
 * returns all (capped at 200, newest first).
 */
adminAccountDeletionRoutes.get('/', async (c) => {
  const status = c.req.query('status') as
    | 'pending'
    | 'legal_hold'
    | 'completed'
    | 'cancelled'
    | 'force_deleted'
    | undefined;

  const requests = await listDeletionRequests(status);
  return c.json({ requests }, 200);
});

/**
 * POST /v1/admin/account-deletions/:id/override
 * super_admin-only: override an open legal hold and execute the deletion
 * cascade immediately, with a mandatory logged justification reason.
 */
adminAccountDeletionRoutes.post(
  '/:id/override',
  requireRole('super_admin'),
  zValidator('json', OverrideLegalHoldSchema),
  async (c) => {
    const actor = c.get('user') as { sub: string };
    const id = c.req.param('id');
    const { reason } = c.req.valid('json');

    try {
      const request = await overrideLegalHold(id, actor.sub, reason);
      return c.json(request, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404);
      }
      throw err;
    }
  }
);

export { adminAccountDeletionRoutes };
