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

/** SQLSTATE for "password authentication failed for user". */
const PG_PASSWORD_AUTH_FAILED = '28P01';

let cachedPassword: { value: string; fetchedAt: number } | null = null;
let inFlight: Promise<string> | null = null;
let cachedUsername: string | null = null;

/**
 * Bumped every time the cached password is thrown away.
 *
 * A refresh that started BEFORE an invalidation may land with the password the
 * server has already rejected, so it must not write it back into the cache --
 * that would re-poison a freshly invalidated cache and put the pool straight
 * back on a dead credential.
 */
let credentialGeneration = 0;

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
  credentialGeneration += 1;
}

/**
 * Drops the cached password so the next connection mints a fresh one.
 *
 * Called when PostgreSQL rejects a NEW connection with 28P01: at that point the
 * cached value is known-bad, and continuing to serve it means every connection
 * attempt keeps presenting the same rejected credential until the task
 * restarts. That is what turned a single RDS rotation into a permanent outage
 * on 2026-07-22 and 2026-07-29.
 *
 * `inFlight` is detached as well: a refresh already in progress was started
 * with the old generation and must not satisfy the next caller.
 */
export function invalidateDatabasePassword(): void {
  cachedPassword = null;
  inFlight = null;
  credentialGeneration += 1;
}

/**
 * True when `error` is PostgreSQL rejecting the connection's credentials
 * (SQLSTATE 28P01).
 *
 * Walks the `cause` chain because Drizzle wraps driver errors in
 * `DrizzleQueryError`, and the postgres.js `PostgresError` carrying the
 * SQLSTATE sits underneath it.
 */
export function isPasswordAuthFailure(error: unknown): boolean {
  let current: unknown = error;

  // Bounded so a self-referential cause chain cannot spin here.
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === PG_PASSWORD_AUTH_FAILED) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * Runs a database operation, retrying it ONCE after forcing a credential
 * refresh if PostgreSQL rejected the connection's password.
 *
 * SAFETY: 28P01 is raised while the server authenticates a NEW connection, so
 * the statement never reached the database -- retrying cannot duplicate a write
 * or re-apply a partial transaction. That is the only error this retries; every
 * other failure propagates untouched.
 *
 * The second attempt deliberately does not loop: if Secrets Manager is also
 * unreachable, the refresh throws and the caller sees the real error instead of
 * a silent infinite retry against a dead password.
 */
export async function withPasswordAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPasswordAuthFailure(error)) throw error;

    invalidateDatabasePassword();

    // Single structured line: a rotation should be visible in CloudWatch even
    // when no request observes the failing connection.
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'db_password_auth_failed',
        message:
          'PostgreSQL rejected the connection password (28P01); dropping the cached password and retrying once with a fresh read from Secrets Manager',
      })
    );

    return await operation();
  }
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
    const generation = credentialGeneration;

    let pending: Promise<string>;
    pending = fetchSecret(arn)
      .then(({ username, password }) => {
        // An invalidation landed while this fetch was in flight: the password
        // it carries is what the server has just rejected, so returning it to
        // the caller is fine but caching it again is not.
        if (generation === credentialGeneration) {
          cachedUsername = username;
          cachedPassword = { value: password, fetchedAt: Date.now() };
        }
        return password;
      })
      .catch((error) => {
        // Serving a known-good password beats failing the connection outright
        // when Secrets Manager is briefly unreachable; it only genuinely fails
        // once the password has also rotated. A 28P01 retry invalidated the
        // cache first, so that path has nothing to fall back to and throws --
        // retrying a dead password is how this became a permanent outage.
        if (cachedPassword) {
          console.error('[db] could not refresh the DB password, reusing cached:', error);
          return cachedPassword.value;
        }
        throw error;
      })
      .finally(() => {
        // Only clear the slot this refresh owns; a newer refresh may already
        // have taken it over after an invalidation.
        if (inFlight === pending) inFlight = null;
      });

    inFlight = pending;
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
