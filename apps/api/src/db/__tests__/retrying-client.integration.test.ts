/**
 * Real-PostgreSQL integration tests for the 28P01 retry wrapper (T-040).
 *
 * WHY THIS FILE EXISTS
 *
 * `./retrying-client.ts` proxies the postgres.js client so Drizzle's statements
 * survive an RDS password rotation. The unit tests next door prove the proxy's
 * shape against a fake client; they cannot prove that the REAL driver's entry
 * points are intercepted -- and the proxy only has to miss one of
 * `unsafe` / `begin` / the tagged-template call for production to break in a way
 * no unit test can see.
 *
 * So everything here runs against a live PostgreSQL 16 (the docker-compose
 * service, `docker compose up -d`). It exercises every Drizzle entry point the
 * application actually uses, then reproduces the rotation end to end: a dead
 * cached password, a rejected connection, a forced Secrets Manager refresh, and
 * exactly one retry.
 *
 * The database is the real one; only Secrets Manager is mocked (there is no AWS
 * account in a test run, and the credential *flow* is what is under test).
 *
 * Skipped -- with a warning, never silently -- when PostgreSQL is not reachable,
 * because CI does not start a database service (see the QA report: that gap is
 * tracked separately). Locally: `docker compose up -d`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '../schema/index';
import { users } from '../schema/index';
import { withConnectionPasswordRetry } from '../retrying-client';
import {
  getDatabasePassword,
  isPasswordAuthFailure,
  resetDatabaseCredentials,
  seedDatabaseCredentials,
} from '../credentials';

const hoisted = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = hoisted.send;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));

/** docker-compose's local credentials (see docker-compose.yml); override with TEST_DATABASE_URL. */
const DEV_DSN =
  process.env.TEST_DATABASE_URL ?? 'postgresql://safepass:safepass_dev@127.0.0.1:5432/safepass';

const dsn = new URL(DEV_DSN);
const DB_HOST = dsn.hostname;
const DB_PORT = Number(dsn.port === '' ? 5432 : dsn.port);
const DB_NAME = dsn.pathname.replace(/^\//, '');
const DB_USER = decodeURIComponent(dsn.username);
const DB_PASSWORD = decodeURIComponent(dsn.password);

const ORIGINAL_ENV = { ...process.env };

/** One-shot reachability probe so the suite degrades to "skipped" instead of "red". */
async function databaseIsReachable(): Promise<boolean> {
  const probe = postgres(DEV_DSN, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

const databaseUp = await databaseIsReachable();
if (!databaseUp) {
  console.warn(
    `[qa] skipping live-PostgreSQL integration tests: nothing reachable at ${DB_HOST}:${DB_PORT}. ` +
      'Run `docker compose up -d` to exercise them.'
  );
}
const describeDb = databaseUp ? describe : describe.skip;

/** Narrow view of the client `end()` so pools are closed on purpose. */
interface ClosableClient {
  end: (options?: { timeout?: number }) => Promise<void>;
}

describeDb('withConnectionPasswordRetry against a live PostgreSQL', () => {
  let raw: ReturnType<typeof postgres>;
  let client: ReturnType<typeof withConnectionPasswordRetry>;
  let db: PostgresJsDatabase<typeof schema>;

  /** Every row this suite writes, so cleanup never depends on a passing assertion. */
  const createdUserIds: string[] = [];

  beforeAll(() => {
    raw = postgres(DEV_DSN, { max: 4, onnotice: () => undefined });
    client = withConnectionPasswordRetry(raw);
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db
        .delete(users)
        .where(eq(users.id, id))
        .catch(() => undefined);
    }
    await (client as unknown as ClosableClient).end({ timeout: 2 }).catch(() => undefined);
  });

  /** Inserts a throwaway user and records it for cleanup. */
  async function createUser(suffix: string): Promise<string> {
    const id = uuidv4();
    await db.insert(users).values({
      id,
      authProvider: 'google',
      authProviderId: `qa-${suffix}-${uuidv4()}`,
      email: `qa-${suffix}-${id}@example.test`,
      fullName: 'QA Integration User',
      emergencyContacts: [],
      isVerified: true,
    });
    createdUserIds.push(id);
    return id;
  }

  it('round-trips db.execute(sql`...`) -- the readiness probe path', async () => {
    const rows = (await db.execute(sql`select 1 as ok`)) as unknown as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.ok)).toBe(1);
  });

  it('round-trips db.insert(...).values(...).returning()', async () => {
    const id = uuidv4();
    const [row] = await db
      .insert(users)
      .values({
        id,
        authProvider: 'google',
        authProviderId: `qa-insert-${uuidv4()}`,
        email: `qa-insert-${id}@example.test`,
        fullName: 'QA Insert User',
        emergencyContacts: [],
      })
      .returning();
    createdUserIds.push(id);

    expect(row?.id).toBe(id);
    expect(row?.fullName).toBe('QA Insert User');
    // Defaults must come back from the server, not from the insert object.
    expect(row?.role).toBe('user');
    expect(row?.isActive).toBe(true);
  });

  it('round-trips db.select().from(...).where(...)', async () => {
    const id = await createUser('select');

    const rows = await db.select().from(users).where(eq(users.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toContain('qa-select-');
  });

  it('round-trips db.query.users.findFirst -- the sign-in path that broke', async () => {
    const id = await createUser('findfirst');

    const row = await db.query.users.findFirst({ where: eq(users.id, id) });

    // This is the exact query the 2026-11-13 outage surfaced as an anonymous
    // `Failed query: select ... from "users"`.
    expect(row?.id).toBe(id);
  });

  it('round-trips db.update(...).returning()', async () => {
    const id = await createUser('update');

    const [row] = await db
      .update(users)
      .set({ fullName: 'QA Updated User', updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    expect(row?.fullName).toBe('QA Updated User');
  });

  it('round-trips db.transaction(...) and keeps the write', async () => {
    const id = uuidv4();

    const returned = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          id,
          authProvider: 'phone',
          authProviderId: `qa-tx-${uuidv4()}`,
          email: `qa-tx-${id}@example.test`,
          fullName: 'QA Transaction User',
          phone: '+2348000000000',
          emergencyContacts: [],
        })
        .returning();

      const [updated] = await tx
        .update(users)
        .set({ fullName: 'QA Transaction User (committed)' })
        .where(eq(users.id, id))
        .returning();

      return { row, updated };
    });
    createdUserIds.push(id);

    expect(returned.updated?.fullName).toBe('QA Transaction User (committed)');

    const stored = await db.query.users.findFirst({ where: eq(users.id, id) });
    expect(stored?.fullName).toBe('QA Transaction User (committed)');
  });

  it('round-trips db.delete(...).returning()', async () => {
    const id = await createUser('delete');

    const [row] = await db.delete(users).where(eq(users.id, id)).returning();

    expect(row?.id).toBe(id);
    await expect(db.query.users.findFirst({ where: eq(users.id, id) })).resolves.toBeUndefined();
  });

  it('rolls a failed transaction back (the proxy must not retry a normal abort)', async () => {
    const id = uuidv4();

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(users).values({
          id,
          authProvider: 'google',
          authProviderId: `qa-tx-abort-${uuidv4()}`,
          email: `qa-tx-abort-${id}@example.test`,
          fullName: 'QA Aborted User',
          emergencyContacts: [],
        });
        throw new Error('abort this transaction');
      })
    ).rejects.toThrow('abort this transaction');

    // A non-28P01 failure must propagate untouched, and the write must be gone:
    // retrying *this* would duplicate the insert.
    await expect(db.query.users.findFirst({ where: eq(users.id, id) })).resolves.toBeUndefined();
  });
});

