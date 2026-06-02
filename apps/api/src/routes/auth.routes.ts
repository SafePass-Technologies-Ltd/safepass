import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { exchangeFirebaseToken, refreshAccessToken } from '../services/auth.service';

const authRoutes = new Hono();

// POST /v1/auth/token-exchange
// Exchange a Firebase ID token for SafePass JWT tokens
authRoutes.post(
  '/token-exchange',
  zValidator(
    'json',
    z.object({
      firebaseIdToken: z.string().min(1, 'Firebase ID token is required'),
    })
  ),
  async (c) => {
    const { firebaseIdToken } = c.req.valid('json');

    try {
      const result = await exchangeFirebaseToken(firebaseIdToken);

      return c.json(
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        },
        200
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('Firebase')) {
        return c.json(
          { error: { code: 401, message: 'Invalid Firebase ID token' } },
          401
        );
      }
      throw err;
    }
  }
);

// POST /v1/auth/refresh
// Refresh an access token using a valid refresh token
authRoutes.post(
  '/refresh',
  zValidator(
    'json',
    z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    })
  ),
  async (c) => {
    const { refreshToken } = c.req.valid('json');

    try {
      const result = await refreshAccessToken(refreshToken);
      return c.json(result, 200);
    } catch {
      return c.json(
        { error: { code: 401, message: 'Invalid or expired refresh token' } },
        401
      );
    }
  }
);

export { authRoutes };
