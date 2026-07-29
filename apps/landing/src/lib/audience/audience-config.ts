/**
 * Audience definitions — the single source of truth for the three personas the
 * site routes between (FEAT-001).
 *
 * DELIBERATELY NOT a `'use client'` module, and it must stay that way.
 *
 * `'use client'` turns every *value* export of a module into a client reference
 * in the RSC graph. A Server Component importing `AUDIENCE_CONFIG` from such a
 * module receives a proxy rather than the object, and the build fails during
 * prerender with something like `AUDIENCES.map is not a function`. That failure
 * is invisible to `tsc` and to the test suite — only `next build` catches it —
 * which makes it exactly the kind of breakage that reaches a deploy.
 *
 * The Footer, page metadata, and the sitemap are all Server Components that need
 * this data, so it lives here and `audience-context.tsx` re-exports it for
 * client consumers. Keep the two concerns separate: DATA here, React state
 * there.
 */

export const AUDIENCES = ['individual', 'business', 'transport'] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface AudienceDefinition {
  /** Display label used by the selector and by plain nav links. */
  label: string;
  /** The audience's dedicated page, per screens.md's navigation map. */
  href: string;
  /** The converting action for this audience — app download, demo, or partnership. */
  ctaLabel: string;
}

/**
 * Per-audience labels, routes, and CTAs.
 *
 * Order matters: Individual → Business → Transport Partner, matching
 * screens.md's navigation map and the selector's left-to-right order.
 *
 * The CTA labels are the reason this is centralised — FEAT-006/009/011 each
 * require their page's primary CTA be the *right* one for that audience (app
 * download, "Request a Demo", "Partner With Us" respectively), and a header,
 * footer, and page disagreeing about that is a conversion bug, not a cosmetic
 * one.
 */
export const AUDIENCE_CONFIG: Record<Audience, AudienceDefinition> = {
  individual: { label: 'Individual', href: '/individual', ctaLabel: 'Get the App' },
  business: { label: 'Business', href: '/business', ctaLabel: 'Request a Demo' },
  transport: {
    label: 'Transport Partner',
    href: '/transport-partners',
    ctaLabel: 'Partner With Us',
  },
};

/**
 * Maps a route to the audience it belongs to.
 *
 * Powers user_flow.md's Global Flow requirement that "deep links directly to an
 * audience-specific page set the Audience Selector state to match on load,
 * rather than defaulting to 'Individual'" — the shared "For Business" URL that
 * Tunde forwards to a colleague must not open showing consumer messaging.
 *
 * Derived from AUDIENCE_CONFIG rather than restated, so adding an audience
 * cannot leave its deep link unmapped.
 */
export const PATH_TO_AUDIENCE: Record<string, Audience> = Object.fromEntries(
  AUDIENCES.map((audience) => [AUDIENCE_CONFIG[audience].href, audience])
);

/** Ordered list form, for rendering selectors and nav menus. */
export const AUDIENCE_LIST: ReadonlyArray<AudienceDefinition & { audience: Audience }> =
  AUDIENCES.map((audience) => ({ audience, ...AUDIENCE_CONFIG[audience] }));
