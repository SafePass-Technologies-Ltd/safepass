import { admin } from './firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../middleware/auth';
import type { AuthProvider } from '@safepass/shared';
import { createWallet } from './wallet.service';

// Domain suffix for the placeholder email generated below for phone-auth
// users (who have no real email). Not a real, deliverable domain -- exists
// only to satisfy the users.email NOT NULL/unique-format constraints. Kept
// exported so other services (e.g. payment.routes.ts) can recognize and
// reject it as "not a real email" rather than treating it as usable, since
// it's syntactically well-formed but Paystack refuses it ("Invalid Email
// Address Passed") for having no real, resolvable domain.
export const PLACEHOLDER_EMAIL_DOMAIN = '@user.safepass';

/**
 * Where a token exchange failed.
 *
 * Token exchange is the one endpoint every sign-in goes through, and its four
 * stages fail for completely different reasons with completely different
 * urgency: a bad token is the caller's problem (401), while a database or
 * signing failure is ours (500 and someone should look at it). Collapsing them
 * into one anonymous "something broke" made a database outage look exactly like
 * a wrong password in the logs (T-042).
 */
export type TokenExchangeStage = 'firebase' | 'user_lookup' | 'wallet_provision' | 'token_issue';

/**
 * A token-exchange failure tagged with the stage that produced it.
 *
 * The original error stays reachable as `cause`, and the message is preserved
 * from it, so the route can still recognise a firebase-admin error underneath
 * and the dev-mode response stays as readable as it was.
 */
export class TokenExchangeError extends Error {
  readonly stage: TokenExchangeStage;

  /**
   * True when the caller's Firebase token itself is unusable (expired, wrong
   * audience, missing a claim we need) -- the only case that deserves a 401.
   */
  readonly tokenRejected: boolean;

  constructor(
    stage: TokenExchangeStage,
    message: string,
    options: { cause?: unknown; tokenRejected?: boolean } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'TokenExchangeError';
    this.stage = stage;
    this.tokenRejected = options.tokenRejected ?? false;
  }
}

/**
 * Wraps a stage failure, keeping the original message and error as the cause.
 */
function stageFailure(
  stage: TokenExchangeStage,
  error: unknown,
  fallbackMessage: string
): TokenExchangeError {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return new TokenExchangeError(stage, message, { cause: error });
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    fullName: string;
    phone: string | null;
    role: string;
    isNew: boolean;
  };
}

/**
 * Exchange a Firebase ID token for SafePass JWT tokens.
 *
 * Handles both social auth (Google, Facebook, Apple) and phone auth (SMS OTP).
 * - Social auth: email + name come from the provider; phone is null until onboarding.
 * - Phone auth: phone is extracted from the `phone_number` claim;
 *   email is a generated placeholder (phone auth provides no email).
 *
 * If the user doesn't exist in PostgreSQL, creates a new user record.
 *
 * Every failure is thrown as a `TokenExchangeError` carrying the stage it came
 * from (see `TokenExchangeStage`). The signature and the success result are
 * unchanged -- C-001 is a frozen contract; only the failure detail is richer,
 * and it never reaches the client.
 */
