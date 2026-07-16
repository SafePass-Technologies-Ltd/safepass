import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  UserUpdateSchema,
  EmergencyContactSchema,
  UserVehicleCreateSchema,
  UserVehicleUpdateSchema,
  CreateDeletionRequestSchema,
} from '@safepass/shared';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { fcmTokens } from '../db/schema';
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
import {
  createDeletionRequest,
  getLatestDeletionRequest,
  cancelDeletionRequest,
} from '../services/account-deletion.service';

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

// =============================================================================
// FCM Push Tokens
// =============================================================================

const FcmTokenSchema = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(['android', 'ios', 'web']),
});

/**
 * POST /v1/users/me/fcm-token
 * Register or refresh a device FCM token for the authenticated user.
 * Uses an upsert (insert on conflict(token) do update) so re-registrations
 * after app reinstall or token rotation are handled cleanly.
 */
userRoutes.post('/me/fcm-token', zValidator('json', FcmTokenSchema), async (c) => {
  const user = c.get('user') as { sub: string };
  const { token, platform } = c.req.valid('json');

  // Upsert: if this token already exists (same physical device re-registering),
  // update the userId and platform to reflect any changes.
  await db
    .insert(fcmTokens)
    .values({
      userId: user.sub,
      token,
      platform,
    })
    .onConflictDoUpdate({
      target: fcmTokens.token,
      set: {
        userId: user.sub,
        platform,
        updatedAt: new Date(),
      },
    });

  return c.json({ status: 'registered' }, 200);
});

/**
 * DELETE /v1/users/me/fcm-token
 * Unregister a specific device FCM token (called on logout).
 * Body: { token: string }
 */
userRoutes.delete(
  '/me/fcm-token',
  zValidator('json', z.object({ token: z.string().min(1) })),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const { token } = c.req.valid('json');

    await db
      .delete(fcmTokens)
      .where(
        and(
          eq(fcmTokens.userId, user.sub),
          eq(fcmTokens.token, token)
        )
      );

    return c.json({ status: 'removed' }, 200);
  }
);

// =============================================================================
// Account Deletion (M-38) — see Flow 10 in docs/SafePass/user_flow.md
// =============================================================================

/**
 * POST /v1/users/me/deletion-request
 * Create a self-service account deletion request. Re-authentication and the
 * typed-confirmation UI live entirely client-side (Firebase reauth + the
 * mobile confirmation screen) -- this endpoint's `confirmation` field is a
 * server-side belt-and-braces check that the exact string was submitted,
 * and runs the pre-flight checks (active trip / wallet balance / sole org
 * admin) documented in Flow 10a.
 */
userRoutes.post(
  '/me/deletion-request',
  zValidator('json', CreateDeletionRequestSchema),
  async (c) => {
    const user = c.get('user') as { sub: string };
    const { forfeitWalletBalance } = c.req.valid('json');

    try {
      const request = await createDeletionRequest({
        userId: user.sub,
        forfeitWalletBalance,
      });
      return c.json(request, 201);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 500;
        return c.json({ error: { code, message: err.message } }, code as 404 | 409);
      }
      throw err;
    }
  }
);

/**
 * GET /v1/users/me/deletion-request
 * Most recent deletion request for the caller (any status), or null.
 * Powers the Profile screen's scheduled-deletion / legal-hold banner.
 */
userRoutes.get('/me/deletion-request', async (c) => {
  const user = c.get('user') as { sub: string };
  const request = await getLatestDeletionRequest(user.sub);
  return c.json({ request }, 200);
});

/**
 * DELETE /v1/users/me/deletion-request
 * Cancel a pending or legal_hold deletion request during/after the
 * cooling-off window (Flow 10b).
 */
userRoutes.delete('/me/deletion-request', async (c) => {
  const user = c.get('user') as { sub: string };

  try {
    const request = await cancelDeletionRequest(user.sub);
    return c.json(request, 200);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = (err as { statusCode?: number }).statusCode ?? 500;
      return c.json({ error: { code, message: err.message } }, code as 404);
    }
    throw err;
  }
});

export { userRoutes };
