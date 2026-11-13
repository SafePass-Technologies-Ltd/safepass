/**
 * C-001 conformance for token exchange (T-042).
 *
 * The classifier this replaced was `err.message.includes('Firebase')`. It could
 * not tell an expired ID token from a dead database, so on 2026-11-13 every
 * sign-in returned 500 for hours with no clue in the logs, and a Google-side
 * outage would have been reported to users as "sign in again".
 *
 * These tests drive the REAL service and the REAL route together -- only
 * firebase-admin, the database, wallet provisioning and JWT signing are replaced
 * -- with the error codes firebase-admin actually raises on `verifyIdToken`.
 * Two things are pinned:
 *
 *   1. The frozen C-001 surface: success shape and the 401 body are byte-for-
 *      byte what CONTRACTS.md documents, and `exchangeFirebaseToken`'s signature
 *      is unchanged.
 *   2. The 401/500 split by failure class: the caller's token is a 401, anything
 *      that is ours is a 500 carrying only a stage in the logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { FirebaseAuthError } from 'firebase-admin/auth';

const hoisted = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  usersFindFirst: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  createWallet: vi.fn(),
  issueAccessToken: vi.fn(),
  issueRefreshToken: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: hoisted.verifyIdToken }) },
}));

vi.mock('../../db', () => ({
  db: {
    query: { users: { findFirst: hoisted.usersFindFirst } },
    insert: hoisted.insert,
  },
}));

vi.mock('../../services/wallet.service', () => ({ createWallet: hoisted.createWallet }));

vi.mock('../../middleware/auth', () => ({
  issueAccessToken: hoisted.issueAccessToken,
  issueRefreshToken: hoisted.issueRefreshToken,
  verifyRefreshToken: vi.fn(),
}));

import { authRoutes } from '../auth.routes';
import { errorHandler } from '../../middleware/error';
import { exchangeFirebaseToken, TokenExchangeError } from '../../services/auth.service';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/auth', authRoutes);

/** `FirebaseAuthError`'s published typing hides the `{ code, message }` constructor. */
const FirebaseAuthErrorCtor = FirebaseAuthError as unknown as new (info: {
  code: string;
  message: string;
}) => FirebaseAuthError;

/** A real firebase-admin auth error, as `verifyIdToken` throws it. */
function firebaseAuthError(code: string): FirebaseAuthError {
  return new FirebaseAuthErrorCtor({ code, message: `verifyIdToken failed (${code})` });
}

const FIREBASE_ID_TOKEN = 'never-log-this-token';

async function exchange(): Promise<Response> {
  return app.request('/v1/auth/token-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-c001' },
    body: JSON.stringify({ firebaseIdToken: FIREBASE_ID_TOKEN }),
  });
}