export async function exchangeFirebaseToken(
  firebaseIdToken: string
): Promise<TokenExchangeResult> {
  // 1. Verify Firebase ID token (single path for all providers)
  let decodedToken: DecodedIdToken;

  try {
    decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
  } catch (err) {
    // Only what firebase-admin reports as an `auth/...` failure is the token's
    // fault; a credential or transport failure from Google is an outage on our
    // side and must not be dressed up as "sign in again".
    throw stageFailure('firebase', err, 'Firebase ID token verification failed');
  }

  const authProviderId = decodedToken.uid;
  const provider = mapFirebaseProvider(decodedToken.firebase?.sign_in_provider);

  // Phone auth users have no email — use a secure placeholder.
  // Social auth users get their email from the provider.
  const isPhoneAuth = provider === 'phone';
  const email =
    decodedToken.email ?? (isPhoneAuth ? `phone_${authProviderId}${PLACEHOLDER_EMAIL_DOMAIN}` : null);

  if (!email) {
    // A token we cannot build an account from is still a token problem: no
    // amount of retrying fixes it, the app has to sign in again.
    throw new TokenExchangeError(
      'firebase',
      'Firebase token missing email claim and is not a phone auth token',
      { tokenRejected: true }
    );
  }

  // Extract phone from phone auth token (Firebase ID token includes `phone_number` claim)
  const phone = decodedToken.phone_number ?? null;

  const fullName = decodedToken.name ?? (isPhoneAuth ? 'User' : email.split('@')[0]);

  // 2. Find or create user in PostgreSQL
  let existingUser: typeof users.$inferSelect | undefined;

  try {
    existingUser = await db.query.users.findFirst({
      where: and(
        eq(users.authProvider, provider),
        eq(users.authProviderId, authProviderId)
      ),
    });
  } catch (err) {
    throw stageFailure('user_lookup', err, 'Failed to look up the user for this Firebase token');
  }

  let isNew = false;

  if (!existingUser) {
    const newUser: typeof users.$inferInsert = {
      id: uuidv4(),
      authProvider: provider,
      authProviderId,
      email,
      fullName,
      phone, // pre-populated for phone auth; null for social auth
      role: 'user',
      emergencyContacts: [],
      isVerified: true,
    };

    let created: typeof users.$inferSelect;

    try {
      [created] = await db.insert(users).values(newUser).returning();
    } catch (err) {
      throw stageFailure('user_lookup', err, 'Failed to create the user for this Firebase token');
    }

    existingUser = created;
    isNew = true;

    try {
      // Auto-provision wallet for new users (balance starts at 0).
      await createWallet({ ownerType: 'user', ownerId: existingUser.id });
    } catch (err) {
      throw stageFailure('wallet_provision', err, 'Failed to provision the wallet for a new user');
    }
  }

  // 3. Issue JWT tokens
  const jwtPayload: JwtPayload = {
    sub: existingUser.id,
    email: existingUser.email,
    role: existingUser.role,
    orgId: existingUser.organizationId ?? undefined,
  };

  let accessToken: string;
  let refreshToken: string;

  try {
    [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(jwtPayload),
      issueRefreshToken({ sub: existingUser.id }),
    ]);
  } catch (err) {
    throw stageFailure('token_issue', err, 'Failed to issue a SafePass session token');
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: existingUser.id,
      email: existingUser.email,
      fullName: existingUser.fullName,
      phone: existingUser.phone,
      role: existingUser.role,
      isNew,
    },
  };
}

/**
 * Where a session refresh failed (C-002 revision 2).
 *
 * The three stages fail for reasons that look identical to a client and are
 * completely different to an operator: a refresh token we cannot verify is the
 * caller's session being over, while a database or signing failure says nothing
 * about the session at all. Before revision 2 every one of them answered
 * `401 "Invalid or expired refresh token"`, and the mobile client reacts to any
 * refresh failure by clearing stored tokens -- so a database blip logged every
 * user out permanently, from a server fault they could not have retried their
 * way out of.
 */
export type RefreshStage = 'token_verify' | 'user_lookup' | 'token_issue';

/**
 * jose failures that positively mean the token itself is unusable.
 *
 * Allow-list, not deny-list, on purpose: the contract says `401` ONLY for a
 * token the caller cannot use, so an error we cannot place stays a `500` (the
 * session may still be valid) instead of logging the user out. That is why
 * `ERR_JOSE_NOT_SUPPORTED` and `ERR_JOSE_ALG_NOT_ALLOWED` are absent -- both
 * can be caused by a misconfigured signing secret, and a misconfiguration is by
 * definition not one user's session.
 *
 * @see jose `errors` module for the codes themselves.
 */
const UNUSABLE_REFRESH_TOKEN_CODES = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
]);

