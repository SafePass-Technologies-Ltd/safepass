import { AUDIENCE_LIST, type Audience } from '@/lib/audience/audience-config';
import { clientEnv } from '@/lib/env';

/**
 * Navigation and footer content — FEAT-001 and FEAT-002.
 *
 * Kept as typed data rather than inlined in JSX, per IMPLEMENTATION.md Section 4
 * ("Content lives in lib/content/ as typed data") so that FEAT-016's eventual
 * CMS swap is a data-source change rather than a component rewrite.
 *
 * The audience entries are DERIVED from `@/lib/audience/audience-config`, which
 * is importable from both Server and Client Components. An earlier version
 * restated them here to dodge a `'use client'` boundary problem; that boundary
 * has since been fixed properly by splitting the data out of the context
 * module, so there is exactly one definition of where "Business" goes.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface AudienceNavLink extends NavLink {
  audience: Audience;
  /** The audience's converting action, from AUDIENCE_CONFIG.ctaLabel. */
  ctaLabel: string;
}

/**
 * The three audience destinations, in the order screens.md's navigation map
 * lists them (Individual → Business → Transport Partner).
 */
export const AUDIENCE_NAV: ReadonlyArray<AudienceNavLink> = AUDIENCE_LIST.map(
  ({ audience, label, href, ctaLabel }) => ({ audience, label, href, ctaLabel })
);

/**
 * Non-audience navigation shown in both Navbar variants.
 *
 * Deliberately one item: screens.md's navigation map has exactly one
 * cross-cutting destination reachable from every page (`/how-we-verify`), and
 * the header's job per FEAT-001 is audience routing, not a site directory.
 */
export const PRIMARY_NAV: ReadonlyArray<NavLink> = [
  { label: 'How We Verify', href: '/how-we-verify' },
];

/**
 * Full link set used by the non-audience-selecting Navbar variant (legal/about
 * pages) and by the mobile drawer: there the three audience destinations are
 * plain links, since screens.md specifies that variant shows "logo + primary
 * nav, no active audience state".
 */
export const STATIC_NAV: ReadonlyArray<NavLink> = [
  ...AUDIENCE_NAV.map(({ label, href }) => ({ label, href })),
  ...PRIMARY_NAV,
];

export const FOOTER_EXPLORE: ReadonlyArray<NavLink> = [
  { label: 'Home', href: '/' },
  ...STATIC_NAV,
];

/**
 * Legal links. FEAT-015 requires all three be reachable within two clicks from
 * the homepage, and risk_log.md R-011 requires a live, reachable Privacy Policy
 * before any lead-capture form ships — the footer is what guarantees both.
 */
export const FOOTER_LEGAL: ReadonlyArray<NavLink> = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'About', href: '/about' },
];

/**
 * Public contact address (FEAT-002: "Footer includes a contact method").
 *
 * ASSUMPTION: no doc specifies a public contact address, so this reuses the
 * configured fallback contact — the same address a failed lead submission
 * offers the visitor. Reported as a docs gap; a distinct `NEXT_PUBLIC_*`
 * value can be pointed at this constant without touching the component.
 */
export const CONTACT_EMAIL = clientEnv.fallbackContactEmail;

export const BRAND_TAGLINE = 'Every Journey Matters.';
