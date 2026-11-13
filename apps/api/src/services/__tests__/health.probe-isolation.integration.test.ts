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
 * So this counts real backends in `pg_stat_activity` around a burst of probes.
 * A leak shows up as one extra backend per probe; the probe's isolation shows up
 * as a flat count.
 *
 * Skipped with a warning -- never silently -- when PostgreSQL is not reachable.
 */
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '../../db';
import { createProbeClient } from '../../db';
import { probeDatabase } from '../health.service';

const DSN =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://safepass:safepass_dev@127.0.0.1:5432/safepass';

/**
 * One-shot reachability probe, evaluated at collection time (the established
 * pattern in this suite -- `describe.skipIf` would be resolved before any
 * `beforeAll` had a chance to run).
 */
async function databaseIsReachable(): Promise<boolean> {
  const probe = postgres(DSN, { max: 1, connect_timeout: 3, onnotice: () => undefined });
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
  console.warn('[health.probe-isolation] no PostgreSQL reachable -- skipping');
}

const describeLive = live ? describe : describe.skip;

/** Backends attached to this database, excluding the one running the query. */
async function backendCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n
        from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()`
  );
  return rows[0]!.n;
}

describeLive('readiness probe connection isolation (T-054)', () => {
  it('leaves no backend behind after a burst of probes', async () => {
    // Warm the application pool first, so the baseline is the steady state and
    // any growth afterwards is attributable to the probes.
    await db.execute(sql`select 1`);
    const baseline = await backendCount();

    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(await probeDatabase());
    }

    // Every probe answered, and answered from a real connection (a probe that
    // short-circuited without touching PostgreSQL would also leave no backend).
    expect(results.every((r) => r.ok)).toBe(true);

    // Let any destroyed socket be reaped by the server before counting.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await backendCount();

    // Tolerance of +1 absorbs an unrelated test file's pool being opened
    // concurrently. A shared-pool regression would add up to 6 here, and a
    // per-probe leak would add 6 exactly.
    expect(after).toBeLessThanOrEqual(baseline + 1);
  }, 30_000);

  it('closes the probe client it creates -- end() reaches the real driver', async () => {
    await db.execute(sql`select 1`);
    const baseline = await backendCount();

    const client = createProbeClient();
    await client.unsafe('select 1', []);
    // One connection is now open, which is what makes the next assertion mean
    // something: after end() it must be gone again.
    expect(await backendCount()).toBe(baseline + 1);

    // `createProbeClient` returns a Proxy over postgres.js. This is the check
    // the mocked unit test cannot make: the trap has to forward `end`.
    await client.end({ timeout: 0 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await backendCount()).toBe(baseline);
  }, 30_000);
});
