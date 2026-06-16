import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from the monorepo root (three levels up from src/env.ts).
// path: apps/api/src/env.ts → ../../../ → project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Firebase Admin SDK — required for verifying client ID tokens.
  // In production these are injected by a secret manager.
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  UPSTASH_REDIS_TOKEN: z.string().optional(),
  TRIP_PRICE_NGN: z.coerce.number().int().positive().default(2000),
  ADMIN_DASHBOARD_URL: z.string().url().default('http://localhost:3001'),
  ENABLE_PANIC_RECORDING: z.coerce.boolean().default(true),
  // Resend — transactional email (role upgrade approval/rejection notices).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('SafePass <onboarding@resend.dev>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
