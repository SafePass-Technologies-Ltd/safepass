/**
 * Homepage hero copy — FEAT-003, `screens/01-homepage.md` (Hero Section).
 *
 * Kept as typed data rather than inlined in JSX per IMPLEMENTATION.md Section 4,
 * so FEAT-016's eventual CMS swap is a data-source change and — more immediately
 * — so a copy edit never requires touching animation code (risk_log.md R-005
 * names motion fragility under content change as the cost of the Creative tier).
 *
 * Every claim here traces to a document. The headline is `branding.md`'s
 * tagline; the supporting sentence restates the differentiators listed in
 * `docs/SafePass/README.md` ("safety-focused satnav", "human-in-the-loop
 * monitoring — real officers watching trips, not just automated alerts").
 * Nothing here asserts a statistic, a response time, or a coverage figure,
 * because no document supplies one.
 */

export interface HeroContent {
  /** Short category line above the headline. */
  eyebrow: string;
  /**
   * The headline, pre-split into the lines the masked wipe animates.
   *
   * Split in the DATA rather than by measuring the rendered text, so the
   * server-rendered DOM already contains the exact elements the animation
   * targets — the headline is never assembled or injected client-side.
   */
  headlineLines: readonly string[];
  /** Accessible single-string form of the headline, for the page's H1 label. */
  headline: string;
  /** The one-sentence explanation required by FEAT-003's first criterion. */
  subheadline: string;
  /** Label above the store badges. */
  ctaLabel: string;
  /** Secondary action for visitors who want detail (and pricing) first. */
  secondaryCta: { label: string; href: string };
  /** Cue that there is more below — Flow 1 step 3 depends on the scroll happening. */
  scrollCue: string;
}

export const HERO: HeroContent = {
  eyebrow: 'Road safety monitoring for Nigeria',
  headlineLines: ['Every Journey', 'Matters.'],
  headline: 'Every Journey Matters.',
  subheadline:
    'SafePass is a safety-focused satnav: you register your road trip, and a real SafePass monitoring officer watches it live from departure to arrival — not an automated alert on its own.',
  ctaLabel: 'Get SafePass on your phone',
  // Names pricing deliberately: Flow 1's Alternate Path C loses the visitor who
  // "cannot find pricing quickly", and the traveller page (FEAT-006) is where
  // Flow 1 step 5 says the figures live.
  secondaryCta: { label: 'See pricing for travellers', href: '/individual' },
  scrollCue: 'How it works',
};
