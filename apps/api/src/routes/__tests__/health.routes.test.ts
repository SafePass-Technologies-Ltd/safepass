/**
 * Readiness route contract tests (T-041).
 *
 * `GET /health/ready` is a monitoring surface, so its exact shape matters: a
 * probe or alert parses `status` and the 200/503 split. Mounted the same way
 * index.ts mounts it, so the path itself is covered too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const hoisted = vi.hoisted(() => ({
  mockProbe: vi.fn(),
}));

vi.mock('../../services/health.service', () => ({
  probeDatabase: hoisted.mockProbe,
}));

import { healthRoutes } from '../health.routes';

const app = new Hono();
app.route('/health', healthRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /health/ready', () => {
  it('answers 200 ready with the database latency', async () => {
    hoisted.mockProbe.mockResolvedValue({ ok: true, latencyMs: 12 });

    const res = await app.request('/health/ready');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ready',
      checks: { database: { ok: true, latencyMs: 12 } },
    });
  });

  it('answers 503 not_ready with a stable error token', async () => {
    hoisted.mockProbe.mockResolvedValue({ ok: false, error: 'database_unreachable' });

    const res = await app.request('/health/ready');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'not_ready',
      checks: { database: { ok: false, error: 'database_unreachable' } },
    });
  });

  it('leaves the static liveness path alone', async () => {
    // /health itself is not part of this router -- it stays inline in index.ts
    // exactly as the ALB target group expects.
    const res = await app.request('/health');

    expect(res.status).toBe(404);
    expect(hoisted.mockProbe).not.toHaveBeenCalled();
  });
});