/** Reads a string `code` off an error, if it has one. */
function refreshErrorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * True only when the refresh token itself is unusable.
 *
 * `verifyRefreshToken` throws two kinds of error: a jose verification failure
 * (bad signature, expired, malformed -- all the token's fault) and an
 * `HTTPException(401)` of its own for a token whose `type` claim is not
 * `refresh`. Anything else reaching here -- a key/secret problem surfacing as a
 * `TypeError` from jose, an unexpected runtime fault -- is not evidence the
 * session is dead, so it must not be answered with a 401.
 */
function isUnusableRefreshToken(error: unknown): boolean {
  // `verifyRefreshToken` owns this one: a signed token of the wrong type.
  if (error instanceof HTTPException) {
    return error.status >= 400 && error.status < 500;
  }

  const code = refreshErrorCodeOf(error);
  return code !== null && UNUSABLE_REFRESH_TOKEN_CODES.has(code);
}

/**
 * A refresh failure tagged with the stage that produced it.
 *
 * The original error stays reachable as `cause` and its message is preserved,
 * so the route's structured log line still carries the driver's code. The stage
 * never reaches the response body (C-002).
 */
export class SessionRefreshError extends Error {
  readonly stage: RefreshStage;

  /**
   * True when the session is genuinely over (401): the token cannot be
   * verified, or the user it names is missing or inactive. False means we broke
   * (500) and the client must keep its tokens.
   */
  readonly sessionDead: boolean;

  constructor(
    stage: RefreshStage,
    message: string,
    options: { cause?: unknown; sessionDead?: boolean } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'SessionRefreshError';
    this.stage = stage;
    this.sessionDead = options.sessionDead ?? false;
  }
}

/**
 * Wraps a stage failure, keeping the original message and error as the cause.
 */
function refreshStageFailure(
  stage: RefreshStage,
  error: unknown,
  fallbackMessage: string,
  sessionDead = false
): SessionRefreshError {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return new SessionRefreshError(stage, message, { cause: error, sessionDead });
}

/**
 * A failure that genuinely ends the session: the token cannot identify a user,
 * or the user it identifies is gone. Nothing the client can retry.
 */
function deadSession(stage: RefreshStage, message: string): SessionRefreshError {
  return new SessionRefreshError(stage, message, { sessionDead: true });
}

/**
 * Refresh an access token using a valid refresh token.
 *
 * Every failure is thrown as a `SessionRefreshError` carrying the stage it came
 * from and whether the session is actually dead (C-002 revision 2). The success
 * shape is unchanged -- `{ accessToken, refreshToken }` is a frozen contract;
 * only the failure detail is richer, and it never reaches the client.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // 1. Verify the token. Only failures jose attributes to the token are the
  //    caller's; a key or configuration fault is ours.
  let sub: string;

  try {
    sub = await verifyRefreshToken(refreshToken);
  } catch (err) {
    throw refreshStageFailure(
      'token_verify',
      err,
      'Refresh token verification failed',
      isUnusableRefreshToken(err)
    );
  }

  // A verified token with no subject can never name a user, so no retry can
  // rescue it -- but it is checked structurally rather than schema-shaped:
  // anything stranger than this goes to the database and surfaces as
  // `user_lookup` (500), never as a mass logout.
  if (typeof sub !== 'string' || sub.length === 0) {
    throw deadSession('token_verify', 'Refresh token has no subject (sub) claim');
  }

  // 2. Load the user. A database fault here says nothing about the session.
  let user: typeof users.$inferSelect | undefined;

  try {
    user = await db.query.users.findFirst({
      where: eq(users.id, sub),
    });
  } catch (err) {
    throw refreshStageFailure('user_lookup', err, 'Failed to load the user for this refresh token');
  }

  if (!user || !user.isActive) {
    // The one user_lookup outcome that IS the session: deleted or suspended.
    throw deadSession('user_lookup', 'User not found or inactive');
  }

  // 3. Issue a fresh pair. A signing failure is infrastructure, not a logout.
  const jwtPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.organizationId ?? undefined,
  };

  try {
    const [newAccessToken, newRefreshToken] = await Promise.all([
      issueAccessToken(jwtPayload),
      issueRefreshToken({ sub: user.id }),
    ]);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch (err) {
    throw refreshStageFailure('token_issue', err, 'Failed to issue a refreshed SafePass session');
  }
}

/**
 * Map Firebase sign-in provider string to SafePass AuthProvider enum.
 *
 * Firebase `sign_in_provider` values:
 *   google.com   → google
 *   facebook.com → facebook
 *   apple.com    → apple
 *   phone        → phone
 */
function mapFirebaseProvider(signInProvider?: string): AuthProvider {
  switch (signInProvider) {
    case 'google.com':
      return 'google';
    case 'facebook.com':
      return 'facebook';
    case 'apple.com':
      return 'apple';
    case 'phone':
      return 'phone';
    default:
      return 'google';
  }
}
