'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { AudienceSelector, NAV_ACTIVE_CHIP } from '@/components/layout/audience-selector';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { AUDIENCE_CONFIG, useAudience } from '@/lib/audience/audience-context';
import { HOME_LINK, PRIMARY_NAV, STATIC_NAV } from '@/lib/content/navigation';
import { ScrollTrigger } from '@/lib/motion/gsap';
import { cn } from '@/lib/utils';

/**
 * Persistent header — FEAT-001.
 *
 * Two variants, per screens.md's Shared Components:
 *  - `showAudienceSelector` (default): Home + Audience Selector + audience-
 *    matched primary CTA + How We Verify / About. Used on the five Creative-tier
 *    pages. (Home was added as an explicit link on client feedback, T-034 —
 *    before the Audience Selector, per screens.md's navigation map.)
 *  - `showAudienceSelector={false}`: logo + STATIC_NAV (Home, the three
 *    audiences as plain links, How We Verify, About), used on Privacy /
 *    Terms / About.
 *
 * The CTA tracks the selected audience in BOTH variants — FEAT-001 requires "a
 * primary CTA button on all pages", and a visitor who identified as Business
 * two pages ago should not be offered an app download on the privacy page. Only
 * the active-state *highlighting* is dropped in the plain variant, which is
 * what screens.md actually scopes out.
 *
 * Two constraints inherited from the Foundation shell, both load-bearing:
 *  - `sticky top-0 z-50` — branding.md Section 2 requires the header stay
 *    legible and never be obscured by scroll-driven hero motion.
 *  - Parallax multiplier 0x (branding.md Section 8, Fixed UI): the header never
 *    drifts with scroll. Do not wrap it in a Parallax layer.
 */
export function Navbar({ showAudienceSelector = true }: { showAudienceSelector?: boolean }) {
  const { audience } = useAudience();
  const cta = AUDIENCE_CONFIG[audience];
  const pathname = usePathname();

  // The plain variant surfaces the audience destinations as ordinary links,
  // since it has no selector to reach them through.
  const desktopLinks = showAudienceSelector ? PRIMARY_NAV : STATIC_NAV;

  // "Is this the page the visitor is on" is always page-scoped: the pathname,
  // never the persisted audience context. The same rule the audience selector
  // was moved to under T-034 (the /how-we-verify-shows-Business bug), applied
  // to every header link. On /privacy and /terms no link matches, so nothing
  // is marked active — as the mission requires.
  const isCurrent = (href: string) => pathname === href;

  /**
   * Shared active treatment for the desktop text links: branding.md §3.5's
   * Active chip tokens (NAV_ACTIVE_CHIP: `primary-light` fill, `primary`
   * border, `text-text-primary`) — the same pairing the audience selector and
   * the drawer's Explore rows use, so the header speaks one active-state
   * language. The transparent border + padding sit on INACTIVE links too so
   * toggling the classes never shifts layout.
   */
  const navLinkClass = (href: string) =>
    cn(
      'inline-flex items-center rounded-md border border-transparent px-md',
      'text-body-small font-semibold transition-colors duration-[var(--duration-normal)] ease-out-smooth',
      isCurrent(href)
        ? NAV_ACTIVE_CHIP
        : floating
          ? 'text-white/80 hover:text-white'
          : 'text-text-secondary hover:text-text-primary'
    );

  /**
   * Only the homepage puts a dark band directly beneath the header — the hero's
   * `gradient-hero` field, which is dark in BOTH colour modes.
   */
  const overHero = pathname === '/';

  const [scrolled, setScrolled] = useState(false);
  // While the mobile nav drawer is open, the header must sit on the frosted
  // (non-floating) material so it reads as anchoring the menu, not as a
  // transparent bar floating over the page behind it.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!overHero) return;

    /**
     * Driven by ScrollTrigger rather than a `scroll` listener, so this still
     * runs on the single Lenis → gsap.ticker loop and adds no second listener.
     * ScrollTrigger also works when Lenis is absent (reduced motion), so the
     * header behaves identically there.
     */
    const trigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top-=8',
      onToggle: (self) => setScrolled(self.isActive),
    });

    return () => trigger.kill();
  }, [overHero]);

  /**
   * FLOATING = sitting over the hero, before the visitor has scrolled.
   *
   * The header used to be an opaque `surface` bar at all times. In dark mode
   * that happened to blend, because `surface` and the hero's field are both
   * near-black. In LIGHT mode it rendered as a hard white slab with a border,
   * cutting a stark horizontal line across the top of the dark hero.
   *
   * Floating removes the fill and the border entirely so the hero's gradient
   * runs unbroken to the top of the viewport — matching in light mode what dark
   * mode already did by coincidence. Once scrolled, the header takes its solid
   * surface and gains `shadow-md`, which is exactly what branding.md §3.4
   * earmarks that token for ("sticky nav on scroll").
   *
   * Text switches to white while floating: over the always-dark hero,
   * `text-text-primary` would be dark slate in light mode — invisible.
   */
  const floating = overHero && !scrolled && !menuOpen;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-all duration-[var(--duration-normal)] ease-out-smooth',
        // `none` (not a missing class) on the floating side so box-shadow and
        // backdrop-filter actually INTERPOLATE to their solid values instead of
        // popping — `none` is a discrete value and cannot be tweened.
        floating
          ? 'border-transparent bg-transparent shadow-none backdrop-blur-none'
          : // Translucent so the content behind reads through, without letting
            // it compromise the header's own legibility.
            'border-border bg-surface/85 shadow-md backdrop-blur-md'
      )}
    >
      {/* Height comes from `--size-header` so the hero's negative offset can
          match it exactly — see hero-stage.tsx. */}
      <Container className="flex h-(--size-header) items-center justify-between gap-md">
        {/* `priority`: the header logo is above the fold on all eight pages, so
            it should not wait behind lazy-loading. */}
        <Logo priority tone={floating ? 'onDark' : 'default'} />

        {/* Desktop and tablet. Hidden below the tablet breakpoint, where the
            drawer takes over — branding.md Section 8 keeps tablet on the full
            creative experience, so the split sits at `md`. */}
        <div className="hidden items-center gap-md md:flex">
          {/* Home FIRST, before the Audience Selector (client feedback, T-034):
              the logo links here but visitors did not know to click it. Only
              the selector variant needs it outside `<nav>` — the static
              variant's STATIC_NAV already leads with Home. */}
          {showAudienceSelector && (
            <Link href={HOME_LINK.href} aria-current={isCurrent(HOME_LINK.href) ? 'page' : undefined} className={navLinkClass(HOME_LINK.href)}>
              {HOME_LINK.label}
            </Link>
          )}

          {showAudienceSelector && <AudienceSelector />}

          <nav aria-label="Site" className="flex items-center gap-md">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent(link.href) ? 'page' : undefined}
                className={navLinkClass(link.href)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <ButtonLink href={cta.href}>{cta.ctaLabel}</ButtonLink>
        </div>

        <MobileNavDrawer
          showAudienceSelector={showAudienceSelector}
          onDark={floating}
          onOpenChange={setMenuOpen}
        />
      </Container>
    </header>
  );
}
