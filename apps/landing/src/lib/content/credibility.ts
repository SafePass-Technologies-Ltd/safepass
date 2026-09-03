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
    'A safety map is only worth what its data is worth. Transparency matters. This page explains exactly how SafePass builds its safety map, where information comes from, how reports are verified, and how every marker earns its level of confidence.',
    'Where we publish a figure, we publish where it comes from and the date we last confirmed it. Where data is not yet available, we say so rather than estimate or speculate.',
  ],
} as const;

/** The three-layer cold-start strategy, per docs/SafePass/README.md. */
export const CREDIBILITY_LAYERS: readonly CredibilityLayer[] = [
  {
    id: 'pre-seeding',
    eyebrow: 'Layer 1',
    heading: 'Analyst curation, before launch',
    body: [
      'Before a single public journey is monitored, SafePass analysts curate the map using publicly available security information and verified institutional sources. An empty map is not a neutral starting point for a safety product. It is a misleading one, so the map is built first.',
      'Every curated marker carries its coordinates, a category, a description, a severity level, and the source it came from. The source travels with the marker; it is not discarded once the pin is placed.',
    ],
    points: [
      'Areas with repeated publicly reported kidnapping incidents',
      'Known official police, military, and FRSC checkpoints, where publicly verifiable',
      'High-risk zones with repeated incident history',
    ],
  },
  {
    id: 'crowdsourcing',
    eyebrow: 'Layer 2',
    heading: 'Crowdsourcing, from day one onward',
    body: [
      'From launch, the map is extended by the people using it. Travellers can report incidents they personally observe during monitored journeys, and SafePass administrators add markers for new intelligence, partner-supplied reports, and emerging threats.',
      'Each report records its GPS coordinates, category, timestamp, description, and who filed it. Travellers can also act on markers others have placed: confirming one, flagging it as no longer there, reclassifying a checkpoint, or escalating something that looks wrong.',
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
    heading: 'Confidence scoring',
    body: [
      'Not every marker carries the same weight. A single unconfirmed report and an admin-approved one are both useful, but they are not the same claim, and the map does not present them as though they were.',
      'Each marker is classified into one of five confidence levels, and its level is visible wherever it appears, in the app and here. Colour is never the only indicator of confidence, so the classification is legible regardless of how you see colour.',
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
      'Reported by one traveller but not yet independently confirmed. Displayed with a caution indicator so it informs without being mistaken for a confirmed fact.',
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
      'Confirmed by SafePass administrators, or independently corroborated by five or more travellers. Shown prominently, because this is the confidence level the map most trusts.',
  },
  {
    badgeTier: 'disputed',
    label: 'Disputed',
    description:
      'Reports conflict. Some travellers confirm it, others say it is not there. Flagged for administrator review rather than resolved automatically.',
  },
  {
    label: 'Rejected',
    description:
      'Determined to be false, duplicated, malicious, or otherwise unreliable after review. Hidden from the public map, which is why you will never see this confidence level on a live marker.',
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

/**
 * "How quickly information changes" — a disclaimer section added from client
 * feedback. Safety conditions can change rapidly; SafePass cannot guarantee real
 * time, so the page states plainly that markers move and that users must stay
 * alert. Legal protection and trust in one block.
 */
export const INFORMATION_CHANGES = {
  eyebrow: 'Stay alert',
  heading: 'How quickly information changes',
  body: [
    'Safety conditions can change rapidly. While SafePass works to keep information current through traveller reports, administrator review, and trusted public sources, users should always remain alert and exercise personal judgement.',
    'Markers may be updated, downgraded, or removed whenever new evidence becomes available.',
  ],
} as const;

/**
 * "Our sources" — a transparency list from client feedback. Naming the sources
 * answers the "where does this come from" question in the opening paragraph
 * with a concrete list, without inventing any figure. These are source *types*,
 * not quantities, so nothing here needs a source or an as-of date (R-007).
 */
export const SOURCES = {
  eyebrow: 'Our sources',
  heading: 'Where the information comes from',
  lead: 'SafePass draws on a mix of public, institutional, and in-house sources.',
  items: [
    'Nigerian Police Force public statements',
    'FRSC advisories',
    'NEMA',
    'Publicly reported news',
    'Verified partner organisations',
    'SafePass Monitoring Centre',
    'Traveller reports',
    'Emergency service information',
    'Community intelligence',
  ],
} as const;

/** Condensed copy for the preview variant embedded on other pages. */
export const CREDIBILITY_PREVIEW = {
  heading: 'Safety data you can check, not claims you have to take on trust',
  lead: 'SafePass builds its safety map from public incident records, grows it from the journeys travellers actually take, and weights every report by how well it is corroborated across five verification tiers.',
  linkLabel: 'See the full methodology',
  linkHref: '/how-we-verify',
} as const;
