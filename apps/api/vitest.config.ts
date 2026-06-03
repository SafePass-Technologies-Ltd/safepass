import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest does not understand module augmentation (Hono context vars)
    // by default; we handle this via tsconfig include or inline.
  },
});
