import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Default (unit) run -- `pnpm test`. This is what CI executes.
 *
 * `*.integration.test.ts` is excluded HERE, by construction, and not through
 * per-test `skipIf` guards. The guard has to hold BEFORE the module graph loads:
 * `src/index.ts` and `src/db/index.ts` both reach `src/env.ts`, which validates
 * the whole environment at import time and calls `process.exit(1)` when anything
 * required is missing (see its "DELIBERATELY SEPARATE FROM env.ts" note in
 * `db/credentials.ts`). CI has no `.env`, so one such import kills the worker
 * outright -- a `skipIf` never gets the chance to run, and the failure surfaces
 * as `process.exit unexpectedly called with "1"` rather than a skipped test.
 *
 * That is exactly how the first version of the DB-outage tests broke CI, so the
 * exclusion is a pattern rather than a list: any future `*.integration.test.ts`
 * is opt-in automatically and cannot regress into the unit run.
 *
 * The excluded files run with `pnpm test:integration`, which expects a live
 * PostgreSQL (`docker compose up -d`) and a populated environment.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
    // Vitest does not understand module augmentation (Hono context vars)
    // by default; we handle this via tsconfig include or inline.
  },
});
