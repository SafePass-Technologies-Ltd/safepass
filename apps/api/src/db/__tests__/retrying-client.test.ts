/**
 * Connection retry wrapper tests (T-040).
 *
 * The proxy in ./retrying-client.ts is the seam that turns an RDS password
 * rotation from "every new connection fails with 28P01 until the task restarts"
 * into "the next connection re-reads the secret". It is easy to get subtly
 * wrong -- swallowing the result, retrying the wrong error, losing `this` on
 * pass-through members -- so it is exercised here against a fake postgres.js
 * client, with the REAL credential resolver underneath (Secrets Manager is the
 * only mock).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const send = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { withConnectionPasswordRetry } from '../retrying-client';
import {
  getDatabasePassword,
  resetDatabaseCredentials,
  seedDatabaseCredentials,
} from '../credentials';

function secretResponse(password: string) {
  return { SecretString: JSON.stringify({ username: 'safepass_admin', password }) };
}

const ORIGINAL_ENV = { ...process.env };

/** Minimal stand-in for postgres.js's PendingQuery. */
function pendingQuery(run: () => Promise<unknown>) {
  return {
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      run().then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => run().catch(onRejected),
    finally: (onFinally?: () => void) => run().finally(onFinally),
    values: () => run(),
  };
}

/**
 * Fake client whose `unsafe` behaves like postgres.js: it resolves the password
 * for the connection it is about to open, and the query is what fails when the
 * server rejects that password.
 *
 * Callable, like the real client (postgres.js's `sql` is a tagged-template
 * function with methods on it) -- that is what makes the proxy's `apply` trap
 * reachable.
 */
function fakeClient(onQuery: (password: string, attempt: number) => Promise<unknown>) {
  let attempt = 0;

  const nextAttempt = () => {
    attempt += 1;
    return attempt;
  };

  const callable = (_strings: TemplateStringsArray) => {
    const thisAttempt = nextAttempt();
    return pendingQuery(async () => onQuery(await getDatabasePassword(), thisAttempt));
  };

  return Object.assign(callable, {
    options: { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown> },
    unsafe: vi.fn(() => {
      const thisAttempt = nextAttempt();
      return pendingQuery(async () => onQuery(await getDatabasePassword(), thisAttempt));
    }),
    begin: vi.fn((callback: (sql: unknown) => Promise<unknown>) =>
      onConnectAttempt(callback).then(() => 'committed')
    ),
    end: vi.fn(async () => undefined),
  });
}

/** Shared by `begin`: fail the first connection with 28P01, succeed after. */
let beginAttempts = 0;
async function onConnectAttempt(callback: (sql: unknown) => Promise<unknown>): Promise<void> {
  beginAttempts += 1;
  await getDatabasePassword();
  if (beginAttempts === 1) {
    throw Object.assign(new Error('password authentication failed'), { code: '28P01' });
  }
  await callback({});
}

function asClient<T>(client: T): Parameters<typeof withConnectionPasswordRetry>[0] {
  return client as unknown as Parameters<typeof withConnectionPasswordRetry>[0];
}

beforeEach(() => {
  send.mockReset();
  beginAttempts = 0;
  process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:eu-west-2:123:secret:rds!db-test';
  process.env.AWS_REGION = 'eu-west-2';

  resetDatabaseCredentials();
  // The password the pool is currently holding already.
  seedDatabaseCredentials('safepass_admin', 'dead-password');
  // What Secrets Manager returns once asked again (the rotation).
  send.mockResolvedValue(secretResponse('rotated-password'));

  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('withConnectionPasswordRetry', () => {
  it('retries a query once with the rotated password after 28P01', async () => {
    const passwordsSeen: string[] = [];
    const client = fakeClient(async (password, attempt) => {
      passwordsSeen.push(password);
      if (attempt === 1) {
        throw Object.assign(new Error('password authentication failed for user "safepass_admin"'), {
          code: '28P01',
        });
      }
      return [{ '?column?': 1 }];
    });

    const rows = await withConnectionPasswordRetry(asClient(client)).unsafe('select 1');

    expect(rows).toEqual([{ '?column?': 1 }]);
    expect(passwordsSeen).toEqual(['dead-password', 'rotated-password']);
    expect(client.unsafe).toHaveBeenCalledTimes(2);
  });

  it('retries the `.values()` form Drizzle also uses', async () => {
    const client = fakeClient(async (_password, attempt) => {
      if (attempt === 1) throw Object.assign(new Error('nope'), { code: '28P01' });
      return [[1]];
    });

    const values = await withConnectionPasswordRetry(asClient(client)).unsafe('select 1').values();

    expect(values).toEqual([[1]]);
    expect(client.unsafe).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that is not a credential rejection', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    });

    await expect(
      withConnectionPasswordRetry(asClient(client)).unsafe('select 1')
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });

    // A second identical attempt would only double the latency of a real outage.
    expect(client.unsafe).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('retries a transaction once, before its callback has written anything', async () => {
    const client = fakeClient(async () => [{ ok: 1 }]);

    const result = await withConnectionPasswordRetry(asClient(client)).begin(async () => 'work');

    expect(result).toBe('committed');
    expect(client.begin).toHaveBeenCalledTimes(2);
  });

  it('retries a tagged-template query', async () => {
    const client = fakeClient(async (_password, attempt) => {
      if (attempt === 1) throw Object.assign(new Error('nope'), { code: '28P01' });
      return [{ ok: 1 }];
    });
    const wrapped = withConnectionPasswordRetry(asClient(client)) as unknown as (
      strings: TemplateStringsArray
    ) => PromiseLike<unknown>;

    await expect(wrapped`select 1`).resolves.toEqual([{ ok: 1 }]);
  });

  it('passes every other member through unchanged', async () => {
    const client = fakeClient(async () => [{ ok: 1 }]);
    const wrapped = withConnectionPasswordRetry(asClient(client));

    // Drizzle mutates `client.options.parsers`/`serializers` at construction, so
    // it must be the SAME object -- a copy would silently disable its type
    // parsing.
    expect(wrapped.options).toBe(client.options);

    await wrapped.end();
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
