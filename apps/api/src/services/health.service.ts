/**
 * Readiness probing (T-041, hardened by T-054).
 *
 * WHY THIS EXISTS
 *
 * Production sign-in returned 500 for hours while `GET /health` kept answering
 * 200. That route is a static liveness answer -- it never touches PostgreSQL --
 * so the ALB target group stayed green while every login failed, because the
 * RDS instance behind `DB_HOST` no longer existed. Nothing in the platform was
 * asking the only question that mattered: "can this task actually reach its
 * database?"
 *
 * `probeDatabase` asks it with the cheapest possible query (`SELECT 1`) and a
 * hard deadline, so a hung connection reports "not ready" instead of hanging
 * the probe. It is deliberately NOT wired into `/health`: the ALB probes that
 * path and changing what it means is a separate decision.
 *
 * WHY THE PROBE HAS ITS OWN CONNECTION (T-054)
 *
 * The probe originally ran through the shared 20-slot application pool. A probe
 * that loses its 2s race leaves its connect attempt in flight, and the driver
 * holds that slot until its own connect timeout (~30s) -- so a fast probe
 * interval against a dead database fills the pool with dead connects and
 * recovery waits behind the check that was supposed to detect the outage.
 *
 * Now every probe opens its own `max: 1` client (`createProbeClient`) with a
 * short `connect_timeout`, and destroys it in a `finally` whatever happens.
 * The cost is one TCP/TLS handshake per probe -- far cheaper than starving the
 * application of connections during exactly the incident this endpoint exists
 * to report. `latencyMs` therefore includes connection setup: it is the
 * honest "time to reach the database", not "time to reuse a warm socket".
 */
import type { PostgresClient } from '../db/retrying-client';
import { createProbeClient } from '../db';

/**
 * Deadline for the probe.
 *
 * The pool can hang for a long time when the network path to RDS is gone, and a
 * readiness endpoint that hangs is indistinguishable from a dead task -- except
 * that it also ties up a connection and a request slot. Two seconds is far
 * longer than `SELECT 1` needs on a healthy system and far shorter than any
 * load balancer's health-check timeout.
 */
export const DB_PROBE_TIMEOUT_MS = 2000;

/**
 * The value returned in `checks.database.error`.
 *
 * Deliberately a fixed token: the response is a monitoring surface, and driver
 * internals (host, user, SQL, stack) never belong on the wire. The specific
 * cause -- SQLSTATE, message -- goes to the structured log instead.
 */
export const DB_UNREACHABLE = 'database_unreachable';

export type DatabaseProbeResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: typeof DB_UNREACHABLE };

/**
 * Resolves with a hard deadline, leaving the operation to settle on its own.
 */
function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`database probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    // A probe timer must not be the reason the process stays alive.
    (timer as { unref?: () => void }).unref?.();
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** First human-readable message in the error's cause chain. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message.slice(0, 300) : 'unknown error';
}

/** First driver/SQLSTATE code in the error's cause chain, if any. */
function errorCode(error: unknown): string | null {
  let current: unknown = error;

  // Drizzle wraps driver errors, so the SQLSTATE lives under `cause`.
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

/**
 * One structured line per failed probe.
 *
 * Single line on purpose: CloudWatch groups by line, and a multi-line object
 * breaks that. Writes the driver's detail, never the response body.
 */
function logProbeFailure(error: unknown, durationMs: number): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'db_readiness_probe_failed',
      error: DB_UNREACHABLE,
      code: errorCode(error),
      detail: describeError(error),
      durationMs,
    })
  );
}

/**
 * Destroys the probe client without ever letting the close become a second
 * failure.
 *
 * `timeout: 0` tells postgres.js to stop waiting for in-flight work and destroy
 * the socket now. That matters on the timeout path: the probe lost the race, so
 * its connect attempt is still in flight and waiting for it to settle is the
 * piled-up-connections bug T-054 removes. The rejection (when a destroyed
 * connection fails its pending query) is swallowed here; the query's own
 * rejection is swallowed next to where it is created.
 */
function closeProbeClient(client: PostgresClient): void {
  try {
    void client.end({ timeout: 0 }).catch(() => undefined);
  } catch {
    // `end` is not expected to throw synchronously. If it ever does, the probe
    // result is already decided and there is nothing useful left to report.
  }
}

/**
 * Runs `SELECT 1` on a connection of its own.
 *
 * Never throws: a readiness probe reports, it does not fail. Failure is
 * reported on one structured log line as well, so CloudWatch shows the database
 * problem even when nobody is calling the endpoint.
 */
export async function probeDatabase(): Promise<DatabaseProbeResult> {
  const startedAt = performance.now();

  let client: PostgresClient;
  try {
    client = createProbeClient();
  } catch (error) {
    // A client that cannot even be constructed (bad connection options) is a
    // configuration fault, not a live database: report, never throw.
    logProbeFailure(error, 0);
    return { ok: false, error: DB_UNREACHABLE };
  }

  // Wrapped so a thenable from the driver becomes a real promise, and so the
  // query's settlement has exactly one consumer we control.
  const probe = (async () => {
    await client.unsafe('select 1', []);
  })();

  // The probe can lose the race and settle later. Consume that settlement so a
  // hung connection cannot turn into an unhandled rejection on top of a failed
  // check.
  probe.catch(() => undefined);

  try {
    await withTimeout(probe, DB_PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    logProbeFailure(error, Math.round(performance.now() - startedAt));
    return { ok: false, error: DB_UNREACHABLE };
  } finally {
    // Every probe closes its own client -- success, failure or deadline -- so
    // repeated probes cannot accumulate connections.
    closeProbeClient(client);
  }
}