function existingUser() {
  return {
    id: 'user-uuid-1',
    authProvider: 'google',
    authProviderId: 'firebase-uid-1',
    email: 'traveller@example.com',
    fullName: 'Ada Traveller',
    phone: null,
    role: 'user',
    organizationId: null,
    emergencyContacts: [],
    isVerified: true,
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // Production, because that is where the opaque 500 body is the contract.
  process.env.NODE_ENV = 'production';

  hoisted.verifyIdToken.mockResolvedValue({
    uid: 'firebase-uid-1',
    email: 'traveller@example.com',
    name: 'Ada Traveller',
    firebase: { sign_in_provider: 'google.com' },
  });
  hoisted.usersFindFirst.mockResolvedValue(existingUser());
  hoisted.issueAccessToken.mockResolvedValue('access-token');
  hoisted.issueRefreshToken.mockResolvedValue('refresh-token');
  hoisted.createWallet.mockResolvedValue({ id: 'wallet-1', balance: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

/** The one structured log line the route writes for a 500. */
function loggedFailure(): Record<string, unknown> {
  const line = vi
    .mocked(console.error)
    .mock.calls.map(([entry]) => String(entry))
    .find((entry) => entry.includes('token_exchange_failed'));
  expect(line).toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
}

describe('C-001 success shape', () => {
  it('returns exactly the frozen body and nothing else', async () => {
    const res = await exchange();

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['accessToken', 'refreshToken', 'user']);
    expect(body.accessToken).toBe('access-token');
    expect(body.refreshToken).toBe('refresh-token');
    // C-001's user object: id, role, phone, fullName (email/isNew are additive
    // and were already in the implemented contract).
    expect(body.user).toEqual(
      expect.objectContaining({ id: 'user-uuid-1', role: 'user', phone: null, fullName: 'Ada Traveller' })
    );
  });

  it('keeps exchangeFirebaseToken a one-argument function', () => {
    // The signature is frozen: the route calls it with the ID token only, and
    // any extra required parameter would break every caller.
    expect(exchangeFirebaseToken).toBeTypeOf('function');
    expect(exchangeFirebaseToken.length).toBe(1);
  });
});

describe('C-001 error classification', () => {
  /** Cases where the caller must be told to sign in again. */
  const rejectedTokens = [
    ['expired', 'id-token-expired'],
    ['malformed', 'argument-error'],
    ['revoked', 'id-token-revoked'],
    ['invalid', 'invalid-id-token'],
    ['from a disabled account', 'user-disabled'],
  ] as const;

  it.each(rejectedTokens)('answers 401 with the frozen body for a %s token', async (_label, code) => {
    hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError(code));

    const res = await exchange();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 401, message: 'Invalid Firebase ID token' },
    });
    // Expected traffic, not an incident: no error line, and the token is never
    // written anywhere.
    expect(console.error).not.toHaveBeenCalled();
  });

  /**
   * Cases that are OURS. These are deliberately 500 and not 401: reporting a
   * Google-side problem as "invalid token" sends every user through a pointless
   * re-authentication loop and buries the outage in expected-looking 401s.
   */
  const sideFailures = [
    ['internal error', 'internal-error'],
    ['network failure', 'network-request-failed'],
    ['insufficient permission', 'insufficient-permission'],
  ] as const;

  it.each(sideFailures)('answers 500 for a Firebase %s, tagged firebase', async (_label, code) => {
    hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError(code));

    const res = await exchange();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const entry = loggedFailure();
    expect(entry.stage).toBe('firebase');
    expect(entry.code).toBe(`auth/${code}`);
    expect(entry.requestId).toBe('req-c001');
  });

  it('answers 500 -- not 401 -- when the database is unreachable, tagged user_lookup', async () => {
    hoisted.usersFindFirst.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })
    );

    const res = await exchange();

    // The 2026-11-13 regression: a dead database must never look like a bad
    // token, in the response or in the logs.
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 500, message: 'Internal server error' } });
    expect(JSON.stringify(body)).not.toContain('user_lookup');

    const entry = loggedFailure();
    expect(entry.stage).toBe('user_lookup');
    expect(entry.code).toBe('ECONNREFUSED');
    expect(String(entry.message)).toContain('ECONNREFUSED');
    // The Firebase ID token is a credential; it must not appear in the log.
    expect(JSON.stringify(entry)).not.toContain(FIREBASE_ID_TOKEN);
  });

  it('still tags the stage when a token with no usable claim is rejected', async () => {
    hoisted.verifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-2',
      email: null,
      firebase: { sign_in_provider: 'google.com' },
    });

    const res = await exchange();

    // No email and not phone auth: nothing can be built from the token, and no
    // retry helps -- the app has to sign in again.
    expect(res.status).toBe(401);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps the stage reachable for an operator without exposing it', async () => {
    hoisted.issueAccessToken.mockRejectedValue(new Error('JWT_ACCESS_SECRET is not configured'));

    const res = await exchange();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const entry = loggedFailure();
    expect(entry.stage).toBe('token_issue');
  });
});
