/**
 * C-002 revision 2 conformance for POST /v1/auth/refresh (T-046).
 *
 * THE FAILURE THIS GUARDS AGAINST
 *
 * The refresh handler ended in `catch { return 401 }`. Every failure looked the
 * same to it, so a database blip -- the kind 2026-11-13 produced for hours --
 * told every client "your session is invalid". The mobile client deletes its
 * stored session on any refresh failure, so the outage did not just fail
 * refresh calls: it logged out the entire user base and sent them back through
 * sign-in against a server that could not serve them.
 *
 * Revision 2 splits the classes:
 *
 *   401 -- ONLY the token itself is unusable (bad signature, expired,
 *          malformed, wrong type, or the user is gone/inactive). The session
 *          is dead and the client must re-authenticate.
 *   500 -- database unreachable, signing secret unavailable, a decode failure
 *          caused by configuration. The session may still be valid, so a client
 *          must KEEP its tokens and retry.
 *
 * These tests drive the REAL service and the REAL route together -- only
 * firebase-admin, the database and JWT signing are replaced -- so both the
 * stage tagging and the HTTP mapping are exercised, not just one of them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const hoisted = vi.hoisted(() => ({
  verifyRefreshToken: vi.fn(),
  issueAccessToken: vi.fn(),
  issueRefreshToken: vi.fn(),
  usersFindFirst: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: hoisted.verifyIdToken }) },
}));

vi.mock('../../db', () => ({
  db: {
    query: { users: { findFirst: hoisted.usersFindFirst } },
    insert: vi.fn(),
  },
}));

vi.mock('../../services/wallet.service', () => ({ createWallet: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  verifyRefreshToken: hoisted.verifyRefreshToken,
  issueAccessToken: hoisted.issueAccessToken,
  issueRefreshToken: hoisted.issueRefreshToken,
}));

import { authRoutes } from '../auth.routes';
import { errorHandler } from '../../middleware/error';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/auth', authRoutes);

/** Long-lived credential: must never appear in a log line. */
const REFRESH_TOKEN = 'never-log-this-refresh-token';

const USER_ID = '6f1d2c3b-4a59-4e8f-9b7a-1c2d3e4f5a6b';

async function refresh(): Promise<Response> {
  return app.request('/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-c002' },
    body: JSON.stringify({ refreshToken: REFRESH_TOKEN }),
  });
}

/**
 * A jose error as `jwtVerify` raises it.
 *
 * jose sets a stable `code` per error subclass (`ERR_JWT_EXPIRED`, ...) and
 * carries it on the instance; the classification reads exactly that, so the
 * code is the one thing a fake has to get right.
 */
function joseError(code: string, message = `jose verification failed (${code})`): Error {
  return Object.assign(new Error(message), { name: 'JWTExpired', code });
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
  // Production, because that is where the opaque 500 body is the contract.
  process.env.NODE_ENV = 'production';

  hoisted.verifyRefreshToken.mockResolvedValue(USER_ID);
  hoisted.usersFindFirst.mockResolvedValue(existingUser());
  hoisted.issueAccessToken.mockResolvedValue('new-access-token');
  hoisted.issueRefreshToken.mockResolvedValue('new-refresh-token');
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
    .find((entry) => entry.includes('refresh_failed'));
  expect(line).toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
}

