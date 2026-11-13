import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import { getDatabaseConnection, getDatabasePassword } from './credentials';
import { withConnectionPasswordRetry } from './retrying-client';
import * as schema from './schema/index';

/**
 * Database client.
 *
 * WHY THE PASSWORD IS A FUNCTION AND NOT PART OF A CONNECTION STRING
 *
 * RDS owns and rotates the master password natively every 7 days
 * (terraform/modules/rds's manage_master_user_password). A connection string
 * captures that password once, at process start, and PostgreSQL authenticates
 * per CONNECTION -- so after a rotation the already-open pooled connections
 * keep working while every new one fails with 28P01, "password authentication
 * failed for user safepass_admin".
 *
 * The failure is therefore delayed and looks intermittent: it surfaces hours
 * later, when the pool first needs a fresh connection. It took production down
 * on 2026-07-22 and again on 2026-07-29 -- exactly one rotation interval apart
 * -- and both times a task restart appeared to "fix" it, because restarting
 * happens to re-read the secret.
 *
 * postgres.js accepts `password` as a function and calls it for EVERY new
 * connection, so handing it the rotation-aware resolver makes a rotation
 * self-healing: the next connection simply picks up the new password. See
 * ./credentials.ts for the caching that keeps this from hitting Secrets
 * Manager on every connect.
 */

const connection = getDatabaseConnection();

/**
 * Production (DB_SECRET_ARN set) uses discrete parameters plus the dynamic
 * password. Local dev and CI keep using DATABASE_URL verbatim, so that path is
 * unchanged and no AWS access is needed to run the app.
 */
const managedOptions = connection
  ? {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: getDatabasePassword,
      // RDS's default parameter group sets rds.force_ssl=1, which rejects
      // plaintext connections at the pg_hba.conf level before authentication
      // is even attempted. `require` encrypts without validating RDS's
      // certificate chain, so no CA bundle has to ship in the image --
      // matching the sslmode=require that the DATABASE_URL path uses.
      ssl: 'require' as const,
    }
  : null;

/**
 * Pool tuning that only non-application clients need. Kept as a narrow shape so
 * the application pool's configuration stays exactly what it was before T-054.
 */
interface ClientTuning {
  /** Seconds the driver waits for a new connection's handshake (driver default: 30). */
  connect_timeout?: number;
}

function createClient(max: number, tuning: ClientTuning = {}) {
  const client = managedOptions
    ? postgres({ ...managedOptions, max, ...tuning })
    : postgres(env.DATABASE_URL, { max, ...tuning });

  // A connection rejected with 28P01 is retried once with a freshly read
  // password; see ./retrying-client.ts for why the retry sits above the driver
  // rather than inside the `password` resolver.
  return withConnectionPasswordRetry(client);
}

// For query purposes
const queryClient = createClient(20);
export const db = drizzle(queryClient, { schema });

// Simple export: use this to create a new connection for transactions
export const createQueryClient = () => createClient(1);

/**
 * How long the readiness probe's own connection may spend in the handshake.
 *
 * Deliberately longer than the probe's 2s deadline (see
 * `services/health.service.ts`): a database that is merely slow still gets a
 * chance to answer, while the deadline -- not the driver -- decides when the
 * probe reports not-ready.
 */
export const PROBE_CONNECT_TIMEOUT_SECONDS = 5;

/**
 * A client for the readiness probe alone (T-054).
 *
 * WHY THE PROBE DOES NOT SHARE THE APPLICATION POOL
 *
 * `/health/ready` used to run `SELECT 1` through the same 20-slot pool the API
 * serves from. When the database is unreachable, a connect attempt does not
 * fail fast -- it waits out the driver's connect timeout (30s by default). A
 * probe that loses its 2s race therefore leaves one of those 20 slots parked on
 * a dead connect attempt, and a 10s probe interval against a dead database
 * fills the pool with dead connects in under a minute. Recovery then waits
 * behind the very connections that were meant to detect the outage.
 *
 * So the probe gets `max: 1` and a short `connect_timeout`, entirely outside
 * the application pool. Because this client is per-probe, the CALLER OWNS ITS
 * LIFECYCLE and must call `end()` -- `probeDatabase` does exactly that in a
 * `finally`, including on the timeout path.
 */
export function createProbeClient() {
  return createClient(1, { connect_timeout: PROBE_CONNECT_TIMEOUT_SECONDS });
}
