import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for rotating RDS credentials.
 *
 * RDS rotates the master password natively every 7 days. The API used to read
 * it once at startup and bake it into a connection string, so every rotation
 * broke production: PostgreSQL authenticates per CONNECTION, so live pooled
 * connections kept working while new ones failed with 28P01 -- hours later,
 * when the pool next needed one. It took production down on 2026-07-22 and
 * again on 2026-07-29, one rotation interval apart, and a task restart masked
 * it each time by incidentally re-reading the secret.
 *
 * `getDatabasePassword` is handed to postgres.js as its `password` option and
 * is therefore called on EVERY new connection, which is what makes a rotation
 * self-healing. These tests pin the three properties that matter: it refreshes
 * after the TTL, it does not stampede Secrets Manager, and it degrades to the
 * last known-good value rather than failing connections outright.
 *
 * Note this imports `../credentials`, NOT `../../env` -- env.ts validates the
 * whole environment at import time and calls process.exit(1) when anything is
 * missing, which is exactly how this suite first failed in CI (it passed
 * locally only because a root .env happened to satisfy the schema).
 */

const send = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));

function secretResponse(password: string) {
  return { SecretString: JSON.stringify({ username: 'safepass_admin', password }) };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  send.mockReset();
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:eu-west-2:123:secret:rds!db-test';
  process.env.DB_HOST = 'db.example.com';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'safepass';
  process.env.AWS_REGION = 'eu-west-2';
  delete process.env.DATABASE_URL;

  const { resetDatabaseCredentials } = await import('../credentials');
  resetDatabaseCredentials();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('getDatabasePassword', () => {
  it('reads the current password from the RDS-managed secret', async () => {
    send.mockResolvedValue(secretResponse('rotated-password-1'));
    const { getDatabasePassword } = await import('../credentials');

    await expect(getDatabasePassword()).resolves.toBe('rotated-password-1');
  });

  it('caches within the TTL so it does not call Secrets Manager per connection', async () => {
    send.mockResolvedValue(secretResponse('pw'));
    const { getDatabasePassword } = await import('../credentials');

    // A pool opening 20 connections must not make 20 GetSecretValue calls.
    for (let i = 0; i < 20; i += 1) await getDatabasePassword();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('picks up a rotated password once the TTL expires', async () => {
    send.mockResolvedValueOnce(secretResponse('old-password'));
    const { getDatabasePassword } = await import('../credentials');

    await expect(getDatabasePassword()).resolves.toBe('old-password');

    // AWS rotates the master password.
    send.mockResolvedValueOnce(secretResponse('new-password'));
    vi.advanceTimersByTime(6 * 60 * 1000);

    // The whole point: a new connection self-heals, with no redeploy.
    await expect(getDatabasePassword()).resolves.toBe('new-password');
  });

  it('collapses concurrent refreshes into a single fetch', async () => {
    let resolveSecret: (v: unknown) => void = () => {};
    send.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecret = resolve;
        })
    );
    const { getDatabasePassword } = await import('../credentials');

    // A pool warming up fires several connections at once; that must not
    // become several simultaneous GetSecretValue calls.
    const all = Promise.all([getDatabasePassword(), getDatabasePassword(), getDatabasePassword()]);
    resolveSecret(secretResponse('pw'));

    await expect(all).resolves.toEqual(['pw', 'pw', 'pw']);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falls back to the last known-good password if Secrets Manager is unreachable', async () => {
    send.mockResolvedValueOnce(secretResponse('known-good'));
    const { getDatabasePassword } = await import('../credentials');
    await getDatabasePassword();

    send.mockRejectedValueOnce(new Error('ThrottlingException'));
    vi.advanceTimersByTime(6 * 60 * 1000);

    // A transient Secrets Manager blip must not take the database down; the
    // cached password still works until it is actually rotated.
    await expect(getDatabasePassword()).resolves.toBe('known-good');
  });

  it('propagates the error when there is no cached password to fall back to', async () => {
    send.mockRejectedValue(new Error('AccessDeniedException'));
    const { getDatabasePassword } = await import('../credentials');

    // Nothing usable and nothing cached: failing loudly beats connecting with
    // an empty password and reporting a confusing auth error.
    await expect(getDatabasePassword()).rejects.toThrow('AccessDeniedException');
  });

  it('uses DATABASE_URL locally, so dev and CI need no AWS access', async () => {
    delete process.env.DB_SECRET_ARN;
    process.env.DATABASE_URL = 'postgresql://user:l0cal%40pass@localhost:5432/safepass';
    const { getDatabasePassword } = await import('../credentials');

    // Percent-encoded characters must survive the round trip.
    await expect(getDatabasePassword()).resolves.toBe('l0cal@pass');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('28P01 credential recovery (T-040)', () => {
  it('recognises 28P01 directly and through the Drizzle cause chain', async () => {
    const { isPasswordAuthFailure } = await import('../credentials');

    expect(isPasswordAuthFailure({ code: '28P01' })).toBe(true);
    // Drizzle wraps the driver error, so the SQLSTATE sits under `cause`.
    expect(isPasswordAuthFailure(new Error('Failed query', { cause: { code: '28P01' } }))).toBe(true);

    // Not every connection error is a credential problem; retrying those would
    // hide the real fault behind a second identical failure.
    expect(isPasswordAuthFailure({ code: '57P01' })).toBe(false);
    expect(isPasswordAuthFailure(new Error('boom'))).toBe(false);
    expect(isPasswordAuthFailure(null)).toBe(false);
    expect(isPasswordAuthFailure('28P01')).toBe(false);
  });

  it('drops the cached password and retries once with a freshly read one', async () => {
    send.mockResolvedValueOnce(secretResponse('dead-password'));
    const { getDatabasePassword, withPasswordAuthRetry } = await import('../credentials');

    // No time passes (fake timers), so the cache is still well inside its TTL
    // when the rotation is rejected -- without invalidation the retry would
    // present the same dead password forever.
    await expect(getDatabasePassword()).resolves.toBe('dead-password');

    send.mockResolvedValueOnce(secretResponse('rotated-password'));

    const passwordsUsed: string[] = [];
    const operation = vi.fn(async () => {
      const password = await getDatabasePassword();
      passwordsUsed.push(password);
      if (passwordsUsed.length === 1) {
        throw Object.assign(new Error('password authentication failed for user "safepass_admin"'), {
          code: '28P01',
        });
      }
      return 'connected';
    });

    await expect(withPasswordAuthRetry(operation)).resolves.toBe('connected');

    expect(passwordsUsed).toEqual(['dead-password', 'rotated-password']);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);

    // The recovery must be visible in CloudWatch on its own.
    const warn = vi.mocked(console.warn).mock.calls.map(([line]) => String(line));
    expect(warn.some((line) => line.includes('28P01'))).toBe(true);
  });

  it('never retries more than once', async () => {
    send.mockResolvedValue(secretResponse('always-dead'));
    const { getDatabasePassword, withPasswordAuthRetry } = await import('../credentials');

    const operation = vi.fn(async () => {
      await getDatabasePassword();
      throw Object.assign(new Error('password authentication failed'), { code: '28P01' });
    });

    await expect(withPasswordAuthRetry(operation)).rejects.toMatchObject({ code: '28P01' });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('surfaces the error instead of retrying a dead password when Secrets Manager is also down', async () => {
    send.mockResolvedValueOnce(secretResponse('dead-password'));
    const { getDatabasePassword, withPasswordAuthRetry } = await import('../credentials');
    await getDatabasePassword();

    // The cache still holds the rejected password, and the refresh cannot read
    // the secret. Falling back to the cache here is what turned a single
    // rotation into a permanent outage.
    send.mockRejectedValueOnce(new Error('ThrottlingException'));

    const operation = vi.fn(async () => {
      await getDatabasePassword();
      throw Object.assign(new Error('password authentication failed'), { code: '28P01' });
    });

    await expect(withPasswordAuthRetry(operation)).rejects.toThrow('ThrottlingException');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('still collapses concurrent refreshes after an invalidation', async () => {
    send.mockResolvedValueOnce(secretResponse('dead-password'));
    const { getDatabasePassword, invalidateDatabasePassword } = await import('../credentials');
    await getDatabasePassword();

    invalidateDatabasePassword();

    let resolveSecret: (value: unknown) => void = () => undefined;
    send.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecret = resolve;
        })
    );

    const all = Promise.all([
      getDatabasePassword(),
      getDatabasePassword(),
      getDatabasePassword(),
    ]);
    resolveSecret(secretResponse('rotated-password'));

    await expect(all).resolves.toEqual([
      'rotated-password',
      'rotated-password',
      'rotated-password',
    ]);
    // One for the initial read, one for the collapsed refresh.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not let a refresh started before an invalidation re-cache the dead password', async () => {
    send.mockResolvedValueOnce(secretResponse('dead-password'));
    const { getDatabasePassword, invalidateDatabasePassword } = await import('../credentials');
    await getDatabasePassword();

    // A refresh is in flight when the rotation is rejected.
    let resolveStale: (value: unknown) => void = () => undefined;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        })
    );
    vi.advanceTimersByTime(6 * 60 * 1000);
    const staleRefresh = getDatabasePassword();

    invalidateDatabasePassword();
    resolveStale(secretResponse('dead-password'));
    await staleRefresh;

    // The next connection must read the secret again rather than inherit the
    // password the server has already rejected.
    send.mockResolvedValueOnce(secretResponse('rotated-password'));
    await expect(getDatabasePassword()).resolves.toBe('rotated-password');
  });
});

describe('getDatabaseConnection', () => {
  it('returns discrete parameters when the managed secret is configured', async () => {
    const { getDatabaseConnection } = await import('../credentials');

    expect(getDatabaseConnection()).toEqual({
      host: 'db.example.com',
      port: 5432,
      database: 'safepass',
      username: 'safepass_admin',
    });
  });

  it('uses the username from the secret once it has been fetched', async () => {
    send.mockResolvedValue({
      SecretString: JSON.stringify({ username: 'rotated_user', password: 'pw' }),
    });
    const { getDatabasePassword, getDatabaseConnection } = await import('../credentials');
    await getDatabasePassword();

    expect(getDatabaseConnection()?.username).toBe('rotated_user');
  });

  it('returns null locally so the DATABASE_URL path is used verbatim', async () => {
    delete process.env.DB_SECRET_ARN;
    const { getDatabaseConnection } = await import('../credentials');

    expect(getDatabaseConnection()).toBeNull();
  });
});
