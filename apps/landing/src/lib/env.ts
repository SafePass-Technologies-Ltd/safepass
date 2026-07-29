import { z } from 'zod';

/**
 * Environment configuration, validated with Zod.
 *
 * Split into two schemas because Next.js inlines `NEXT_PUBLIC_*` values into
 * the client bundle at build time: anything in `serverEnv` must never be
 * referenced from a client component, or the secret ships to the browser.
 * `LEAD_INTAKE_API_KEY` in particular is why this split is enforced rather
 * than left to discipline.
 */

// -----------------------------------------------------------------------------
// Client-safe
// -----------------------------------------------------------------------------

const clientEnvSchema = z.object({
  /** Canonical origin, used for metadata, sitemap, and Open Graph URLs. */
  siteUrl: z.string().url().default('http://localhost:3004'),
  /** App Store listing (FEAT-007). Placeholder until the app is published. */
  iosAppUrl: z.string().default('https://apps.apple.com/app/safepass'),
  /** Play Store listing (FEAT-007). */
  androidAppUrl: z
    .string()
    .default('https://play.google.com/store/apps/details?id=com.safepass.app'),
  /**
   * Whether the app is live and downloadable.
   *
   * When false, the App Store CTA is replaced by the waitlist prompt — this is
   * user_flow.md Flow 1's Alternate Path B ("Market/Segment Not Yet Live").
   * An env flag rather than geo-IP because no doc specifies a detection
   * mechanism, and inventing one would be inventing a requirement.
   */
  appLive: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  /**
   * Fallback contact shown in the form Submission Error state.
   *
   * Required by user_flow.md's Global Flow on error recovery: a dropped lead
   * is direct revenue loss (R-004), so the visitor is never left with no path
   * forward when automated delivery fails.
   */
  fallbackContactEmail: z.string().email().default('hello@safepass-tech.com'),
});

export const clientEnv = clientEnvSchema.parse({
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  iosAppUrl: process.env.NEXT_PUBLIC_IOS_APP_URL,
  androidAppUrl: process.env.NEXT_PUBLIC_ANDROID_APP_URL,
  appLive: process.env.NEXT_PUBLIC_APP_LIVE,
  fallbackContactEmail: process.env.NEXT_PUBLIC_FALLBACK_CONTACT_EMAIL,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

// -----------------------------------------------------------------------------
// Server-only
// -----------------------------------------------------------------------------

const serverEnvSchema = z.object({
  /** SafePass Backend lead intake endpoint. */
  leadIntakeUrl: z.string().url().default('http://localhost:3000/v1/leads'),
  /** Service key for the call above. Never NEXT_PUBLIC_ — see module doc. */
  leadIntakeApiKey: z.string().optional(),
  /** Milliseconds before the forward call is abandoned. */
  leadIntakeTimeoutMs: z.coerce.number().int().positive().default(8000),
});

/**
 * Lazily resolved so importing this module from a client component doesn't
 * throw — the values are only read inside the route handler.
 */
export function getServerEnv() {
  return serverEnvSchema.parse({
    leadIntakeUrl: process.env.LEAD_INTAKE_URL,
    leadIntakeApiKey: process.env.LEAD_INTAKE_API_KEY,
    leadIntakeTimeoutMs: process.env.LEAD_INTAKE_TIMEOUT_MS,
  });
}
