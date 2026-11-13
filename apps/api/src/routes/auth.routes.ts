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
 * one structured line (T-042, T-046). The stage never reaches the client.
 *
 * The stakes are higher on refresh than on sign-in. Both clients react to a 401
 * by discarding the stored session, so a server fault reported as 401 does not
 * merely fail a request -- it deletes every user's session and forces them back
 * through sign-in (mobile `api_client`). C-002 revision 2 therefore splits the
 * classes explicitly, and the 401 path here is deliberately narrow.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FirebaseAuthError } from 'firebase-admin/auth';
import {
  exchangeFirebaseToken,
  refreshAccessToken,
  SessionRefreshError,
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
  'auth/insufficient-permission',
  // Raised by `ensureProjectId` when the SDK cannot resolve a project id at all
  // -- i.e. our service-account configuration is wrong. `verifyIdToken` cannot
  // resolve one for any user, so a 401 here put the whole user base into a
  // permanent sign-in loop against a server that would never accept them
  // (T-055).
  'auth/invalid-credential',
  // Not produced by the server SDK's `verifyIdToken` (it is a client-SDK code)
  // and kept only as a defensive entry: the real Google-side key-fetch failure
  // arrives as `auth/argument-error`, handled by
  // `isKeyFetchFailure` below.
  'auth/network-request-failed',
]);

/**
 * Phrases firebase-admin's key-fetch layer puts into an `auth/argument-error`.
 *
 * WHY THIS IS HERE, AND WHY IT IS NOT A GUESS (T-055)
 *
 * A JWKS/certificate fetch failure used to look exactly like a malformed token:
 * `verifyIdToken` maps it to `auth/argument-error`, which is a 401, so a Google
 * key-endpoint outage told every user to sign in again -- the precise failure
 * this classification exists to prevent.
 *
 * The cause survives the mapping, but only in the message. `mapJwtErrorToAuthError`
 * replaces the underlying `JwtError` with a fresh `FirebaseAuthError`, so
 * `error.code` is `auth/argument-error` for both classes, `error.cause` is never
 * set, and the JWT error code (`key-fetch-error`) is gone. The message is not:
 * the fallback branch passes the key-fetch reason through verbatim, and both
 * ways a key fetch can fail have a stable prefix of their own --
 *
 *   - an HTTP error or error payload from Google is wrapped by
 *     `UrlKeyFetcher` as "Error fetching public keys for Google certs: ...";
 *   - a DNS/socket/timeout failure is wrapped by firebase-admin's `HttpClient`
 *     as "Error while making request: ... Error code: <code>".
 *
 * Both were verified against firebase-admin 13.4.0 by driving the library's own
 * verifier and mapping function, not inferred from the types: a 503 from the
 * cert endpoint maps to `auth/argument-error` with the first message, an
 * unresolvable cert host maps to `auth/argument-error` with the second, and a
 * genuinely bad signature maps to `auth/argument-error` with "Firebase ID token
 * has invalid signature...".
 *
 * So the split is by message prefix, and the prefix is what makes it safe: every
 * key-fetch reason *is* the whole message, while firebase-admin's own
 * token-defect messages start with "Firebase ID token ..." / "Decoding Firebase
 * ID token failed ...". (They may *echo* a claim value later in the text, which
 * is why the match is anchored to the start -- see `isKeyFetchFailure`.)
 *
 * If a future firebase-admin renames either phrase, the match simply stops
 * firing and the behaviour returns to today's 401 -- the old behaviour, not a
 * new failure mode. That is the one direction a text match is allowed to
 * degrade in.
 */
const KEY_FETCH_FAILURE_MARKERS = [
  'Error fetching public keys for Google certs',
  'Error while making request',
];

/** Reads an error's `code`, if it has a string one. */
function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Reads an error's `message`, if it has a string one. */
function errorMessageOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

/**
 * True when an `auth/argument-error` is really a failure to fetch Google's
 * signing keys, not a bad token.
 *
 * Matched at the START of the message, not anywhere in it, and that detail
 * matters: firebase-admin echoes decoded claim values into its token-defect
 * messages ("... Expected "x" but got "<payload.aud>""), so a crafted token
 * could otherwise smuggle one of these phrases into a 401-shaped message and
 * have it read as a service outage. A key-fetch reason is the whole message and
 * always begins with the marker; an echoed claim never does.
 *
 * If a future firebase-admin renames either phrase the match stops firing and
 * the behaviour returns to today's 401 -- the old behaviour, not a new failure
 * mode. That is the direction a text match is allowed to degrade in.
 */
function isKeyFetchFailure(error: unknown): boolean {
  const message = errorMessageOf(error);
  if (message === null) return false;

  return KEY_FETCH_FAILURE_MARKERS.some((marker) => message.startsWith(marker));
}

/**
 * True when the failure is Firebase-side (ours): a Google/transport problem or
 * a local SDK misconfiguration, never the caller's token.
 */
function isFirebaseSideFailure(error: unknown): boolean {
  const code = errorCodeOf(error);
  if (code === null) return false;
  if (FIREBASE_SIDE_CODES.has(code)) return true;

  return code === 'auth/argument-error' && isKeyFetchFailure(error);
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
  const code = errorCodeOf(error);
  const looksLikeAuthError =
    error instanceof FirebaseAuthError || (code !== null && code.startsWith('auth/'));

  return looksLikeAuthError && !isFirebaseSideFailure(error);
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

/**
 * One structured line carrying the stage that failed a refresh (C-002 rev 2).
 *
 * Same shape as the token-exchange line so a single CloudWatch query covers
 * both auth endpoints. The refresh token -- a long-lived credential -- is never
 * logged, and the stage never reaches the response body.
 */
function logRefreshFailure(c: Context, error: unknown): void {
  const stage = error instanceof SessionRefreshError ? error.stage : 'unclassified';
  const requestId = c.req.header('x-request-id') ?? c.req.header('x-amzn-trace-id') ?? null;

  const underlying = error instanceof SessionRefreshError ? error.cause : error;

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'refresh_failed',
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
    } catch (err) {
      // C-002 revision 2: 401 ONLY for a dead session. The body is unchanged
      // from revision 1 -- clients key off the status, and the mobile client
      // wipes stored tokens on a 401, so this branch must stay narrow.
      if (err instanceof SessionRefreshError && err.sessionDead) {
        return c.json(
          { error: { code: 401, message: 'Invalid or expired refresh token' } },
          401
        );
      }

      // Infrastructure: database unreachable, signing secret unavailable, a
      // decode failure caused by configuration -- or an error we cannot place
      // at all. The session may still be valid, so it is a 500 and the client
      // keeps its tokens. Log the stage, then let errorHandler answer the
      // opaque body.
      logRefreshFailure(c, err);
      throw err;
    }
  }
);

export { authRoutes };
