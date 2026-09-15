import { z } from 'zod';

/**
 * A single sourced, dated statistic published on SafePassLanding's
 * Credibility & Safety-Data content (`docs/SafePassLanding/screens/05-how-we-verify.md`).
 *
 * `source` and `asOfDate` are REQUIRED, not decorative. risk_log.md
 * scores content staleness as a High risk precisely because the site's claim
 * is "live, verified data" — a stat that quietly goes stale contradicts the
 * exact thing it is published to prove. Making both fields non-optional means
 * an unsourced or undated stat cannot be added without the type system
 * rejecting it, rather than relying on an author to remember the convention.
 *
 * This is content data, not user-submitted data: it is rendered directly from
 * `lib/content/` and is never forwarded anywhere.
 */

/**
 * Verification tiers, matching the core product's incident-verification model
 * so the marketing site and the app describe trust in identical terms.
 *
 * Note this omits `rejected`, which exists in the core product's
 * `VerificationStatusEnum` (see `incident.schema.ts`) -- only four tiers are
 * published, since a rejected report is not something the site would ever
 * publish as a stat.
 */
export const VerificationTierEnum = z.enum([
  'unverified',
  'partially_confirmed',
  'verified',
  'disputed',
]);

export const SafetyDataStatSchema = z.object({
  /** Stable ID so the same stat can be referenced from both the homepage preview and the full credibility page without drifting. */
  statId: z.string().min(1),
  /** Short human-readable label, e.g. 'Verified corridors mapped'. */
  label: z.string().min(1),
  /**
   * Displayed value kept as a *string*, not a number, to preserve exact
   * formatting ('120+', '₦2,000') for the monospace `stat` type token.
   */
  value: z.string().min(1),
  verificationTier: VerificationTierEnum,
  /** Citation, so the figure is never published as an unverifiable marketing claim. */
  source: z.string().min(1),
  /** Date the figure was last confirmed accurate; rendered visibly so staleness is apparent. */
  asOfDate: z.string().date(),
});

export type VerificationTier = z.infer<typeof VerificationTierEnum>;
export type SafetyDataStat = z.infer<typeof SafetyDataStatSchema>;
