/**
 * Token-exchange route tests (T-042) -- C-001 error classification.
 *
 * Two behaviours are pinned here:
 *
 * 1. A token the caller cannot use still answers 401 with the exact body the
 *    frozen contract documents (`{ error: { code: 401, message: 'Invalid
 *    Firebase ID token' } }`), including when the failure arrives wrapped in a
 *    `TokenExchangeError` from the service.
 * 2. Everything else -- database, wallet provisioning, JWT signing -- is OUR
 *    failure: 500 with an opaque body, and one structured log line naming the
 *    stage that broke. That is the signal the old
 *    `err.message.includes('Firebase')` check could never give: during the
 *    2026-11-13 outage a dead PostgreSQL looked the same as a bad token in the
 *    logs, and nothing indicated which of the four stages had failed.
 *
 * The service module is mocked (it would otherwise pull in env.ts, firebase and
 * a live pool) but its exported `TokenExchangeError` is reimplemented with the
 * same shape, so the route's `instanceof` check is exercised for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { FirebaseAuthError } from 'firebase-admin/auth';

const hoisted = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('../../services/auth.service', () => {
  class TokenExchangeError extends Error {
    readonly stage: string;
    readonly tokenRejected: boolean;

    constructor(
      stage: string,
      message: string,
      options: { cause?: unknown; tokenRejected?: boolean } = {}
    ) {
      super(message, { cause: options.cause });
      this.name = 'TokenExchangeError';
      this.stage = stage;
      this.tokenRejected = options.tokenRejected ?? false;
    }
  }

  class SessionRefreshError extends Error {
    readonly stage: string;
    readonly sessionDead: boolean;

    constructor(
      stage: string,
      message: string,
      options: { cause?: unknown; sessionDead?: boolean } = {}
    ) {
      super(message, { cause: options.cause });
      this.name = 'SessionRefreshError';
      this.stage = stage;
      this.sessionDead = options.sessionDead ?? false;
    }
  }

  return {
    TokenExchangeError,
    SessionRefreshError,
    exchangeFirebaseToken: hoisted.mockExchange,
    refreshAccessToken: hoisted.mockRefresh,
  };
});

import { TokenExchangeError } from '../../services/auth.service';
import type { TokenExchangeStage } from '../../services/auth.service';
import { authRoutes } from '../auth.routes';
import { errorHandler } from '../../middleware/error';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/auth', authRoutes);

const TOKEN = 'never-log-this-token';

async function exchange(): Promise<Response> {
  return app.request('/v1/auth/token-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
    body: JSON.stringify({ firebaseIdToken: TOKEN }),
  });
}

/**
 * A real firebase-admin auth error, as `verifyIdToken` throws it.
 *
 * `FirebaseAuthError`'s published typing inherits `Error`'s constructor
 * (`message?`), while the implementation takes `({ code, message })` and
 * prefixes the code with `auth/`. The cast goes through the real runtime
 * constructor so `instanceof` and `auth/...` are both genuine.
 */
const FirebaseAuthErrorCtor = FirebaseAuthError as unknown as new (info: {
  code: string;
  message: string;
}) => FirebaseAuthError;

function firebaseAuthError(code: string): FirebaseAuthError {
  return new FirebaseAuthErrorCtor({ code, message: 'Firebase auth failure' });
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('POST /v1/auth/token-exchange', () => {
  it('returns the unchanged success shape', async () => {
    hoisted.mockExchange.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: 'user-1',
        email: 'a@b.com',
        fullName: 'A B',
        phone: null,
        role: 'user',
        isNew: false,
      },
    });

    const res = await exchange();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: 'user-1',
        email: 'a@b.com',
        fullName: 'A B',
        phone: null,
        role: 'user',
        isNew: false,
      },
    });
  });

  it('maps a wrapped firebase-admin token failure to 401 with the frozen body', async () => {
    hoisted.mockExchange.mockRejectedValue(
      new TokenExchangeError('firebase', 'Firebase auth failure', {
        cause: firebaseAuthError('id-token-expired'),
      })
    );

    const res = await exchange();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 401, message: 'Invalid Firebase ID token' },
    });
    // A rejected token is expected traffic, not an incident log entry.
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it('maps a raw firebase-admin token failure to 401', async () => {
    hoisted.mockExchange.mockRejectedValue(firebaseAuthError('invalid-id-token'));

    const res = await exchange();

    expect(res.status).toBe(401);
  });

  it('maps a token we cannot build an account from to 401', async () => {
    hoisted.mockExchange.mockRejectedValue(
      new TokenExchangeError('firebase', 'Firebase token missing email claim', {
        tokenRejected: true,
      })
    );

    const res = await exchange();

    expect(res.status).toBe(401);
  });

  it('answers 500, not 401, when the database is down and names the stage', async () => {
    hoisted.mockExchange.mockRejectedValue(
      new TokenExchangeError('user_lookup', 'Failed query: select ... from "users"', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      })
    );

    const res = await exchange();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const logged = vi.mocked(console.error).mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('token_exchange_failed'));
    expect(logged).toBeDefined();

    const entry = JSON.parse(logged as string) as Record<string, unknown>;
    expect(entry.stage).toBe('user_lookup');
    expect(entry.requestId).toBe('req-123');
    expect(entry.code).toBe('ECONNREFUSED');

    // The client learns nothing about the stage, and the token is never logged.
    expect(JSON.stringify(body)).not.toContain('user_lookup');
    expect(logged).not.toContain(TOKEN);
  });

  it('does not turn a Firebase-side outage into a 401', async () => {
    hoisted.mockExchange.mockRejectedValue(
      new TokenExchangeError('firebase', 'network-request-failed', {
        cause: firebaseAuthError('network-request-failed'),
      })
    );

    const res = await exchange();

    expect(res.status).toBe(500);
    const logged = vi.mocked(console.error).mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('token_exchange_failed'));
    expect(JSON.parse(logged as string).stage).toBe('firebase');
  });

  it.each(['wallet_provision', 'token_issue'] as TokenExchangeStage[])(
    'tags a %s failure and stays opaque',
    async (stage) => {
      hoisted.mockExchange.mockRejectedValue(new TokenExchangeError(stage, 'boom'));

      const res = await exchange();

      expect(res.status).toBe(500);
      const logged = vi.mocked(console.error).mock.calls
        .map(([line]) => String(line))
        .find((line) => line.includes('token_exchange_failed'));
      expect(JSON.parse(logged as string).stage).toBe(stage);
    }
  );
});