describe('C-002 success shape', () => {
  it('returns exactly the frozen body and nothing else', async () => {
    const res = await refresh();

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // Revision 2 changed no shapes: still the two tokens, nothing added.
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(body.accessToken).toBe('new-access-token');
    expect(body.refreshToken).toBe('new-refresh-token');
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('C-002: 401 only for a dead session', () => {
  /**
   * Every case where the token genuinely cannot be used. All of these must stay
   * 401 -- a client that keeps retrying them is stuck forever.
   */
  const unusableTokens: Array<[string, () => unknown]> = [
    ['expired', () => joseError('ERR_JWT_EXPIRED')],
    ['badly signed', () => joseError('ERR_JWS_SIGNATURE_VERIFICATION_FAILED')],
    ['malformed', () => joseError('ERR_JWS_INVALID', 'Invalid Compact JWS')],
    ['structurally invalid', () => joseError('ERR_JWT_INVALID', 'Invalid JWT')],
    [
      'claim-invalid',
      () => joseError('ERR_JWT_CLAIM_VALIDATION_FAILED', '"iat" claim timestamp check failed'),
    ],
    [
      'not a refresh token',
      () => new HTTPException(401, { message: 'Invalid refresh token' }),
    ],
  ];

  it.each(unusableTokens)('answers 401 with the frozen body for a %s token', async (_label, make) => {
    hoisted.verifyRefreshToken.mockRejectedValue(make());

    const res = await refresh();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 401, message: 'Invalid or expired refresh token' },
    });
    // Expected traffic, not an incident: no error line, and the refresh token
    // is never written anywhere.
    expect(console.error).not.toHaveBeenCalled();
  });

  it('answers 401 when the user no longer exists', async () => {
    hoisted.usersFindFirst.mockResolvedValue(undefined);

    const res = await refresh();

    expect(res.status).toBe(401);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('answers 401 when the user is inactive', async () => {
    hoisted.usersFindFirst.mockResolvedValue(existingUser(false));

    const res = await refresh();

    // A suspended account is a dead session, not an outage.
    expect(res.status).toBe(401);
  });

  it('answers 401 for a verified token with no subject claim', async () => {
    hoisted.verifyRefreshToken.mockResolvedValue(undefined);

    const res = await refresh();

    expect(res.status).toBe(401);
    // No query is attempted for a token that cannot name a user.
    expect(hoisted.usersFindFirst).not.toHaveBeenCalled();
  });
});

describe('C-002: 500 for infrastructure that says nothing about the session', () => {
  it('answers 500 -- not 401 -- when the database is unreachable, tagged user_lookup', async () => {
    hoisted.usersFindFirst.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })
    );

    const res = await refresh();

    // The 2026-11-13 regression: a dead database must never look like a dead
    // session, in the response or in the logs.
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 500, message: 'Internal server error' } });
    expect(JSON.stringify(body)).not.toContain('user_lookup');

    const entry = loggedFailure();
    expect(entry.stage).toBe('user_lookup');
    expect(entry.code).toBe('ECONNREFUSED');
    expect(entry.requestId).toBe('req-c002');
    expect(String(entry.message)).toContain('ECONNREFUSED');
    // The refresh token is a credential; it must not appear in the log, and the
    // stage must not appear in the body.
    expect(JSON.stringify(entry)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(body)).not.toContain('refresh_failed');
  });

  it('answers 500 -- not 401 -- when the signing secret is unusable, tagged token_verify', async () => {
    // What jose raises when the key handed to it is not a usable secret (an
    // empty or wrongly-typed JWT_REFRESH_SECRET): a configuration fault that
    // would log out every single user if it were reported as a dead session.
    hoisted.verifyRefreshToken.mockRejectedValue(
      new TypeError('Zero-length key is not supported')
    );

    const res = await refresh();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const entry = loggedFailure();
    expect(entry.stage).toBe('token_verify');
    expect(String(entry.message)).toContain('Zero-length key');
  });

  it('answers 500 -- not 401 -- for a jose failure it cannot attribute to the token', async () => {
    // ERR_JOSE_NOT_SUPPORTED can come from a misconfigured secret just as
    // easily as from a hostile token, so it is not evidence of a dead session.
    hoisted.verifyRefreshToken.mockRejectedValue(joseError('ERR_JOSE_NOT_SUPPORTED'));

    const res = await refresh();

    expect(res.status).toBe(500);
    const entry = loggedFailure();
    expect(entry.stage).toBe('token_verify');
    expect(entry.code).toBe('ERR_JOSE_NOT_SUPPORTED');
  });

  it('answers 500 when the token cannot be re-issued, tagged token_issue', async () => {
    hoisted.issueAccessToken.mockRejectedValue(new Error('JWT_ACCESS_SECRET is not configured'));

    const res = await refresh();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const entry = loggedFailure();
    expect(entry.stage).toBe('token_issue');
  });

  it('treats an error it cannot place at all as a 500, never a 401', async () => {
    // Belt and braces: the safe default is to keep the session. A failure we do
    // not understand is not evidence that the user is logged out.
    hoisted.usersFindFirst.mockRejectedValue('not even an Error object');

    const res = await refresh();

    expect(res.status).toBe(500);
    const entry = loggedFailure();
    expect(entry.event).toBe('refresh_failed');
  });
});

describe('C-002: the stage stays server-side', () => {
  it('names the stage in exactly one log line and never in the body', async () => {
    hoisted.usersFindFirst.mockRejectedValue(
      Object.assign(new Error('timeout exceeded when trying to connect'), { code: 'ETIMEDOUT' })
    );

    const res = await refresh();
    const body = await res.json();

    // One line, so CloudWatch groups by event and stage without a second
    // message to correlate against. (The error handler's own "Unhandled error:"
    // line is separate and carries no stage.)
    const refreshLines = vi
      .mocked(console.error)
      .mock.calls.map(([entry]) => String(entry))
      .filter((entry) => entry.includes('refresh_failed'));
    expect(refreshLines).toHaveLength(1);

    const logged = refreshLines[0] as string;
    expect(logged).not.toContain('\n');
    expect(logged).not.toContain(REFRESH_TOKEN);
    expect(JSON.parse(logged).stage).toBe('user_lookup');

    for (const stage of ['token_verify', 'user_lookup', 'token_issue']) {
      expect(JSON.stringify(body)).not.toContain(stage);
    }
  });
});
