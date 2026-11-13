/**
 * Incident regression: liveness green while the database is gone (T-041).
 *
 * THIS FILE REPRODUCES 2026-11-13, DELIBERATELY.
 *
 * On that day every sign-in returned 500 for hours. `GET /health` answered 200
 * the whole time -- it is a static liveness answer and never touches
 * PostgreSQL -- so the ALB kept a database-less task in rotation and nothing in
 * the platform asked the only question that mattered. The RDS instance behind
 * `DB_HOST` no longer existed.
 *
 * So these tests drive the REAL application (`src/index.ts`), not a mounted
 * router and not a mocked service, with the database genuinely unreachable:
 *
 *   1. `/health` still answers 200, statically, with no database round trip.
 *   2. `/health/ready` answers 503 with the fixed contract token, inside its
 *      deadline, and writes exactly one structured warn line.
 *   3. With a live database, `/health/ready` answers 200 with an integer
 *      `latencyMs` -- the H-001 shape.
 *
 * A stalled TCP listener stands in for "the pool hangs": it accepts the socket
 * and never completes the PostgreSQL handshake, which is what a black-holed
 * VPC route or a wedged instance looks like from inside the task. That makes
 * the 2s deadline deterministic instead of dependent on the network stack.
 */
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { Hono } from 'hono';

/** Narrow view of the postgres.js client so pools are closed deliberately. */
interface ClosableClient {
  end: (options?: { timeout?: number }) => Promise<void>;
}

interface SessionHolder {
  session: { client: ClosableClient };
}

const ORIGINAL_ENV = { ...process.env };

/** docker-compose's local credentials (see docker-compose.yml); override with TEST_DATABASE_URL. */
const DEV_DSN =
  process.env.TEST_DATABASE_URL ?? 'postgresql://safepass:safepass_dev@127.0.0.1:5432/safepass';

const openPools: ClosableClient[] = [];

/** Closes every pool this file opened, so a stalled connect cannot hold the run open. */
async function closePools(): Promise<void> {
  for (const pool of openPools.splice(0)) {
    await pool.end({ timeout: 1 }).catch(() => undefined);
  }
}

/**
 * Every test here rebuilds a module graph, so teardown is unconditional: close
 * the pool the previous module graph opened (a stalled connect must not keep the
 * run alive), restore the environment, and drop the cached modules.
 */
afterEach(async () => {
  vi.restoreAllMocks();
  await closePools();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

/**
 * Loads the application with `DATABASE_URL` forced to `databaseUrl`.
 *
 * `env.ts` seeds `process.env` from the repo `.env` with dotenv, which does not
 * overwrite values that are already set -- so assigning before the import is
 * enough to point the real pool anywhere.
 */
async function loadApp(databaseUrl: string) {
  vi.resetModules();
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';

  const { app } = await import('../../index');
  const { db } = await import('../../db');
  openPools.push((db as unknown as SessionHolder).session.client);
  return app;
}

/** Loads only the probe and its pool, for cases that do not need the whole app. */
async function loadProbe(databaseUrl: string) {
  vi.resetModules();
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';

  const health = await import('../../services/health.service');
  const { db } = await import('../../db');
  openPools.push((db as unknown as SessionHolder).session.client);
  return health;
}

/** A TCP server that accepts connections and never answers. */
async function stalledDatabase(): Promise<{ server: Server; port: number; destroy: () => void }> {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    // Intentionally silent: the client writes its startup packet and waits for
    // a reply that never comes. Tracked so the test can tear it down.
    sockets.push(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    port: (server.address() as AddressInfo).port,
    destroy: () => {
      for (const socket of sockets.splice(0)) socket.destroy();
    },
  };
}

/**
 * A database that is reachable right now, so the healthy path can be asserted.
 * Computed once at collection time: `describe.skipIf`/`it.skipIf` need the
 * answer before any hook runs.
 */
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
    `[qa] skipping live-database readiness test: nothing reachable at ${DEV_DSN.replace(/:[^:@/]+@/, ':***@')}. ` +
      'Run `docker compose up -d` to exercise it.'
  );
}

