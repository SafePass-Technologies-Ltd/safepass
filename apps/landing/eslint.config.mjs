// SafePassLanding ESLint config
//
// Flat config (ESLint 9), run directly via the ESLint CLI (`next lint` was
// removed in Next.js 16). eslint-config-next ships its rule sets as native
// flat config arrays, so they're imported directly rather than routed through
// FlatCompat#extends — see apps/corporate-dashboard/eslint.config.mjs for the
// full explanation of why that matters.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    rules: {
      // Project convention: prefix an intentionally-unused destructured
      // prop/arg with '_' instead of an inline eslint-disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