describeDb('28P01 recovery against a live server (the rotation, end to end)', () => {
  /**
   * The client is built the way `db/index.ts` builds it in production: discrete
   * connection parameters plus the rotation-aware password resolver.
   */
  let client: ReturnType<typeof withConnectionPasswordRetry> | null = null;

  /** Passwords the driver actually presented, in order. */
  const passwordsUsed: string[] = [];

  function managedPassword(): Promise<string> {
    return getDatabasePassword().then((password) => {
      passwordsUsed.push(password);
      return password;
    });
  }

  function connect(): {
    client: ReturnType<typeof withConnectionPasswordRetry>;
    db: PostgresJsDatabase<typeof schema>;
  } {
    const raw = postgres({
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      username: DB_USER,
      password: managedPassword,
      max: 1,
      connect_timeout: 3,
      onnotice: () => undefined,
    });
    client = withConnectionPasswordRetry(raw);
    return { client, db: drizzle(client, { schema }) };
  }
  function secretResponse(password: string) {
    return { SecretString: JSON.stringify({ username: DB_USER, password }) };
  }

  beforeEach(() => {
    passwordsUsed.length = 0;
    hoisted.send.mockReset();
    // The managed-credentials path only engages when the secret ARN is set.
    process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:eu-west-2:000000000000:secret:rds!db-qa';
    process.env.DB_HOST = DB_HOST;
    process.env.DB_PORT = String(DB_PORT);
    process.env.DB_NAME = DB_NAME;
    process.env.AWS_REGION = 'eu-west-2';
    resetDatabaseCredentials();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    if (client) await (client as unknown as ClosableClient).end({ timeout: 1 }).catch(() => undefined);
    client = null;
  });

  it('recovers when the cached password was rotated, retrying exactly once', async () => {
    // What the pool is holding right now: a password PostgreSQL no longer accepts.
    seedDatabaseCredentials(DB_USER, 'password-from-the-previous-rotation');
    // What the secret says after the rotation.
    hoisted.send.mockResolvedValue(secretResponse(DB_PASSWORD));

    const { db } = connect();

    const rows = (await db.execute(sql`select 1 as ok`)) as unknown as Array<Record<string, unknown>>;

    // The operation succeeded on its second attempt...
    expect(Number(rows[0]?.ok)).toBe(1);
    // ...with the dead password first and the refreshed one second, and nothing
    // in between: one retry, not a loop.
    expect(passwordsUsed).toEqual(['password-from-the-previous-rotation', DB_PASSWORD]);
    // One forced Secrets Manager read, not one per attempt.
    expect(hoisted.send).toHaveBeenCalledTimes(1);

    // The recovery must be visible without a client request.
    const warnings = vi.mocked(console.warn).mock.calls.map(([line]) => String(line));
    const rotation = warnings
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.event === 'db_password_auth_failed');
    expect(rotation).toBeDefined();
    // ...and it must not carry the password.
    expect(warnings.join('\n')).not.toContain('password-from-the-previous-rotation');
    expect(warnings.join('\n')).not.toContain(DB_PASSWORD);
  });

  it('recovers the sign-in path (db.query.users.findFirst) after a rotation', async () => {
    // The readiness probe uses `execute`; token exchange uses the relational
    // query API, which reaches the driver through `.values()` instead of
    // `.then()`. Both must survive the same rejection.
    seedDatabaseCredentials(DB_USER, 'password-from-the-previous-rotation');
    hoisted.send.mockResolvedValue(secretResponse(DB_PASSWORD));

    const { db } = connect();

    const row = await db.query.users.findFirst({
      where: eq(users.id, '00000000-0000-0000-0000-000000000000'),
    });

    // No such user, but the query answered -- that is the point.
    expect(row).toBeUndefined();
    expect(passwordsUsed).toEqual(['password-from-the-previous-rotation', DB_PASSWORD]);
    expect(hoisted.send).toHaveBeenCalledTimes(1);
  });

  it('retries a transaction once, without double-applying its write', async () => {
    // Wallet debits, payments and the emergency trigger all run inside
    // db.transaction. If a 28P01 could re-run a callback whose statements had
    // already landed, a retry would debit a wallet twice -- so the retry must
    // happen before the callback is entered.
    seedDatabaseCredentials(DB_USER, 'password-from-the-previous-rotation');
    hoisted.send.mockResolvedValue(secretResponse(DB_PASSWORD));

    const { db } = connect();
    const id = uuidv4();

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          id,
          authProvider: 'google',
          authProviderId: `qa-tx-retry-${uuidv4()}`,
          email: `qa-tx-retry-${id}@example.test`,
          fullName: 'QA Retried Transaction User',
          emergencyContacts: [],
        })
        .returning();
      return row;
    });

    expect(created?.id).toBe(id);
    expect(passwordsUsed).toEqual(['password-from-the-previous-rotation', DB_PASSWORD]);

    // One row, not two: the retry re-entered the transaction, it did not run
    // the callback twice against a live connection.
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);

    await db.delete(users).where(eq(users.id, id));
  });

  it('does not re-cache the password the server just rejected', async () => {    seedDatabaseCredentials(DB_USER, 'password-from-the-previous-rotation');
    hoisted.send.mockResolvedValue(secretResponse(DB_PASSWORD));

    const { db } = connect();
    await db.execute(sql`select 1`);

    // The generation counter's whole purpose: the next connection must present
    // the live password, not the one that was already refused.
    await expect(getDatabasePassword()).resolves.toBe(DB_PASSWORD);
    // Still inside the TTL, so this must not have hit Secrets Manager again.
    expect(hoisted.send).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry when the refresh returns a password that is also rejected', async () => {
    seedDatabaseCredentials(DB_USER, 'password-from-the-previous-rotation');
    // Secrets Manager itself is stale (a rotation that has not propagated), so
    // the refresh hands back another dead password.
    hoisted.send.mockResolvedValue(secretResponse('still-not-the-password'));

    const { db } = connect();

    const failure = await db.query.users
      .findFirst({ where: eq(users.id, '00000000-0000-0000-0000-000000000000') })
      .then(
        () => {
          throw new Error('expected the query to fail');
        },
        (error: unknown) => error
      );

    // Two attempts, never more: retrying a dead password is how a rotation used
    // to become a permanent outage.
    expect(passwordsUsed).toEqual(['password-from-the-previous-rotation', 'still-not-the-password']);
    expect(hoisted.send).toHaveBeenCalledTimes(1);

    // The caller still sees a credential rejection, so the failure class stays
    // recognisable rather than turning into something shapeless.
    expect(isPasswordAuthFailure(failure)).toBe(true);
    // Drizzle's wrapper -- the `Failed query: select ...` line that was the ONLY
    // evidence in the 2026-11-13 incident log. It is what the readiness probe
    // now turns into a 503 instead of a silent healthy target.
    expect(failure).toBeInstanceOf(DrizzleQueryError);
    expect((failure as Error).message).toContain('Failed query');
    expect((failure as Error).message).toContain('select');
  });
});
