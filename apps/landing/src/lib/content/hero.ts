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
 * `docs/SafePass/README.md` ("human-in-the-loop monitoring — real officers
 * watching trips, not just automated alerts"), reworded in the post-launch
 * client copy pass to lead with why SafePass exists rather than what it is.
 * `marketLine` names the segments the site serves, drawn from the three
 * audience paths in screens.md's navigation map. Nothing here asserts a
 * statistic, a response time, or a coverage figure, because no document
 * supplies one.
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
  /** A short line framing the market the product serves, beneath the subheadline. */
  marketLine: string;
  /** Label above the store badges. */
  ctaLabel: string;
  /** Secondary action for visitors who want detail (and pricing) first. */
  secondaryCta: { label: string; href: string };
  /** Cue that there is more below — Flow 1 step 3 depends on the scroll happening. */
  scrollCue: string;
}

export const HERO: HeroContent = {
  // The owned category name. Client positioning: SafePass is not a tracker, not
  // a satnav, not even "a monitoring app" — it is a Road Journey Assurance
  // Platform. The category is the thing SafePass owns in the market, so it sits
  // where the eyebrow (the first line a visitor reads) is.
  eyebrow: 'Road Journey Assurance Platform',
  headlineLines: ['Every Journey', 'Matters.'],
  headline: 'Every Journey Matters.',
  subheadline:
    'Plan your journey. Travel with certainty. Every monitored trip is watched live by a trained SafePass monitoring officer from departure to arrival, combining intelligent technology with real human oversight when it matters most.',
  marketLine:
    'Designed for inter-city travel, high-risk routes, business travel and passenger transport.',
  // The "Get the App" wording is the primary, store-agnostic action: a visitor
  // deciding which store to use is a second decision that acts as friction
  // before conversion. The store badges beneath are the concrete options.
  ctaLabel: 'Get the App',
  // Names pricing deliberately: Flow 1's Alternate Path C loses the visitor who
  // "cannot find pricing quickly", and the traveller page (FEAT-006) is where
  // Flow 1 step 5 says the figures live.
  secondaryCta: { label: 'View Plans & Pricing', href: '/individual' },
  scrollCue: 'How it works',
};
