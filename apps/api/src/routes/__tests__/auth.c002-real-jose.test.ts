/**
 * C-002 revision 2 against the REAL jwt library (T-046).
 *
 * WHY THIS FILE EXISTS
 *
 * The committed C-002 tests mock `verifyRefreshToken`, so every one of them
 * hands the classifier a hand-written error carrying a hand-written `code`. That
 * proves the switch statement; it does not prove that jose 6.2.0 raises those
 * codes. If the allow-list named a code the installed library never emits, the
 * mocked suite would stay green while production answered 500 for an expired
 * token -- i.e. every client would retry forever with a session that can only
 * be fixed by signing in again.
 *
 * So nothing here is mocked except the things that are not the subject:
 *   - `env`            (its real module validates and exits the process)
 *   - the database     (no PostgreSQL in the unit run)
 *   - firebase-admin   (not used by the refresh path)
 *   - wallet.service   (imported by behalf of token-exchange)
 * The real `verifyRefreshToken`, `refreshAccessToken`, route and error handler
 * all run, and every hostile token is signed/expired with the same jose the app
 * loads.
 *
 * The result is the enumerated mapping C-002 revisions 2 promises:
 *   401 - expired, bad signature, malformed, wrong token type, no subject,
 *         numeric subject, user gone, user inactive.
 *   500 - database unreachable, signing failure, anything unattributable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { SignJWT } from 'jose';

/**
 * `env.ts` exits the process when anything required is missing, which is why
 * every unit test that reaches it mocks it. These are the only two values
 * `middleware/auth` reads at import time; they are signing material for tokens
 * that never leave this process.
 */
const ACCESS_SECRET = 'a'.repeat(48);
const REFRESH_SECRET = 'r'.repeat(48);

vi.mock('../../env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'r'.repeat(48),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

const hoisted = vi.hoisted(() => ({
  usersFindFirst: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    query: { users: { findFirst: hoisted.usersFindFirst } },
    insert: vi.fn(),
  },
}));

vi.mock('../../services/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: vi.fn() }) },
}));

vi.mock('../../services/wallet.service', () => ({ createWallet: vi.fn() }));

import { authRoutes } from '../auth.routes';
import { errorHandler } from '../../middleware/error';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/auth', authRoutes);

const refreshSecretKey = new TextEncoder().encode(REFRESH_SECRET);
const accessSecretKey = new TextEncoder().encode(ACCESS_SECRET);
const otherSecretKey = new TextEncoder().encode('x'.repeat(48));

const USER_ID = '6f1d2c3b-4a59-4e8f-9b7a-1c2d3e4f5a6b';

/** FROZEN C-002 body for a dead session. */
const DEAD_SESSION_BODY = {
  error: { code: 401, message: 'Invalid or expired refresh token' },
};

const OPAQUE_500_BODY = {
  error: { code: 500, message: 'Internal server error' },
};

