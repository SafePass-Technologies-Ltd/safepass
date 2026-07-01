// SafePass — Corporate Dashboard ESLint config
//
// Flat config (ESLint 9) using Next.js's recommended rule sets. Without this
// file, `next lint` drops into an interactive first-run setup wizard, which
// hangs/fails non-interactively in CI.
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    rules: {
      // Project convention: prefix an intentionally-unused destructured
      // prop/arg with '_' (e.g. 'orgId: _orgId') instead of an inline
      // eslint-disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
