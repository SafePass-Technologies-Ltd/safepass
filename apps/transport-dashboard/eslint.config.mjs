// SafePass — Transport Dashboard ESLint config
//
// Flat config (ESLint 9), run directly via the ESLint CLI (`next lint` was
// removed in Next.js 16). eslint-config-next now ships its rule sets as
// native flat config arrays, so they're imported directly rather than routed
// through `FlatCompat#extends`, which mis-handles their plugin objects
// (causes a "Converting circular structure to JSON" crash during config
// validation).
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
      // prop/arg with '_' (e.g. 'orgId: _orgId') instead of an inline
      // eslint-disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // New in eslint-config-next's react-hooks v6 rule set. Flags the
      // common "fetch in useEffect, then setState" data-loading pattern
      // used throughout this app's dashboard pages. Downgraded to a
      // warning (rather than fixed or disabled) so it stays visible
      // without blocking CI; revisit as pages are refactored.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default eslintConfig;
