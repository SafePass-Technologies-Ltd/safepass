/**
 * Vehicle Routes — fleet vehicle management for transport partners.
 *
 * GET    /v1/vehicles        — list vehicles for the authenticated user's org
 * POST   /v1/vehicles        — add a vehicle to the org
 * PATCH  /v1/vehicles/:id    — update a vehicle
 * DELETE /v1/vehicles/:id    — soft-delete a vehicle (sets isActive = false)
 *
 * All routes require auth. The user's orgId is taken from the JWT payload;
 * users without an orgId receive a 403.
 */
import { Hono, Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getVehiclesByOrg,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  generateVehicleQr,
} from '../services/vehicle.service';

// ────────────────────────────────────────────────────────────
// Validation schemas
// ────────────────────────────────────────────────────────────

const VehicleCreateSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required'),
  make: z.string().optional(),
  model: z.string().optional(),
  vehicleType: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  year: z.number().int().min(1990).optional(),
});

const VehicleUpdateSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vehicleType: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  year: z.number().int().min(1990).optional(),
});

// ────────────────────────────────────────────────────────────
// Route handlers
// ────────────────────────────────────────────────────────────

const vehicleRoutes = new Hono();
vehicleRoutes.use('*', authMiddleware);
// Fleet management is transport-partner-dashboard-only; admins may also manage via /v1/admin.
vehicleRoutes.use('*', requireRole('transport_partner', 'admin', 'super_admin'));

/** Require an organizationId on the authenticated user. */
function requireOrgId(c: Context) {
  const user = c.get('user');
  const orgId = user.orgId as string | undefined;
  if (!orgId) {
    return null;
  }
  return orgId;
}

/**
 * GET /v1/vehicles
 * List all vehicles for the authenticated user's organization.
 */
vehicleRoutes.get('/', async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const vehicles = await getVehiclesByOrg(orgId);
  return c.json({ vehicles });
});

/**
 * POST /v1/vehicles
 * Add a new vehicle to the organization's fleet.
 */
vehicleRoutes.post('/', zValidator('json', VehicleCreateSchema), async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const data = c.req.valid('json');
  const vehicle = await createVehicle(orgId, data);
  return c.json(vehicle, 201);
});

/**
 * PATCH /v1/vehicles/:id
 * Update a vehicle. Only vehicles owned by the user's org can be updated.
 */
vehicleRoutes.patch('/:id', zValidator('json', VehicleUpdateSchema), async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const vehicleId = c.req.param('id');
  const data = c.req.valid('json');
  const vehicle = await updateVehicle(vehicleId, orgId, data);
  return c.json(vehicle);
});

/**
 * GET /v1/vehicles/:id
 * Fetch a single vehicle (Screen 35's Vehicle Detail view).
 */
vehicleRoutes.get('/:id', async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const vehicle = await getVehicleById(c.req.param('id'), orgId);
  if (!vehicle) {
    return c.json({ error: { code: 404, message: 'Vehicle not found' } }, 404);
  }
  return c.json(vehicle);
});

/**
 * POST /v1/vehicles/:id/qr
 * Generate (or regenerate) this vehicle's SafePass QR code (T-05).
 */
vehicleRoutes.post('/:id/qr', async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const vehicleId = c.req.param('id');
  const vehicle = await generateVehicleQr(vehicleId, orgId);
  return c.json(vehicle, 201);
});

/**
 * DELETE /v1/vehicles/:id
 * Soft-delete a vehicle (sets isActive = false).
 */
vehicleRoutes.delete('/:id', async (c) => {
  const orgId = requireOrgId(c);
  if (!orgId) {
    return c.json({ error: { code: 403, message: 'No organization associated with this account' } }, 403);
  }

  const vehicleId = c.req.param('id');
  const vehicle = await deleteVehicle(vehicleId, orgId);
  return c.json(vehicle);
});

export { vehicleRoutes };
