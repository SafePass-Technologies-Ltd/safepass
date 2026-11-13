/**
 * T-054: the readiness probe must not accumulate connections on the REAL driver.
 *
 * WHY THIS FILE EXISTS
 *
 * `health.service.test.ts` proves the probe calls `end()` on every path, but it
 * does so with a fake client -- it cannot see whether `end()` on the *proxied*
 * postgres.js client (`createProbeClient` returns `withConnectionPasswordRetry`,
 * a Proxy) actually reaches the driver and closes a real connection. If the
 * proxy's `get` trap ever stopped forwarding `end`, the mocked test would stay
 * green while every readiness probe leaked a backend connection into a live
 * PostgreSQL -- the exact "shows up days later as pool exhaustion" failure.
 *
 * WHY THIS FILE NO LONGER ASSERTS AN ABSOLUTE BACKEND COUNT
 *
 * The first version did, and it was flaky: it measured `pg_stat_activity` for
 * the whole database and compared exact numbers ("one more while open, back to
 * baseline after end()"). The database is shared with every other integration
 * file in the same run, so a sibling file opening or closing its own pool
 * between two counts changed the baseline and the assertion failed through no
 * fault of the probe.
 *
 * The count was the wrong instrument. What this file has to prove is a property
 * of ONE connection, so it now identifies that connection:
 *
 *   - `createProbeClient()` is given a unique `application_name` after it
 *     connects, so the backend the probe opened is addressable by name. Counting
 *     it is immune to every other client on the server, in any other test file,
 *     in any other process (`psql`, a dashboard, a reply from another agent).
 *   - Teardown is polled to a bounded deadline instead of sampled at one
 *     instant, because an OS/backend close is asynchronous even when it is
 *     going to happen.
 *
 * Three paths are covered by identity -- success, statement failure, and the
 * 2s-deadline loss that T-054 was written for -- plus one burst of the real
 * `probeDatabase()` entry point, which is the only test here that exercises the
 * production function end to end.
 *
 * WHY THE HUNG-CONNECTION FIXTURE DRAINS ITS SOCKETS
 *
 * A previous measurement of that path produced a FALSE leak signal: an
 * in-process `net.Server` that never reads leaves its accepted sockets paused,
 * so a peer's FIN is never surfaced and the "still open" count never drops. The
 * fixture below calls `resume()`, which is what makes its close events mean
 * something.
 *
 * Skipped with a warning -- never silently -- when PostgreSQL is not reachable.
 * The liveness check uses the application's own DSN on purpose: this file
 * measures connections made through `src/db`, so it must not decide whether to
 * run based on a different database.
 */
import net, { type AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '../../db';
import { createProbeClient } from '../../db';
import type { PostgresClient } from '../../db/retrying-client';
import { env } from '../../env';
import { probeDatabase } from '../health.service';

/** Host:port of the database the app itself uses, safe to put in a log line. */
function describeDsn(dsn: string): string {
  try {
    const url = new URL(dsn);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

/**
 * One-shot reachability probe, evaluated at collection time (the established
 * pattern in this suite -- `describe.skipIf` would be resolved before any
 * `beforeAll` had a chance to run).
 */
async function databaseIsReachable(): Promise<boolean> {
  const probe = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

const live = await databaseIsReachable();
if (!live) {
  console.warn(
    `[health.probe-isolation] no PostgreSQL at ${describeDsn(env.DATABASE_URL)} -- skipping. ` +
      'Run `docker compose up -d`.'
  );
}

const describeLive = live ? describe : describe.skip;

/** A marker unique to this test run, so no other client can be mistaken for it. */
let markerSeq = 0;
function uniqueMarker(label: string): string {
  markerSeq += 1;
  // 63-byte limit on application_name; these stay far below it.
  return `qa-probe-${process.pid}-${markerSeq}-${label}`.slice(0, 60);
}

/** Backends carrying [marker]. Immune to every other client on the server. */
async function markedBackends(marker: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n
        from pg_stat_activity
        where datname = current_database() and application_name = ${marker}`
  );
  return rows[0]!.n;
}

/** Backends attached to this database, excluding the one running the query. */
async function backendCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n
        from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()`
  );
  return rows[0]!.n;
}

/**
 * Polls [read] until [done] says so, or the deadline passes.
 *
 * Returns the last value read, so a failure message can state what was actually
 * observed instead of only that time ran out.
 */
async function pollUntil(
  read: () => Promise<number>,
  done: (value: number) => boolean,
  timeoutMs = 5000
): Promise<{ settled: boolean; value: number }> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() >= deadline) return { settled: false, value };
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = await read();
  }
  return { settled: true, value };
}

/**
 * Tags the backend behind [client] with [marker].
 *
 * `SET` does not accept bind parameters, so the literal is built here -- the
 * marker is generated above from a pid and a counter, and this assertion keeps
 * it that way.
 */
