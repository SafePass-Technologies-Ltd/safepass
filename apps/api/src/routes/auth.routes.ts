/**
 * Auth routes — C-001 (token exchange) and C-002 (refresh).
 *
 * Error classification matters here more than anywhere else in the API: this is
 * the endpoint every sign-in passes through. On 2026-11-13 every login returned
 * 500 for hours because PostgreSQL was gone, and the only clue in the logs was
 * `Unhandled error: DrizzleQueryError: Failed query: select ... from "users"`.
 * The old classifier -- `err.message.includes('Firebase')` -- could not say
 * which stage had failed, and could not tell an expired ID token from a dead
 * database.
 *
 * So: a token the caller cannot use answers 401 with the contract's unchanged
 * body, and everything else is tagged with the stage that broke and logged as
 * one structured line (T-042). The stage never reaches the client.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FirebaseAuthError } from 'firebase-admin/auth';
import {
  exchangeFirebaseToken,
  refreshAccessToken,
  TokenExchangeError,
} from '../services/auth.service';

const authRoutes = new Hono();

/**
 * firebase-admin codes that mean the Firebase side is unhealthy -- not that the
 * caller's token is bad.
 *
 * These must not become a 401: telling the app "sign in again" during a Google
 * outage sends every user through a pointless re-authentication loop and hides
 * the outage behind a wall of expected-looking 401s, which is the same class of
 * blindness this task exists to remove.
 */
const FIREBASE_SIDE_CODES = new Set([
  'auth/internal-error',
  'auth/network-request-failed',
  'auth/insufficient-permission',
]);

/** Reads an error's `code`, if it has a string one. */
function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * True when firebase-admin is reporting that the supplied token is unusable
 * (expired, malformed, wrong audience, revoked user, ...).
 *
 * `instanceof FirebaseAuthError` is the primary check -- firebase-admin sets the
 * instance's prototype explicitly in its constructor, so it survives both the
 * CJS build the app loads and the `firebase-admin/auth` entry point used here.
 * The `auth/...` code prefix is kept as a second read because every auth error
 * is constructed with that prefix; a code-only match costs nothing and covers
 * an error that crossed a module boundary (e.g. a mock or a future SDK build).
 */
function isRejectedFirebaseToken(error: unknown): boolean {
  if (error instanceof FirebaseAuthError) {
    return !FIREBASE_SIDE_CODES.has(error.code);
  }

  const code = errorCodeOf(error);
  return code !== null && code.startsWith('auth/') && !FIREBASE_SIDE_CODES.has(code);
}

/**
 * True when this failure is the caller's token, at any depth.
 *
 * `exchangeFirebaseToken` tags failures with the stage that produced them and
 * keeps the original error as `cause` (C-001's signature and success shape are
 * frozen), so the firebase-admin error is checked one level down.
 */
function isRejectedToken(error: unknown): boolean {
  if (error instanceof TokenExchangeError) {
    return error.tokenRejected || isRejectedFirebaseToken(error.cause);
  }

  return isRejectedFirebaseToken(error);
}

/**
 * One structured line carrying the stage that failed, so CloudWatch shows
 * `stage: "user_lookup"` next to the 500 instead of an anonymous "Unhandled
 * error". The token itself is never logged.
 */
function logTokenExchangeFailure(c: Context, error: unknown): void {
  const stage = error instanceof TokenExchangeError ? error.stage : 'unclassified';
  // Correlation handle: a caller-supplied id wins, otherwise the ALB's trace id.
  const requestId = c.req.header('x-request-id') ?? c.req.header('x-amzn-trace-id') ?? null;

  const underlying = error instanceof TokenExchangeError ? error.cause : error;

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'token_exchange_failed',
      stage,
      requestId,
      code: errorCodeOf(underlying),
      name: error instanceof Error ? error.name : typeof error,
      message:
        error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300),
    })
  );
}

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
      if (isRejectedToken(err)) {
        return c.json(
          { error: { code: 401, message: 'Invalid Firebase ID token' } },
          401
        );
      }

      // Ours, not the caller's. Log the stage, rethrow so errorHandler answers
      // the opaque 500 -- the stage and the stack stay server-side.
      logTokenExchangeFailure(c, err);
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
