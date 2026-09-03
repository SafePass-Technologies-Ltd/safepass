/**
 * Homepage trust signals — "Trusted by people travelling Nigeria's roads".
 *
 * Added from client feedback: the homepage's differentiator is human-monitored
 * travel safety, not cost, so the trust section communicates principles before
 * the visitor ever reaches the price. This complements FEAT-005's credibility
 * module (which proves the safety-data methodology) by stating the operating
 * principles that make SafePass trustworthy in the first place.
 *
 * A PLAIN MODULE (no `'use client'`) so the section renders as a Server
 * Component and every principle + link is in the initial HTML. Principles, not
 * statistics — deliberately. No figures appear here, so there is nothing to
 * source or date (R-007 applies to numbers; these are capabilities the docs
 * already describe). If a number is ever added here it must carry a source and
 * an as-of date and be routed through `R-007` review.
 */

export interface TrustPrinciple {
  /** Short label rendered beside a check mark. */
  label: string;
}

export interface TrustLink {
  label: string;
  href: string;
}

export const TRUST = {
  eyebrow: 'Why SafePass is trusted',
  heading: 'Trusted by people travelling Nigeria’s roads',
  lead: 'SafePass exists so that every journey, wherever it goes, is one someone is watching over. We earn trust by being transparent about how that works, and every principle on this site is documented in public, not claimed in passing.',
  /** The check-marked principle list. */
  principles: [
    'Human monitored journeys',
    'Verification methodology published',
    'Live monitoring officers',
    'GPS journey tracking',
    'Emergency escalation',
    'Corporate monitoring',
    'Privacy-first design',
  ] as const,
  /**
   * The transparency strip near the top of the homepage: three links that
   * together tell a visitor "we're transparent, we protect your data, we'll
   * explain how this works". Matches the "trust strip" suggestion from client
   * feedback.
   */
  links: [
    { label: 'How We Verify', href: '/how-we-verify' },
    { label: 'Privacy & Security', href: '/privacy' },
    { label: 'Learn How Monitoring Works', href: '/#how-it-works' },
  ] satisfies ReadonlyArray<TrustLink>,
} as const;
