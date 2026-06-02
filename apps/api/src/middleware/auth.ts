import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

// Declare typed context variables for Hono
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface JwtPayload {
  sub: string; // user ID (UUID)
  email: string;
  role: string;
  orgId?: string;
}

/**
 * Issue an access token (short-lived, 15 min).
 */
export async function issueAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(ACCESS_SECRET);
}

/**
 * Issue a refresh token (long-lived, 7 days).
 */
export async function issueRefreshToken(payload: Pick<JwtPayload, 'sub'>): Promise<string> {
  return new SignJWT({ sub: payload.sub, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
    .sign(REFRESH_SECRET);
}

/**
 * Verify an access token and return the payload.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  return payload as unknown as JwtPayload;
}

/**
 * Verify a refresh token and return the sub claim.
 */
export async function verifyRefreshToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET);
  if (payload.type !== 'refresh') {
    throw new HTTPException(401, { message: 'Invalid refresh token' });
  }
  return payload.sub as string;
}

/**
 * Hono middleware: requires a valid access token in the Authorization header.
 * Sets `c.set('user', payload)` for downstream handlers.
 */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    c.set('user', payload);
    await next();
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired access token' });
  }
}

/**
 * Hono middleware: requires a specific role (or higher).
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next): Promise<void> => {
    const user = c.get('user') as JwtPayload | undefined;
    if (!user) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    await next();
  };
}
