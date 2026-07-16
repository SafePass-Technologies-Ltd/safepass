/**
 * Admin User Routes — user search, profile view, and account management.
 *
 * /v1/admin/users           — List/Search users
 * /v1/admin/users/:id       — Get user profile
 * /v1/admin/users/:id/suspend — Suspend/activate user
 */
import { Hono } from 'hono';
import { eq, like, or, and, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ForceDeleteSchema } from '@safepass/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import { db } from '../db';
import { users } from '../db/schema';
import { forceDeleteUser, getLatestDeletionRequest } from '../services/account-deletion.service';

const adminUserRoutes = new Hono();
adminUserRoutes.use('*', authMiddleware);
adminUserRoutes.use('*', requireRole('admin', 'monitoring_officer', 'super_admin'));

/**
 * GET /v1/admin/users
 * Search and list users.
 * Query: ?search=john&role=user&isActive=true&limit=20&offset=0
 */
adminUserRoutes.get('/', async (c) => {
  const search = c.req.query('search');
  const role = c.req.query('role');
  const isActive = c.req.query('isActive');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(users.fullName, pattern),
        like(users.email, pattern),
        like(users.phone, pattern)
      )!
    );
  }

  if (role) {
    conditions.push(eq(users.role, role as typeof users.$inferSelect['role']));
  }

  if (isActive !== undefined) {
    conditions.push(eq(users.isActive, isActive === 'true'));
  }

  const results = await db.query.users.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    offset,
    // Exclude auth provider IDs for privacy.
    columns: {
      authProviderId: false,
    },
  });

  return c.json({ users: results });
});

/**
 * GET /v1/admin/users/:id
 * Get a single user's full profile.
 */
adminUserRoutes.get('/:id', async (c) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, c.req.param('id')),
    columns: {
      authProviderId: false,
    },
  });

  if (!user) {
    return c.json({ error: { code: 404, message: 'User not found' } }, 404);
  }

  // M-38/A-27: surface the latest deletion request (if any) so the User
  // Management view can show "Account scheduled for deletion on [date]" /
  // "Deletion on hold" per screens.md Screen 15.
  const deletionRequest = await getLatestDeletionRequest(user.id);

  return c.json({ ...user, deletionRequest });
});

/**
 * PATCH /v1/admin/users/:id/suspend
 * Suspend or activate a user account.
 * Body: { isActive: boolean }
 */
const SuspendSchema = z.object({
  isActive: z.boolean(),
});

adminUserRoutes.patch('/:id/suspend', zValidator('json', SuspendSchema), async (c) => {
  const id = c.req.param('id');
  const { isActive } = c.req.valid('json');

  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!user) {
    return c.json({ error: { code: 404, message: 'User not found' } }, 404);
  }

  const [updated] = await db
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  const { authProviderId: _, ...safe } = updated;

  return c.json({
    user: safe,
    message: isActive ? 'User activated' : 'User suspended',
  });
});

/**
 * POST /v1/admin/users/:id/force-delete
 * super_admin-only (screens.md Screen 15/17c: "Not shown to non-super_admin
 * reviewers"). Bypasses the 14-day cooling-off period entirely -- for
 * confirmed legal/regulatory erasure requests (e.g. an escalated NDPR
 * data-subject request). Still respects an open legal hold unless
 * `overrideHold` is explicitly passed in the same request.
 * Body: { reason: string, overrideHold?: boolean }
 */
adminUserRoutes.post(
  '/:id/force-delete',
  requireRole('super_admin'),
  zValidator('json', ForceDeleteSchema),
  async (c) => {
    const actor = c.get('user') as { sub: string };
    const id = c.req.param('id');
    const { reason, overrideHold } = c.req.valid('json');

    try {
      const request = await forceDeleteUser(id, actor.sub, reason, overrideHold);
      return c.json(request, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404 | 409);
      }
      throw err;
    }
  }
);

export { adminUserRoutes };
