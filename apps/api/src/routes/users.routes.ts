import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  UserUpdateSchema,
  EmergencyContactSchema,
  UserVehicleCreateSchema,
  UserVehicleUpdateSchema,
} from '@safepass/shared';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import {
  getUserById,
  updateUser,
  getEmergencyContacts,
  updateEmergencyContacts,
  getUserVehicles,
  createUserVehicle,
  updateUserVehicle,
  deleteUserVehicle,
} from '../services/user.service';

const userRoutes = new Hono();

// All user routes require authentication
userRoutes.use('*', authMiddleware);

// =============================================================================
// User Profile
// =============================================================================

// GET /v1/users/me
userRoutes.get('/me', async (c) => {
  const user = c.get('user') as { sub: string };
  const profile = await getUserById(user.sub);

  if (!profile) {
    return c.json({ error: { code: 404, message: 'User not found' } }, 404);
  }

  return c.json(profile, 200);
});

// PATCH /v1/users/me
userRoutes.patch('/me', zValidator('json', UserUpdateSchema), async (c) => {
  const user = c.get('user') as { sub: string };
  const data = c.req.valid('json');
  const updated = await updateUser(user.sub, data);
  return c.json(updated, 200);
});

// =============================================================================
// Emergency Contacts
// =============================================================================

// GET /v1/users/me/emergency-contacts
userRoutes.get('/me/emergency-contacts', async (c) => {
  const user = c.get('user') as { sub: string };
  const contacts = await getEmergencyContacts(user.sub);
  return c.json({ contacts }, 200);
});

// PUT /v1/users/me/emergency-contacts
userRoutes.put(
  '/me/emergency-contacts',
  zValidator(
    'json',
    z.object({
      contacts: z.array(EmergencyContactSchema).min(1).max(3),
    })
  ),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const { contacts } = c.req.valid('json');
    const updated = await updateEmergencyContacts(user.sub, contacts);
    return c.json({ contacts: updated }, 200);
  }
);

// =============================================================================
// Saved Vehicles (UserVehicle CRUD)
// =============================================================================

// GET /v1/users/me/vehicles
userRoutes.get('/me/vehicles', async (c) => {
  const user = c.get('user') as { sub: string };
  const vehicles = await getUserVehicles(user.sub);
  return c.json({ vehicles }, 200);
});

// POST /v1/users/me/vehicles
userRoutes.post(
  '/me/vehicles',
  zValidator('json', UserVehicleCreateSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const data = c.req.valid('json');
    const vehicle = await createUserVehicle(user.sub, data);
    return c.json(vehicle, 201);
  }
);

// PATCH /v1/users/me/vehicles/:vehicleId
userRoutes.patch(
  '/me/vehicles/:vehicleId',
  zValidator('json', UserVehicleUpdateSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const vehicleId = c.req.param('vehicleId');
    const data = c.req.valid('json');

    const updated = await updateUserVehicle(vehicleId, user.sub, data);
    if (!updated) {
      return c.json({ error: { code: 404, message: 'Vehicle not found' } }, 404);
    }

    return c.json(updated, 200);
  }
);

// DELETE /v1/users/me/vehicles/:vehicleId
userRoutes.delete('/me/vehicles/:vehicleId', async (c) => {
  const user = c.get('user') as { sub: string };
  const vehicleId = c.req.param('vehicleId');

  const deleted = await deleteUserVehicle(vehicleId, user.sub);
  if (!deleted) {
    return c.json({ error: { code: 404, message: 'Vehicle not found' } }, 404);
  }

  return c.json({ success: true }, 200);
});

export { userRoutes };
