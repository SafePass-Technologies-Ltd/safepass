import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Load .env from the monorepo root (three levels up from src/env.ts).
// path: apps/api/src/env.ts → ../../../ → project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// ─────────────────────────────────────────────
// DATABASE_URL resolution
//
// Local dev sets DATABASE_URL directly (see .env.example / docker-compose)
// -- that path is untouched below. In production, ECS injects the RDS
// master credentials as a Secrets Manager ARN (DB_SECRET_ARN) rather than a
// full connection string, because:
//   - AWS's RDS-managed master-password secret only contains
//     username/password (see terraform/modules/rds/main.tf's
//     manage_master_user_password), not host/port/dbname.
//   - ECS's own container-definition secrets mechanism can only inject a
//     secret's value verbatim (or a single JSON key via its ":key::"
//     selector) -- it can't concatenate multiple fields into one connection
//     string.
// So when DB_SECRET_ARN is present and DATABASE_URL isn't, fetch the
// secret here (using the task role's existing secretsmanager:GetSecretValue
// grant -- see terraform/environments/production/main.tf's
// aws_iam_role_policy.ecs_task_rds_secret) and assemble DATABASE_URL from
// it plus the plain DB_HOST/DB_PORT/DB_NAME env vars. Falls through to the
// schema's plain z.string().url() check either way, so a missing/invalid
// result still fails startup loudly rather than silently.
async function resolveDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL || !process.env.DB_SECRET_ARN) return;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
  );

  if (!response.SecretString) {
    throw new Error(
      `DB_SECRET_ARN (${process.env.DB_SECRET_ARN}) has no SecretString`
    );
  }

  const { username, password } = JSON.parse(response.SecretString) as {
    username: string;
    password: string;
  };

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? 'safepass';

  if (!host) {
    throw new Error('DB_SECRET_ARN is set but DB_HOST is missing -- cannot assemble DATABASE_URL');
  }

  // encodeURIComponent guards against special characters in the
  // AWS-generated password breaking the connection string's URL syntax.
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
}

await resolveDatabaseUrl();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Firebase Admin SDK -- required for verifying client ID tokens.
  // In production these are injected by a secret manager.
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
  TRIP_PRICE_NGN: z.coerce.number().int().positive().default(2000),
  ADMIN_DASHBOARD_URL: z.string().url().default('http://localhost:3001'),
  ENABLE_PANIC_RECORDING: z.coerce.boolean().default(true),
  // Resend -- transactional email (role upgrade approval/rejection notices).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('SafePass <onboarding@resend.dev>'),
  // Google Maps -- geocoding and place search
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // DynamoDB -- GPS location storage with 60-second TTL.
  // Point to DynamoDB Local in development; omit in production to use real AWS DynamoDB.
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  DYNAMODB_REGION: z.string().default('eu-west-2'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
