import type { VerificationTier } from '@safepass/shared';

/**
 * Credibility & Safety-Data copy — FEAT-005, `screens/05-credibility-page.md`.
 *
 * PLAIN MODULE (no `'use client'`): the credibility page and its embeds are
 * Server Components, and this content must be in the server-rendered HTML for
 * FEAT-005's crawlability criterion to hold.
 *
 * Every claim here is restated from `docs/SafePass/README.md`'s "Cold-Start
 * Strategy: Bootstrapping the Safety Map" in public-appropriate language.
 * Nothing describes capability SafePass hasn't documented, and no operational
 * numbers appear — see the note in `safety-data-stats.ts`.
 */

export interface CredibilityLayer {
  /** Anchor id, so the section is deep-linkable from the audience pages. */
  id: string;
  /** e.g. 'Layer 1' — rendered as an eyebrow, not part of the heading. */
  eyebrow: string;
  heading: string;
  body: string[];
  /** Concrete examples, rendered as a bulleted list. */
  points: string[];
}

export interface VerificationTierExplainer {
  /**
   * The badge variant to render. Omitted for `rejected`, which the shared
   * VerificationTierBadge has no variant for — deliberately, since a rejected
   * report is never displayed as a trust signal. It still has to be *explained*
   * here, because omitting it would misrepresent the model as four-tier.
   */
  badgeTier?: VerificationTier;
  /** Label used when there is no badge. */
  label: string;
  description: string;
}

export const CREDIBILITY_INTRO = {
  eyebrow: 'How we verify',
  heading: 'How SafePass builds and verifies its safety map',
  lead: [
    'A safety map is only worth what its data is worth. This page explains, in public, how SafePass seeds its map before the first journey is ever taken, how it grows from the journeys that follow, and how much weight any single report carries.',
    'Where we publish a figure, we publish where it comes from and the date we last confirmed it. Where we have no figure yet, we say so rather than estimate.',
  ],
} as const;

/** The three-layer cold-start strategy, per docs/SafePass/README.md. */
export const CREDIBILITY_LAYERS: readonly CredibilityLayer[] = [
  {
    id: 'pre-seeding',
    eyebrow: 'Layer 1',
    heading: 'Admin pre-seeding, before launch',
    body: [
      'Before a single public journey is monitored, the map is populated by hand with safety data that already exists in the public record. An empty map is not a neutral starting point for a safety product — it is a misleading one, so the map is seeded first.',
      'Every seeded marker carries its coordinates, a category, a description, a severity level, and the source it came from. The source travels with the marker; it is not discarded once the pin is placed.',
    ],
    points: [
      'Known kidnapping corridors, drawn from public news archives, security advisories, and police reports',
      'Permanent police, military, and FRSC checkpoints',
      'High-risk zones with repeated incident history',
    ],
  },
  {
    id: 'crowdsourcing',
    eyebrow: 'Layer 2',
    heading: 'Crowdsourcing, from day one onward',
    body: [
      'From launch, the map is extended by the people using it. Travellers report what they encounter on the road from the SafePass app, and SafePass administrators add markers for new intelligence, partner-supplied reports, and emerging threats.',
      'Each report records its GPS coordinates, category, timestamp, description, and who filed it. Travellers can also act on markers others have placed — confirming one, flagging it as no longer there, reclassifying a checkpoint, or escalating something that looks wrong.',
    ],
    points: [
      'Reports cover kidnapping, armed robbery, accidents, roadblocks, police checkpoints, fake checkpoints, bad road, vehicle breakdowns, and suspicious activity',
      'Administrators add markers for verified partner reports and emerging threats',
      'Existing markers can be confirmed, disputed, reclassified, or escalated by travellers who pass them',
    ],
  },
  {
    id: 'verification-weighting',
    eyebrow: 'Layer 3',
    heading: 'Verification weighting',
    body: [
      'Not every marker carries the same weight. A single unconfirmed report and an admin-approved one are both useful, but they are not the same claim, and the map does not present them as though they were.',
      'Each marker is classified into one of five tiers, and its tier is visible wherever it appears — in the app and here. Colour is never the only indicator of tier, so the classification is legible regardless of how you see colour.',
    ],
    points: [
      'A report becomes Verified on admin approval, or once five or more travellers independently confirm it',
      'Conflicting reports are marked Disputed and routed to a human for review rather than silently resolved',
      'Reports an administrator rejects as false or malicious are removed from the map entirely',
    ],
  },
];

/** The five tiers, in ascending order of confidence, per the same source. */
export const VERIFICATION_TIERS: readonly VerificationTierExplainer[] = [
  {
    badgeTier: 'unverified',
    label: 'Unverified',
    description:
      'A single report, not yet corroborated. Shown with a caution indicator so it informs without being mistaken for a confirmed fact.',
  },
  {
    badgeTier: 'partially_confirmed',
    label: 'Partially Confirmed',
    description:
      'Between two and four independent traveller confirmations, or an administrator has verified it.',
  },
  {
    badgeTier: 'verified',
    label: 'Verified',
    description:
      'Administrator-approved, or confirmed by five or more travellers. Shown prominently, because this is the tier the map is most confident in.',
  },
  {
    badgeTier: 'disputed',
    label: 'Disputed',
    description:
      'Reports conflict — some travellers confirm it, others say it is not there. Flagged for administrator review rather than resolved automatically.',
  },
  {
    label: 'Rejected',
    description:
      'An administrator has explicitly judged the report false or malicious. Rejected reports are hidden from the map entirely, which is why you will never see this tier on a live marker.',
  },
];

/**
 * Standing note on how this content is kept current.
 *
 * risk_log.md R-007's mitigation requires a stated review cadence, not just
 * dated stats — the site has no CMS (FEAT-016 is deferred), so the commitment
 * has to be visible on the page itself to mean anything.
 */
export const CONTENT_REVIEW_NOTE =
  'This page is reviewed at least quarterly against SafePass product records. Every figure above shows the date it was last confirmed. Where a figure cannot be confirmed as current, we remove it rather than leave it published.';

/** Condensed copy for the preview variant embedded on other pages. */
export const CREDIBILITY_PREVIEW = {
  heading: 'Safety data you can check, not claims you have to take on trust',
  lead: 'SafePass seeds its map from public incident records, grows it from the journeys travellers actually take, and weights every report by how well it is corroborated — across five verification tiers.',
  linkLabel: 'See the full methodology',
  linkHref: '/how-we-verify',
} as const;
