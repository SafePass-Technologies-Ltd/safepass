// Corporate Dashboard — Vitest config.
//
// Mirrors apps/admin-dashboard's setup: vitest 3.2.0 + @vitejs/plugin-react
// 4.4.0, co-located `*.test.tsx` files, no global setup file. Adds a `@` path
// alias (mirroring tsconfig paths) so page-level tests resolve `@/lib/*`.
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors tsconfig paths; resolves `@/lib/firebase` etc. from src.
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
