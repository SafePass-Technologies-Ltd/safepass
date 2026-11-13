/**
 * Readiness probe tests (T-041).
 *
 * The failure this guards against is not subtle: `/health` answered 200 for
 * hours while every login returned 500, because the static health check never
 * touched the database. These tests pin the two properties that make
 * `/health/ready` a real signal -- it runs an actual query, and it refuses to
 * wait for a hung pool forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: { execute: hoisted.mockExecute },
}));

import { probeDatabase, DB_PROBE_TIMEOUT_MS, DB_UNREACHABLE } from '../health.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('probeDatabase', () => {
  it('reports ready after a real query round trip', async () => {
    hoisted.mockExecute.mockResolvedValue([{ '?column?': 1 }]);

    const result = await probeDatabase();

    // A probe that never touches the pool is exactly the bug: assert the query
    // actually went out.
    expect(hoisted.mockExecute).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports not ready with a stable token when the query fails', async () => {
    hoisted.mockExecute.mockRejectedValue(
      Object.assign(new Error('password authentication failed for user "safepass_admin"'), {
        code: '28P01',
      })
    );

    const result = await probeDatabase();

    expect(result).toEqual({ ok: false, error: DB_UNREACHABLE });
    // Driver internals stay off the wire: the body carries a fixed token.
    expect(JSON.stringify(result)).not.toContain('safepass_admin');
  });

  it('logs one structured line carrying the driver code', async () => {
    hoisted.mockExecute.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })
    );

    await probeDatabase();

    const warn = vi.mocked(console.warn);
    expect(warn).toHaveBeenCalledTimes(1);

    const line = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line.event).toBe('db_readiness_probe_failed');
    expect(line.level).toBe('warn');
    expect(line.code).toBe('ECONNREFUSED');
    expect(line.error).toBe(DB_UNREACHABLE);
    // Still one line: CloudWatch groups by line, and a pretty-printed object
    // breaks that.
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('\n');
  });

  it('reports not ready instead of hanging when the pool never answers', async () => {
    vi.useFakeTimers();
    // A warm pool opening a connection to a deleted RDS instance does not fail
    // fast -- it waits.
    hoisted.mockExecute.mockReturnValue(new Promise(() => undefined));

    const probe = probeDatabase();
    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS);
    const result = await probe;

    expect(result).toEqual({ ok: false, error: DB_UNREACHABLE });
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
  });

  it('does not surface an unhandled rejection when a timed-out probe settles later', async () => {
    vi.useFakeTimers();
    let rejectQuery: (error: unknown) => void = () => undefined;
    hoisted.mockExecute.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectQuery = reject;
      })
    );

    const probe = probeDatabase();
    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toEqual({ ok: false, error: DB_UNREACHABLE });

    // The losing query settles after the race is already decided; that must not
    // become an unhandled rejection and take the process down.
    rejectQuery(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
