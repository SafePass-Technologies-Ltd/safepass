/**
 * Readiness probe (T-041) -- `GET /health/ready`, mounted under `/health`.
 *
 * `/health` itself stays exactly where it is (inline in index.ts) and keeps
 * answering statically: the ALB target group probes it, and re-pointing or
 * re-meaning that check is the Tech Lead's decision, not this module's.
 *
 * This endpoint is the honest one. It answers 200 only when a real query
 * reaches PostgreSQL, and 503 the moment it cannot -- which is the signal that
 * was missing when a deleted RDS instance left sign-in broken for hours while
 * `/health` reported 200 to the load balancer.
 */
import { Hono } from 'hono';
import { probeDatabase } from '../services/health.service';

export const healthRoutes = new Hono();

healthRoutes.get('/ready', async (c) => {
  const database = await probeDatabase();

  if (database.ok) {
    return c.json(
      {
        status: 'ready',
        checks: {
          database: { ok: true, latencyMs: database.latencyMs },
        },
      },
      200
    );
  }

  return c.json(
    {
      status: 'not_ready',
      checks: {
        database: { ok: false, error: database.error },
      },
    },
    503
  );
});
