/**
 * Driver Routes — driver management for transport partners.
 *
 * GET  /v1/drivers    — list drivers for the authenticated user's org
 * POST /v1/drivers    — register a new driver under the org
 *
 * All routes require auth. The user's orgId is taken from the JWT payload.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getDriversByOrg, createDriver } from '../services/driver.service';

// ────────────────────────────────────────────────────────────
// Validation schemas
// ────────────────────────────────────────────────────────────

const DriverCreateSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone is required'),
  licenseNumber: z.string().min(1, 'License number is required'),
  /** organizationId sent by the dashboard — validated against the JWT's orgId. */
  organizationId: z.string().uuid().optional(),
});

// ────────────────────────────────────────────────────────────
// Route handlers
// ────────────────────────────────────────────────────────────

const driverRoutes = new Hono();
driverRoutes.use('*', authMiddleware);
// Driver management is transport-partner-dashboard-only; admins may also manage via /v1/admin.
driverRoutes.use('*', requireRole('transport_partner', 'admin', 'super_admin'));

/**
 * GET /v1/drivers
 * List all drivers for the authenticated user's organization.
 */
driverRoutes.get('/', async (c) => {
  const user = c.get('user');
  const orgId = user.orgId as string | undefined;
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const driverList = await getDriversByOrg(orgId);
  return c.json({ drivers: driverList });
});

/**
 * POST /v1/drivers
 * Register a new driver. The org is always taken from the JWT — the body's
 * organizationId is ignored if it differs, preventing cross-org writes.
 */
driverRoutes.post('/', zValidator('json', DriverCreateSchema), async (c) => {
  const user = c.get('user');
  const orgId = user.orgId as string | undefined;
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const data = c.req.valid('json');
  const driver = await createDriver({
    organizationId: orgId,
    fullName: data.fullName,
    phone: data.phone,
    licenseNumber: data.licenseNumber,
  });

  return c.json(driver, 201);
});

export { driverRoutes };
