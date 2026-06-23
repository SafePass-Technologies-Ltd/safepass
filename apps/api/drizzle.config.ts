import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit compiles this file as CJS, so import.meta.dirname is unavailable — use __dirname.
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
