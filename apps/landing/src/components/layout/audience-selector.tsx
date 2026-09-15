'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAudience } from '@/lib/audience/audience-context';
import { AUDIENCE_NAV } from '@/lib/content/navigation';
import { cn } from '@/lib/utils';

/**
 * Audience Selector — FEAT-001's core mechanism.
 *
 * This is the site's information architecture, not a decorative toggle: it is
 * the named mitigation for R-001 (one site diluting messaging across three
 * buyer types) and R-002 (a visitor bouncing before finding the CTA meant for
 * them), which is why risk_log.md requires it visible above the fold on every
 * entry page.
 *
 * WHY LINKS, NOT BUTTONS/TABS
 * Each option is a real navigation to that audience's dedicated page
 * (screens.md's navigation map: Home --> Individual/Corporate/Transport), so an
 * anchor is the correct element. That also buys three things a button-based
 * "tablist" would have to reimplement badly: native keyboard operation, a
 * shareable URL for the deep-link behaviour user_flow.md's Global Flow depends
 * on, and crawlability of all three audience paths.
 *
 * Selection state is written on click as well, so the choice persists across
 * navigation away from the audience pages (e.g. onward to /how-we-verify) and
 * keeps driving the header CTA — that part is session CONTEXT, not page state.
 *
 * The VISUAL highlight, however, is PAGE-SCOPED (T-034): an option is marked
 * active only when the current pathname IS that audience's page. Earlier this
 * derived from the persisted context, which kept the last-clicked chip lit on
 * every later page — /how-we-verify presented "Business" as if the visitor were
 * on /business. On /how-we-verify, /about, /privacy, /terms, and the homepage
 * no chip carries the active state.
 *
 * Styling comes from branding.md Section 3.5's Audience Selector table
 * (Inactive / Active / Hover) — no other component in this app uses that
 * three-state treatment.
 */

const OPTION_BASE = cn(
  'inline-flex items-center justify-center rounded-md px-md',
  // `button-height` (48px) clears branding.md Section 4's 44px touch-target
  // floor and keeps the options optically aligned with the header CTA beside
  // them. Token, not a literal.
  'min-h-(--size-button-height) text-body-small font-semibold',
  'border transition-colors duration-[var(--duration-fast)] ease-in-out-spring'
);

const INACTIVE =
  'bg-surface-secondary text-text-secondary border-border hover:bg-surface-elevated hover:text-text-primary';
// `text-text-primary`, not `text-primary`: blue on `primary-light` is only
// 2.45:1 in light mode, below the 4.5:1 branding.md §4 commits to. This pairing
// passes both modes (12.91:1 / 11.53:1). The `primary` border and fill still
// carry the selected state visually, and `aria-current` carries it
// non-visually, so nothing is lost but the failing contrast.
const ACTIVE = 'bg-primary-light text-text-primary border-primary';

/**
 * branding.md §3.5's Active treatment, exported for the desktop nav links and
 * the drawer's Explore rows (T-034) so every header active state uses the SAME
 * token pairing — `primary-light` fill, `primary` border, `text-text-primary`
 * (the contrast-safe pairing noted above) — and no call site has to restate it.
 */
export const NAV_ACTIVE_CHIP = ACTIVE;

export function AudienceSelector({ className }: { className?: string }) {
  const { setAudience } = useAudience();
  const pathname = usePathname();

  // Page-scoped highlight: an option is current only while the visitor IS on
  // that audience's page. The persisted audience context is still written on
  // click (via setAudience) and still drives the header CTA elsewhere — only
  // the highlight is URL-derived, matching the drawer's audience rows and the
  // desktop nav links' active treatments.
  return (
    <nav
      aria-label="Choose your audience"
      className={cn('flex items-center gap-xs rounded-md p-xs shadow-md', className)}
    >
      {AUDIENCE_NAV.map((option) => {
        const isActive = pathname === option.href;

        return (
          <Link
            key={option.audience}
            href={option.href}
            onClick={() => setAudience(option.audience)}
            // aria-current is what conveys the active state to a screen reader.
            // branding.md Section 4's colour-independence rule applies here as
            // much as to the verification badges: the primary-light fill must
            // not be the only signal that an option is selected.
            aria-current={isActive ? 'page' : undefined}
            className={cn(OPTION_BASE, isActive ? ACTIVE : INACTIVE)}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