async function postRefresh(refreshToken: string): Promise<Response> {
  return app.request('/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

/** A refresh token exactly as `issueRefreshToken` builds one. */
function refreshToken(
  claims: Record<string, unknown> = {},
  options: { key?: Uint8Array; expiresIn?: string | number; issuedAt?: number } = {}
): Promise<string> {
  return new SignJWT({ sub: USER_ID, type: 'refresh', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(options.issuedAt)
    .setExpirationTime(options.expiresIn ?? '7d')
    .sign(options.key ?? refreshSecretKey);
}

/** An access token: same secret, no `type` claim. */
function accessToken(): Promise<string> {
  return new SignJWT({ sub: USER_ID, email: 'traveller@example.com', role: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecretKey);
}

function existingUser(isActive = true) {
  return {
    id: USER_ID,
    authProvider: 'google',
    authProviderId: 'firebase-uid-1',
    email: 'traveller@example.com',
    fullName: 'Ada Traveller',
    phone: null,
    role: 'user',
    organizationId: null,
    emergencyContacts: [],
    isVerified: true,
    isActive,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.NODE_ENV = 'production';
  hoisted.usersFindFirst.mockResolvedValue(existingUser());
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('C-002 r2 with real jose: 401 for a token the caller cannot use', () => {
  it('answers 401 for an expired refresh token (ERR_JWT_EXPIRED)', async () => {
    // Signed correctly, just old. This is `getAccessToken` expiring through a
    // real clock, the single most common refresh call there is: if it were a
    // 500 the client would retry it forever.
    const token = await refreshToken({}, { issuedAt: 1_600_000_000, expiresIn: 1_600_000_060 });

    const res = await postRefresh(token);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 for a token signed with the wrong secret', async () => {
    const token = await refreshToken({}, { key: otherSecretKey });

    const res = await postRefresh(token);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 for a string that is not a JWT at all', async () => {
    const res = await postRefresh('definitely-not-a-token');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 for a two-segment token (no signature)', async () => {
    const res = await postRefresh('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 for a real access token presented as a refresh token', async () => {
    // `verifyRefreshToken` rejects this itself, with an HTTPException(401):
    // the token is perfectly valid, it is simply the wrong kind. Before
    // revision 2 the route reached that exception and the generic catch turned
    // it into the same 401 by accident.
    const res = await postRefresh(await accessToken());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 for a correctly signed refresh token with no subject', async () => {
    const { sub: _omit, ...noSub } = { sub: USER_ID, type: 'refresh' };
    const token = await new SignJWT(noSub)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(refreshSecretKey);

    const res = await postRefresh(token);

    expect(res.status).toBe(401);
    // No user lookup is attempted for a token that cannot name one.
    expect(hoisted.usersFindFirst).not.toHaveBeenCalled();
  });

  it('answers 401 for a refresh token whose subject is not a string', async () => {
    // `verifyRefreshToken` returns `payload.sub as string` without checking, so
    // this is the shape that would otherwise become a query parameter.
    const token = await refreshToken({ sub: 12345 });

    const res = await postRefresh(token);

    expect(res.status).toBe(401);
    expect(hoisted.usersFindFirst).not.toHaveBeenCalled();
  });

  it('answers 401 when the subject no longer exists', async () => {
    hoisted.usersFindFirst.mockResolvedValue(undefined);

    const res = await postRefresh(await refreshToken());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(DEAD_SESSION_BODY);
  });

  it('answers 401 when the account is deactivated', async () => {
    hoisted.usersFindFirst.mockResolvedValue(existingUser(false));

    const res = await postRefresh(await refreshToken());

    expect(res.status).toBe(401);
  });
});

describe('C-002 r2 with real jose: 500 when the session says nothing about the failure', () => {
  it('answers 500 when the database refuses the connection', async () => {
    hoisted.usersFindFirst.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })
    );

    const res = await postRefresh(await refreshToken());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(OPAQUE_500_BODY);
    const line = vi
      .mocked(console.error)
      .mock.calls.map(([entry]) => String(entry))
      .find((entry) => entry.includes('refresh_failed'));
    expect(JSON.parse(line as string).stage).toBe('user_lookup');
  });

  it('answers 500 when the password was rotated out from under the pool (28P01)', async () => {
    // The 2026-07 rotation failure: a real RDS event, not a bad token.
    hoisted.usersFindFirst.mockRejectedValue(
      Object.assign(new Error('password authentication failed for user "safepass_admin"'), {
        code: '28P01',
      })
    );

    const res = await postRefresh(await refreshToken());

    expect(res.status).toBe(500);
  });

  it('answers 200 and a fresh pair for a valid refresh token', async () => {
    const res = await postRefresh(await refreshToken());

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'refreshToken']);
  });
});

describe('C-002 r2 with real jose: hostile algorithm choices (KNOWN GAP)', () => {
  /**
   * CHARACTERIZATION, NOT APPROVAL.
   *
   * jose refuses these tokens before it verifies anything, and the refusal is a
   * TypeError with no `code` -- because the "key" is a Uint8Array, which is
   * neither a CryptoKey, a KeyObject nor a JWK for `none`/`RS256`. The
   * backend's allow-list is code-based on purpose (an unattributable error must
   * not log anybody out), so these land on the 500 side.
   *
   * Reported to the tech lead as a LOW-severity gap: only a hostile or corrupt
   * client can produce this token, and 500 keeps the session rather than
   * deleting it, so the blast radius is a retry loop on that one device, not a
   * mass logout. These tests pin today's behaviour so a future fix is a visible
   * change rather than a silent one.
   */
  it('classifies an unsigned alg:none token as infrastructure (500), not a dead session', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: USER_ID, type: 'refresh' })).toString(
      'base64url'
    );

    const res = await postRefresh(`${header}.${payload}.`);

    expect(res.status).toBe(500);
  });

  it('classifies an RS256 header over an HMAC body as infrastructure (500)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: USER_ID, type: 'refresh' })).toString(
      'base64url'
    );
    const signature = Buffer.from('not-a-signature').toString('base64url');

    const res = await postRefresh(`${header}.${payload}.${signature}`);

    expect(res.status).toBe(500);
  });
});
