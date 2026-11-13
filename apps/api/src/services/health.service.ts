/**
 * Readiness probing (T-041).
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
 * hard deadline, so a hung pool reports "not ready" instead of hanging the
 * probe. It is deliberately NOT wired into `/health`: the ALB probes that path
 * and changing what it means is a separate decision.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';

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
 * Runs `SELECT 1` against the live pool.
 *
 * Never throws: a readiness probe reports, it does not fail. Failure is
 * reported on one structured log line as well, so CloudWatch shows the database
 * problem even when nobody is calling the endpoint.
 */
export async function probeDatabase(): Promise<DatabaseProbeResult> {
  const startedAt = performance.now();
  const probe = db.execute(sql`select 1`);

  // The probe can lose the race and settle later. Consume that settlement so a
  // hung pool cannot turn into an unhandled rejection on top of a failed check.
  probe.catch(() => undefined);

  try {
    await withTimeout(probe, DB_PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'db_readiness_probe_failed',
        error: DB_UNREACHABLE,
        code: errorCode(error),
        detail: describeError(error),
        durationMs: Math.round(performance.now() - startedAt),
      })
    );

    return { ok: false, error: DB_UNREACHABLE };
  }
}
