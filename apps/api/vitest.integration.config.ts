import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Live-dependency suite -- `pnpm test:integration`. Never part of `pnpm test`.
 *
 * These files exercise real infrastructure, so they are opt-in by design:
 *
 * - `src/db/__tests__/retrying-client.integration.test.ts` drives the real
 *   postgres.js client + `withConnectionPasswordRetry` against PostgreSQL 16
 *   (`docker compose up -d`). It self-skips with a warning when nothing is
 *   listening on 5432.
 * - `src/routes/__tests__/health.incident.integration.test.ts` loads the real
 *   `src/index.ts` application, which validates the environment at import time
 *   and exits the process without it. Run this from a workstation that has a
 *   repo-root `.env`; it cannot run in a bare CI container (see
 *   `vitest.config.ts` for why that exclusion lives in config, not in guards).
 *
 * Requires: `docker compose up -d` and a populated `.env`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: [...configDefaults.exclude],
    // These are infrastructure tests: a hung connection is a real outcome, and
    // the readiness probe alone needs ~2s. Individual tests set their own,
    // tighter budgets where they matter.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
