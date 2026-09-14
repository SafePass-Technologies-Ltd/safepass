/** @type {import('tailwindcss').Config} */
// Spec source: docs/SafePass/branding.md (Design System → Color Palette).
// Light-column values only; the spec's dark column is not implemented here.
// Primary is the Electric Blue 9-shade scale; `grey` is the cool-grey scale
// (exposed under `grey-*` to avoid colliding with Tailwind's built-in slate);
// `success`/`warning`/`error`/`info`/`accent` are the semantic role tokens;
// `brandShadow-*` carries the spec elevation tokens. `brandShadow` is
// deliberately namespaced instead of overriding Tailwind's `shadow-sm|md|lg`
// defaults, so existing UI keeps rendering unchanged until components adopt
// the spec values.
export default {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0EA5E9',
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        safety: {
          green: '#0D904F',
          amber: '#F5A623',
          red: '#D93025',
        },
        slate: {
          dark: '#1E293B',
        },
        // Cool-grey 9-shade scale (light column)
        grey: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#F1F5F9',
          300: '#E2E8F0',
          400: '#CBD5E1',
          500: '#94A3B8',
          600: '#64748B',
          700: '#475569',
          800: '#334155',
          900: '#1E293B',
        },
        // Semantic roles (500 = base status colors)
        success: '#0D904F',
        warning: '#F5A623',
        error: '#D93025',
        info: '#0284C7',
        accent: '#E11D48',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
      },
      boxShadow: {
        // Spec elevation tokens (light column), namespaced to avoid
        // overriding Tailwind's built-in shadow-sm/md/lg defaults in
        // existing markup.
        'brand-sm': '0 1px 2px rgba(15, 23, 42, 0.05)',
        'brand-md': '0 4px 6px rgba(15, 23, 42, 0.07)',
        'brand-lg': '0 10px 25px rgba(15, 23, 42, 0.1)',
        'brand-xl': '0 24px 50px rgba(15, 23, 42, 0.15)',
      },
    },
  },
  plugins: [],
};