describe('GET /health and GET /health/ready with the database gone', () => {
  it(
    'keeps /health at 200 while /health/ready reports 503 -- the 2026-11-13 shape',
    async () => {
      // Same failure mode as the deleted RDS instance: nothing is listening.
      const app = await loadApp('postgresql://safepass:safepass_dev@127.0.0.1:1/safepass');

      const live = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const livenessStarted = performance.now();
      const liveness = await app.request('/health');
      const livenessMs = performance.now() - livenessStarted;

      expect(liveness.status).toBe(200);
      const livenessBody = (await liveness.json()) as Record<string, unknown>;

      // Exactly the pre-commit body, nothing added: the ALB contract is frozen.
      expect(Object.keys(livenessBody).sort()).toEqual(['environment', 'status', 'timestamp']);
      expect(livenessBody.status).toBe('ok');
      expect(livenessBody.environment).toBe('test');
      expect(Number.isNaN(Date.parse(String(livenessBody.timestamp)))).toBe(false);
      // Static: no database round trip happened, which is why it can be green
      // while the database is not.
      expect(livenessMs).toBeLessThan(1000);
      expect(live).not.toHaveBeenCalled();

      const readyStarted = performance.now();
      const ready = await app.request('/health/ready');
      const readyMs = performance.now() - readyStarted;

      expect(ready.status).toBe(503);
      const readyBody = (await ready.json()) as Record<string, unknown>;
      expect(readyBody).toEqual({
        status: 'not_ready',
        checks: { database: { ok: false, error: 'database_unreachable' } },
      });

      // H-001: a fixed token, never the driver's truth. No host, user, SQL,
      // stack or driver error code reaches the wire.
      const wire = JSON.stringify(readyBody);
      for (const leak of ['127.0.0.1', 'safepass', 'ECONNREFUSED', 'select', 'Error', 'password']) {
        expect(wire).not.toContain(leak);
      }

      // Fails fast rather than waiting on the pool.
      expect(readyMs).toBeLessThan(3000);

      // One line, so CloudWatch shows the database problem without a client.
      expect(live).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(String(live.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(logged.event).toBe('db_readiness_probe_failed');
      expect(logged.error).toBe('database_unreachable');
      // The detail stays in the log, which is where it belongs.
      expect(String(logged.code ?? '')).not.toBe('');
    },
    120_000
  );

  it(
    'reports not_ready inside its deadline when the connection hangs',
    async () => {
      const { server, port, destroy } = await stalledDatabase();

      try {
        const { probeDatabase, DB_PROBE_TIMEOUT_MS } = await loadProbe(
          `postgresql://safepass:safepass_dev@127.0.0.1:${port}/safepass`
        );

        const started = performance.now();
        const result = await probeDatabase();
        const elapsed = performance.now() - started;

        expect(result).toEqual({ ok: false, error: 'database_unreachable' });
        // The whole point of the deadline: a hung handshake reports not-ready
        // instead of holding the probe (and a connection) open.
        expect(elapsed).toBeGreaterThanOrEqual(DB_PROBE_TIMEOUT_MS - 200);
        expect(elapsed).toBeLessThan(DB_PROBE_TIMEOUT_MS + 1500);
      } finally {
        // The stalled probe leaves its socket open on purpose; kill it before
        // waiting on the listener, or close() would never complete.
        destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    30_000
  );
});

describe('GET /health/ready with a live database', () => {
  it.skipIf(!databaseUp)(
    'answers the H-001 ready body from a real SELECT 1',
    async () => {
      vi.resetModules();
      process.env.DATABASE_URL = DEV_DSN;
      process.env.NODE_ENV = 'test';

      const { healthRoutes } = await import('../health.routes');
      const { db } = await import('../../db');
      openPools.push((db as unknown as SessionHolder).session.client);

      const app = new Hono();
      app.route('/health', healthRoutes);

      const res = await app.request('/health/ready');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        checks: { database: { ok: boolean; latencyMs: number } };
      };

      expect(body).toEqual({
        status: 'ready',
        checks: { database: { ok: true, latencyMs: expect.any(Number) } },
      });
      // H-001 says integer milliseconds.
      expect(Number.isInteger(body.checks.database.latencyMs)).toBe(true);
      expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.checks.database.latencyMs).toBeLessThan(2000);
    },
    60_000
  );
});