async function tagClient(client: PostgresClient, marker: string): Promise<void> {
  expect(marker).toMatch(/^[a-z0-9-]+$/);
  await client.unsafe(`set application_name = '${marker}'`, []);
}

describeLive('readiness probe connection isolation (T-054)', () => {
  it('closes the connection it opened after a successful query', async () => {
    const marker = uniqueMarker('success');
    const client = createProbeClient();

    try {
      await client.unsafe('select 1', []);
      await tagClient(client, marker);

      // The point of this assertion is only to make the next one meaningful: a
      // client that never connected would also have "no connection after end()".
      const opened = await pollUntil(
        () => markedBackends(marker),
        (n) => n === 1,
        2000
      );
      expect(opened).toEqual({ settled: true, value: 1 });

      // `createProbeClient` returns a Proxy over postgres.js. This is the check
      // the mocked unit test cannot make: the trap has to forward `end`.
      await client.end({ timeout: 0 });

      const closed = await pollUntil(
        () => markedBackends(marker),
        (n) => n === 0
      );
      expect(closed).toEqual({ settled: true, value: 0 });
    } finally {
      // Safety net only: a failed assertion above must not leave a client
      // holding a backend for the rest of the run.
      await client.end({ timeout: 0 }).catch(() => undefined);
    }
  }, 30_000);

  it('closes the connection after a statement failed on it', async () => {
    const marker = uniqueMarker('failure');
    const client = createProbeClient();

    try {
      await client.unsafe('select 1', []);
      await tagClient(client, marker);

      // A statement error leaves the connection open -- the driver does not tear
      // the session down for a user error -- so this is the failure path a probe
      // would hit if `select 1` ever raised.
      await expect(
        client.unsafe('select 1 from a_table_that_does_not_exist', [])
      ).rejects.toThrow();

      const stillOpen = await pollUntil(
        () => markedBackends(marker),
        (n) => n === 1,
        2000
      );
      expect(stillOpen).toEqual({ settled: true, value: 1 });

      await client.end({ timeout: 0 });

      const closed = await pollUntil(
        () => markedBackends(marker),
        (n) => n === 0
      );
      expect(closed).toEqual({ settled: true, value: 0 });
    } finally {
      await client.end({ timeout: 0 }).catch(() => undefined);
    }
  }, 30_000);

  it('closes a connection that lost the 2s deadline race', async () => {
    // The T-054 case: the endpoint accepts TCP but never completes the
    // PostgreSQL handshake, so the probe's query is still in flight when the
    // 2s deadline fires. `resume()` is what makes this fixture's close events
    // trustworthy -- a socket nobody reads stays paused and never reports FIN.
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.resume();
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    const client = postgres({
      host: '127.0.0.1',
      port,
      database: 'safepass',
      username: 'safepass',
      password: 'safepass_dev',
      max: 1,
      connect_timeout: 10,
    });
    const query = (async () => {
      await client.unsafe('select 1', []);
    })();
    // probeDatabase() attaches its own consumer to the losing query; match that,
    // or a late rejection becomes an unhandled one.
    query.catch(() => undefined);

    try {
      const lost = await Promise.race([
        query.then(() => 'answered'),
        new Promise<'deadline'>((resolve) => {
          const timer = setTimeout(() => resolve('deadline'), 2000);
          (timer as { unref?: () => void }).unref?.();
        }),
      ]);
      expect(lost).toBe('deadline');

      // The handshake is still pending, so the connection is genuinely open.
      expect(sockets.size).toBe(1);

      await client.end({ timeout: 0 });

      const closed = await pollUntil(
        async () => sockets.size,
        (n) => n === 0,
        3000
      );
      expect(closed).toEqual({ settled: true, value: 0 });
    } finally {
      await client.end({ timeout: 0 }).catch(() => undefined);
      server.close();
    }
  }, 30_000);

  it('leaves no backend behind after a burst of the real probe', async () => {
    // Warm the pool first so the baseline is the steady state.
    await db.execute(sql`select 1`);
    const baseline = await backendCount();

    for (let i = 0; i < 6; i += 1) {
      // Each call must actually reach PostgreSQL; a probe that short-circuited
      // would trivially leave nothing behind.
      expect(await probeDatabase()).toMatchObject({ ok: true });
    }

    // Bounded settle, with a tolerance of two backends for an unrelated
    // integration file opening its own pool inside this window. A probe that
    // failed to close would sit six above the baseline and never settle.
    const settled = await pollUntil(
      backendCount,
      (n) => n <= baseline + 2,
      5000
    );
    expect(
      settled.settled,
      `backend count settled at ${settled.value} after 6 probes (baseline ${baseline}); ` +
        'more than two probe connections did not close'
    ).toBe(true);
  }, 30_000);
});

afterAll(() => {
  // The application pool is module-level and shared with the rest of the suite;
  // leaving it open is what every other integration file does.
});
