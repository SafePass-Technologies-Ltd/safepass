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
// runtime-access policy in terraform/modules/iam-ecs/main.tf).
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
async function loadJsonSecret(arn: string): Promise<Record<string, unknown>> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));

  if (!response.SecretString) {
    throw new Error(`Secret ${arn} has no SecretString`);
  }

  return JSON.parse(response.SecretString) as Record<string, unknown>;
}

// APP_SECRET_ARN points at ONE consolidated Secrets Manager secret
// (terraform/modules/secrets/main.tf, named "<project>/<environment>")
// covering jwt_secrets/firebase_admin/payment_gateways/external_services
// as top-level JSON keys -- one secret instead of four, since Secrets
// Manager bills per secret regardless of size. Memoized so the four
// resolvers below (which all run concurrently via Promise.all) share one
// GetSecretValue call rather than issuing four redundant fetches for the
// same secret. The RDS-managed master credentials secret is NOT part of
// this -- see resolveDatabaseUrl, which reads DB_SECRET_ARN separately
// (AWS owns and rotates that one natively).
let appSecretPromise: Promise<Record<string, unknown>> | null = null;
function loadAppSecret(): Promise<Record<string, unknown>> {
  if (!appSecretPromise) appSecretPromise = loadJsonSecret(process.env.APP_SECRET_ARN!);
  return appSecretPromise;
}

/** Narrows a JSON secret's nested group to a flat string map, defaulting missing groups to {}. */
function group(secret: Record<string, unknown>, key: string): Record<string, string> {
  return (secret[key] as Record<string, string> | undefined) ?? {};
}

async function resolveDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL || !process.env.DB_SECRET_ARN) return;

  // AWS's RDS-managed master-password secret only contains
  // username/password (see terraform/modules/rds/main.tf's
  // manage_master_user_password), not host/port/dbname, so those come from
  // the plain DB_HOST/DB_PORT/DB_NAME env vars instead.
  const { username, password } = (await loadJsonSecret(process.env.DB_SECRET_ARN)) as {
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
  //
  // sslmode=require: AWS RDS's default PostgreSQL parameter group enforces
  // rds.force_ssl=1, which rejects any plaintext connection outright at the
  // pg_hba.conf level ("no pg_hba.conf entry for host ..., no encryption")
  // before authentication is even attempted. The `postgres` package (see
  // apps/api/src/db/index.ts) parses `sslmode` out of the connection string
  // itself and maps it to its own `ssl` option -- `require` enables TLS on
  // the wire without verifying RDS's certificate chain (no CA bundle needs
  // to be shipped in the container image), matching libpq's sslmode=require
  // semantics: encrypted, but not certificate-validated.
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}?sslmode=require`;
}

async function resolveJwtSecrets(): Promise<void> {
  if (process.env.JWT_ACCESS_SECRET || !process.env.APP_SECRET_ARN) return;

  const jwt = group(await loadAppSecret(), 'jwt_secrets');
  process.env.JWT_ACCESS_SECRET = jwt.access_secret;
  process.env.JWT_REFRESH_SECRET = jwt.refresh_secret;
}

async function resolveFirebaseCredentials(): Promise<void> {
  if (process.env.FIREBASE_PROJECT_ID || !process.env.APP_SECRET_ARN) return;

  const firebase = group(await loadAppSecret(), 'firebase_admin');
  process.env.FIREBASE_PROJECT_ID = firebase.project_id;
  process.env.FIREBASE_CLIENT_EMAIL = firebase.client_email;
  process.env.FIREBASE_PRIVATE_KEY = firebase.private_key;
}

async function resolvePaymentGatewayKeys(): Promise<void> {
  if (process.env.PAYSTACK_SECRET_KEY || !process.env.APP_SECRET_ARN) return;

  // Read directly via process.env (not part of the zod schema below) by
  // apps/api/src/services/payment.service.ts, so just populate them --
  // nothing here needs to validate their presence.
  const payment = group(await loadAppSecret(), 'payment_gateways');
  if (payment.paystack_secret_key) process.env.PAYSTACK_SECRET_KEY = payment.paystack_secret_key;
  if (payment.flutterwave_secret_key) process.env.FLUTTERWAVE_SECRET_KEY = payment.flutterwave_secret_key;
}

/**
 * Resolves the remaining third-party credentials (Redis, Resend, Google
 * Maps) from the same consolidated secret's `external_services` group --
 * these don't individually warrant their own top-level env var resolution
 * path the way DB/JWT/Firebase/payment do, so they're grouped together.
 * All are optional in the zod schema below, so a missing/placeholder value
 * here just leaves the corresponding feature (rate limiting, email,
 * geocoding) disabled rather than failing startup.
 */
async function resolveExternalServices(): Promise<void> {
  if (!process.env.APP_SECRET_ARN) return;

  const external = group(await loadAppSecret(), 'external_services');
  if (!process.env.UPSTASH_REDIS_URL && external.upstash_redis_url) {
    process.env.UPSTASH_REDIS_URL = external.upstash_redis_url;
  }
  if (!process.env.UPSTASH_REDIS_TOKEN && external.upstash_redis_token) {
    process.env.UPSTASH_REDIS_TOKEN = external.upstash_redis_token;
  }
  if (!process.env.RESEND_API_KEY && external.resend_api_key) {
    process.env.RESEND_API_KEY = external.resend_api_key;
  }
  if (!process.env.GOOGLE_MAPS_API_KEY && external.google_maps_api_key) {
    process.env.GOOGLE_MAPS_API_KEY = external.google_maps_api_key;
  }
}

await Promise.all([
  resolveDatabaseUrl(),
  resolveJwtSecrets(),
  resolveFirebaseCredentials(),
  resolvePaymentGatewayKeys(),
  resolveExternalServices(),
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
  // Corporate/transport dashboards are separate Next.js apps with their own
  // origins -- all three need to be in the CORS allowlist below (see
  // index.ts), not just the admin dashboard. Optional/defaulted (unlike
  // ADMIN_DASHBOARD_URL) since a production deploy without one of these
  // apps live yet should not fail startup; that dashboard's requests would
  // just be CORS-rejected until its URL is configured.
  CORPORATE_DASHBOARD_URL: z.string().url().default('http://localhost:3002'),
  TRANSPORT_DASHBOARD_URL: z.string().url().default('http://localhost:3003'),
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
  // Name of the Terraform-provisioned single-table realtime-state store
  // (see terraform/modules/dynamodb/main.tf) -- shared by GPS positions,
  // WebSocket connection mappings, and trip status flags, keyed by
  // entity_id/record_type. Terraform passes this in production
  // (terraform/environments/production/main.tf); the default here matches
  // docker-compose's DynamoDB Local setup for local development.
  DYNAMODB_TABLE_NAME: z.string().default('safepass-development-realtime-state'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
