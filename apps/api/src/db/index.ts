import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import { getDatabaseConnection, getDatabasePassword } from './credentials';
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

function createClient(max: number) {
  return managedOptions
    ? postgres({ ...managedOptions, max })
    : postgres(env.DATABASE_URL, { max });
}

// For query purposes
const queryClient = createClient(20);
export const db = drizzle(queryClient, { schema });

// Simple export: use this to create a new connection for transactions
export const createQueryClient = () => createClient(1);
