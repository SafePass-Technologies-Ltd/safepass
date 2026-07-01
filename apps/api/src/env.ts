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
// Secret resolution (pulled in-app, not baked in at build/deploy time)
//
// Local dev sets every value below directly via .env (see .env.example) --
// that path is untouched. In production, ECS only injects ARNs as plain
// (non-secret) env vars; this app fetches the actual secret material
// itself, at startup, via the AWS SDK using the ECS task role's scoped
// secretsmanager:GetSecretValue grant (see
// terraform/environments/production/main.tf's
// aws_iam_role_policy.ecs_task_rds_secret, and the task role's general
// runtime-access policy in terraform/modules/iam-ecs/main.tf for the
// jwt_secrets/firebase_admin/payment_gateways secrets).
//
// Deliberately NOT using ECS's native container-definition `secrets`
// injection (Secrets Manager valueFrom) for any of this: that mechanism
// requires the EXECUTION role (not the task role) to read every secret,
// widening its permissions beyond ECR/CloudWatch for no benefit, and it
// writes the resolved values into the task's container-level env var
// metadata. Fetching in-app instead means secret material only ever
// exists in this process's own memory, only the task role (this app's
// own identity) can read it, and every fetch is individually auditable in
// CloudTrail against that role -- and it lets DATABASE_URL be assembled
// from multiple fields, which ECS's injection can't do at all (see below).
async function loadJsonSecret(arn: string): Promise<Record<string, string>> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));

  if (!response.SecretString) {
    throw new Error(`Secret ${arn} has no SecretString`);
  }

  return JSON.parse(response.SecretString) as Record<string, string>;
}

async function resolveDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL || !process.env.DB_SECRET_ARN) return;

  // AWS's RDS-managed master-password secret only contains
  // username/password (see terraform/modules/rds/main.tf's
  // manage_master_user_password), not host/port/dbname, so those come from
  // the plain DB_HOST/DB_PORT/DB_NAME env vars instead.
  const { username, password } = await loadJsonSecret(process.env.DB_SECRET_ARN);
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

async function resolveJwtSecrets(): Promise<void> {
  if (process.env.JWT_ACCESS_SECRET || !process.env.JWT_SECRET_ARN) return;

  const secret = await loadJsonSecret(process.env.JWT_SECRET_ARN);
  process.env.JWT_ACCESS_SECRET = secret.access_secret;
  process.env.JWT_REFRESH_SECRET = secret.refresh_secret;
}

async function resolveFirebaseCredentials(): Promise<void> {
  if (process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_SECRET_ARN) return;

  const secret = await loadJsonSecret(process.env.FIREBASE_SECRET_ARN);
  process.env.FIREBASE_PROJECT_ID = secret.project_id;
  process.env.FIREBASE_CLIENT_EMAIL = secret.client_email;
  process.env.FIREBASE_PRIVATE_KEY = secret.private_key;
}

async function resolvePaymentGatewayKeys(): Promise<void> {
  if (process.env.PAYSTACK_SECRET_KEY || !process.env.PAYMENT_SECRET_ARN) return;

  // Read directly via process.env (not part of the zod schema below) by
  // apps/api/src/services/payment.service.ts, so just populate them --
  // nothing here needs to validate their presence.
  const secret = await loadJsonSecret(process.env.PAYMENT_SECRET_ARN);
  if (secret.paystack_secret_key) process.env.PAYSTACK_SECRET_KEY = secret.paystack_secret_key;
  if (secret.flutterwave_secret_key) process.env.FLUTTERWAVE_SECRET_KEY = secret.flutterwave_secret_key;
}

await Promise.all([
  resolveDatabaseUrl(),
  resolveJwtSecrets(),
  resolveFirebaseCredentials(),
  resolvePaymentGatewayKeys(),
]);

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
