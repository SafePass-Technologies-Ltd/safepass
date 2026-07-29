import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Rotating RDS credentials.
 *
 * RDS owns and ROTATES the master password natively every 7 days
 * (terraform/modules/rds's manage_master_user_password). A password read once
 * at startup therefore has a shelf life, and PostgreSQL authenticates per
 * CONNECTION -- so after a rotation, already-open pooled connections keep
 * working while every NEW connection fails with 28P01, "password
 * authentication failed for user safepass_admin".
 *
 * That is not hypothetical: it took production down on 2026-07-22 and again on
 * 2026-07-29, one rotation interval apart, and both times a task restart
 * "fixed" it by incidentally re-reading the secret. Sign-in was the visible
 * symptom, because token-exchange queries `users` on every login.
 *
 * `getDatabasePassword` is handed to postgres.js as its `password` option (see
 * ./index.ts), which invokes it for every new connection, so a rotation
 * self-heals within the cache TTL instead of needing a redeploy.
 *
 * DELIBERATELY SEPARATE FROM env.ts, which validates the whole environment at
 * import time and calls process.exit(1) when anything required is missing.
 * Keeping this module free of that lets the pool resolve credentials without
 * dragging in that validation, and lets these paths be unit-tested without
 * a fully-populated environment.
 */

const DB_PASSWORD_TTL_MS = 5 * 60 * 1000;

let cachedPassword: { value: string; fetchedAt: number } | null = null;
let inFlight: Promise<string> | null = null;
let cachedUsername: string | null = null;

/**
 * Seeds the cache from a fetch that has already happened, so startup doesn't
 * pay for a second GetSecretValue call. Called by env.ts's resolveDatabaseUrl.
 */
export function seedDatabaseCredentials(username: string, password: string): void {
  cachedUsername = username;
  cachedPassword = { value: password, fetchedAt: Date.now() };
}

/** Test seam: drops all cached credential state. */
export function resetDatabaseCredentials(): void {
  cachedPassword = null;
  cachedUsername = null;
  inFlight = null;
}

async function fetchSecret(arn: string): Promise<{ username: string; password: string }> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));

  if (!response.SecretString) throw new Error(`Secret ${arn} has no SecretString`);

  return JSON.parse(response.SecretString) as { username: string; password: string };
}

/**
 * Current master password for the RDS instance.
 *
 * Falls back to the password embedded in DATABASE_URL when DB_SECRET_ARN is
 * unset (local dev and CI), so this is safe to call unconditionally.
 */
export async function getDatabasePassword(): Promise<string> {
  const arn = process.env.DB_SECRET_ARN;

  if (!arn) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Neither DB_SECRET_ARN nor DATABASE_URL is set');
    return decodeURIComponent(new URL(url).password);
  }

  if (cachedPassword && Date.now() - cachedPassword.fetchedAt < DB_PASSWORD_TTL_MS) {
    return cachedPassword.value;
  }

  // Collapse concurrent refreshes: a pool opening several connections at once
  // must not fire several GetSecretValue calls for the same rotation.
  if (!inFlight) {
    inFlight = fetchSecret(arn)
      .then(({ username, password }) => {
        cachedUsername = username;
        cachedPassword = { value: password, fetchedAt: Date.now() };
        return password;
      })
      .catch((error) => {
        // Serving a known-good password beats failing the connection outright
        // when Secrets Manager is briefly unreachable; it only genuinely fails
        // once the password has also rotated.
        if (cachedPassword) {
          console.error('[db] could not refresh the DB password, reusing cached:', error);
          return cachedPassword.value;
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

/**
 * Discrete connection parameters for the managed-credentials path, or null
 * when DATABASE_URL should be used verbatim (local dev, CI).
 */
export function getDatabaseConnection(): {
  host: string;
  port: number;
  database: string;
  username: string;
} | null {
  if (!process.env.DB_SECRET_ARN || !process.env.DB_HOST) return null;

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'safepass',
    username: cachedUsername ?? 'safepass_admin',
  };
}
