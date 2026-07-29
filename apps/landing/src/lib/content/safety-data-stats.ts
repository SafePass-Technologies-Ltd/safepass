import { SafetyDataStatSchema, type SafetyDataStat } from '@safepass/shared';

/**
 * Published safety-data stat call-outs — FEAT-005, `schema.md`'s `SafetyDataStat`.
 *
 * PLAIN MODULE, deliberately: the Credibility page is a Server Component and
 * importing a value out of a `'use client'` module would hand it a proxy at
 * prerender time. Nothing in this file may ever gain a `'use client'` directive.
 *
 * ---
 * WHAT MAY BE PUBLISHED HERE
 *
 * FEAT-005 exists to replace marketing claims with verifiable ones, and
 * risk_log.md R-007 scores content staleness as High precisely because a stat
 * that quietly goes stale contradicts the exact claim it was published to
 * prove. So the bar for adding an entry is: the figure is stated in a SafePass
 * product document, and a reader could be pointed at where it comes from.
 *
 * Every stat below is a *methodology or pricing* fact drawn from
 * `docs/SafePass/README.md` (Cold-Start Strategy, Layer 3) and
 * `docs/SafePass/monetization.md`. None is an operational metric.
 *
 * DELIBERATELY ABSENT — SafePass has published no operational data yet, and a
 * plausible-looking placeholder on this page in particular would be worse than
 * an omission, because the page's whole argument is that its numbers are real:
 *   - corridor / route coverage counts
 *   - incidents reported, confirmed, or resolved
 *   - monitoring-officer response times
 *   - safe-arrival rates
 *   - registered users, monitored journeys, partner fleets
 * Add these only when a real, dated figure exists — never as illustrative
 * placeholders.
 */

/**
 * The date the figures below were last confirmed against the SafePass product
 * docs. Rendered visibly next to every stat, per R-007's mitigation, so
 * staleness is apparent to a reader rather than silently assumed.
 *
 * Bump this only after actually re-checking the sources.
 */
export const STATS_REVIEWED_ON = '2026-07-27';

const RAW_STATS: SafetyDataStat[] = [
  {
    statId: 'verification-tiers',
    label: 'Verification tiers every safety marker is classified into',
    value: '5',
    verificationTier: 'verified',
    source:
      'SafePass incident-verification model — Unverified, Partially Confirmed, Verified, Disputed, Rejected',
    asOfDate: STATS_REVIEWED_ON,
  },
  {
    statId: 'confirmations-to-verified',
    label: 'Independent user confirmations that promote a report to Verified',
    value: '5+',
    verificationTier: 'verified',
    source:
      'SafePass verification weighting rules — a report reaches Verified at 5 or more user confirmations, or on admin approval',
    asOfDate: STATS_REVIEWED_ON,
  },
  {
    statId: 'journey-fee',
    label: 'Cost of a monitored journey',
    value: '₦2,000',
    verificationTier: 'verified',
    source: 'SafePass published pricing — charged per monitored journey, deducted from the wallet',
    asOfDate: STATS_REVIEWED_ON,
  },
  {
    statId: 'wallet-minimum',
    label: 'Minimum wallet top-up',
    value: '₦2,000',
    verificationTier: 'verified',
    source: 'SafePass published pricing — minimum wallet funding amount',
    asOfDate: STATS_REVIEWED_ON,
  },
];

/**
 * Validated at module load rather than trusted.
 *
 * `source` and `asOfDate` are required by the schema, so an unsourced or
 * undated stat cannot be shipped: it fails the build's first render instead of
 * quietly appearing on the page. That is the point of parsing here rather than
 * just exporting the literal.
 */
export const SAFETY_DATA_STATS: readonly SafetyDataStat[] = RAW_STATS.map((stat) =>
  SafetyDataStatSchema.parse(stat)
);

/** The stat the Homepage / audience-page preview surfaces. */
export const PREVIEW_STAT_ID = 'confirmations-to-verified';

export function getStat(statId: string): SafetyDataStat {
  const stat = SAFETY_DATA_STATS.find((candidate) => candidate.statId === statId);
  if (!stat) throw new Error(`Unknown safety data stat: ${statId}`);
  return stat;
}
