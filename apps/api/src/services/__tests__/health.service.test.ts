/**
 * Readiness probe tests (T-041, T-054).
 *
 * Two failure modes are pinned here, and they are different failures:
 *
 *  1. The one that started all of this -- `/health` answered 200 for hours
 *     while every login returned 500, because the static health check never
 *     touched the database. So the probe must run a real query and refuse to
 *     wait for a hung connection forever (T-041).
 *  2. The probe starving the API it is meant to report on. It used to run
 *     through the shared 20-slot pool, so a probe that lost its 2s race parked
 *     a pool slot on a dead connect attempt for the driver's ~30s connect
 *     timeout (T-054). The probe now opens a client of its own per call, and
 *     must always close it -- success, failure, and deadline alike.
 *
 * `createProbeClient` is mocked, so no database, no driver and no environment
 * is touched: `db/index.ts` validates the environment at import time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockCreateProbeClient: vi.fn(),
  mockUnsafe: vi.fn(),
  mockEnd: vi.fn(),
}));

vi.mock('../../db', () => ({
  createProbeClient: hoisted.mockCreateProbeClient,
}));

import { probeDatabase, DB_PROBE_TIMEOUT_MS, DB_UNREACHABLE } from '../health.service';

/** The task's own view of the driver client, narrowed to what the probe uses. */
interface FakeProbeClient {
  unsafe: (query: string, parameters: unknown[]) => Promise<unknown>;
  end: (options?: { timeout?: number }) => Promise<void>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  hoisted.mockUnsafe.mockResolvedValue([{ '?column?': 1 }]);
  hoisted.mockEnd.mockResolvedValue(undefined);

  const client: FakeProbeClient = { unsafe: hoisted.mockUnsafe, end: hoisted.mockEnd };
  hoisted.mockCreateProbeClient.mockReturnValue(client);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('probeDatabase', () => {
  it('reports ready after a real query round trip', async () => {
    const result = await probeDatabase();

    // A probe that never touches a connection is exactly the bug: assert the
    // query actually went out, and that it is the cheapest one there is.
    expect(hoisted.mockUnsafe).toHaveBeenCalledTimes(1);
    expect(hoisted.mockUnsafe.mock.calls[0]?.[0]).toBe('select 1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isInteger(result.latencyMs)).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses a client of its own, never the shared application pool', async () => {
    await probeDatabase();

    // The isolation itself: one dedicated client per probe.
    expect(hoisted.mockCreateProbeClient).toHaveBeenCalledTimes(1);
  });

  it('closes the probe client after a successful probe', async () => {
    await probeDatabase();

    // `timeout: 0` destroys rather than waits, so a probe can never leave a
    // connection behind for the next one to trip over.
    expect(hoisted.mockEnd).toHaveBeenCalledTimes(1);
    expect(hoisted.mockEnd).toHaveBeenCalledWith({ timeout: 0 });
  });

  it('reports not ready with a stable token when the query fails, and still closes the client', async () => {
    hoisted.mockUnsafe.mockRejectedValue(
      Object.assign(new Error('password authentication failed for user "safepass_admin"'), {
        code: '28P01',
      })
    );

    const result = await probeDatabase();

    expect(result).toEqual({ ok: false, error: DB_UNREACHABLE });
    // Driver internals stay off the wire: the body carries a fixed token.
    expect(JSON.stringify(result)).not.toContain('safepass_admin');
    // No leaked connection on the failure path either.
    expect(hoisted.mockEnd).toHaveBeenCalledTimes(1);
  });

  it('logs one structured line carrying the driver code', async () => {
    hoisted.mockUnsafe.mockRejectedValue(
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

  it('reports not ready instead of hanging when the connection never answers', async () => {
    vi.useFakeTimers();
    // A fresh connection to a deleted RDS instance does not fail fast -- it
    // waits in the handshake.
    hoisted.mockUnsafe.mockReturnValue(new Promise(() => undefined));

    const probe = probeDatabase();
    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS);
    const result = await probe;

    expect(result).toEqual({ ok: false, error: DB_UNREACHABLE });
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
    // The whole point of T-054: the timed-out probe kills its own connection
    // instead of handing a dead one back to a shared pool.
    expect(hoisted.mockEnd).toHaveBeenCalledWith({ timeout: 0 });
  });

  it('does not surface an unhandled rejection when a timed-out probe settles later', async () => {
    vi.useFakeTimers();
    let rejectQuery: (error: unknown) => void = () => undefined;
    hoisted.mockUnsafe.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectQuery = reject;
      })
    );

    const probe = probeDatabase();
    await vi.advanceTimersByTimeAsync(DB_PROBE_TIMEOUT_MS);
    await expect(probe).resolves.toEqual({ ok: false, error: DB_UNREACHABLE });

    // Destroying the connection makes the abandoned query reject after the race
    // is already decided; that must not become an unhandled rejection and take
    // the process down.
    rejectQuery(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(0);
  });

  it('reports not ready when the probe client cannot even be created', async () => {
    hoisted.mockCreateProbeClient.mockImplementation(() => {
      throw new Error('Invalid DATABASE_URL');
    });

    const result = await probeDatabase();

    expect(result).toEqual({ ok: false, error: DB_UNREACHABLE });
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
    // Nothing was opened, so nothing may be closed.
    expect(hoisted.mockEnd).not.toHaveBeenCalled();
  });

  it('survives a client that fails to close', async () => {
    hoisted.mockEnd.mockRejectedValue(new Error('socket already destroyed'));

    // A close failure is not a probe failure: the check itself answered.
    await expect(probeDatabase()).resolves.toMatchObject({ ok: true });
  });
});
