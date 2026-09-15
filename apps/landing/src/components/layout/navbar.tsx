'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { AUDIENCE_CONFIG, PATH_TO_AUDIENCE, useAudience } from '@/lib/audience/audience-context';
import { SITE_NAV } from '@/lib/content/navigation';
import { ScrollTrigger } from '@/lib/motion/gsap';
import { cn } from '@/lib/utils';

/**
 * Persistent header — FEAT-001, redesigned as ONE navbar in T-037.
 *
 * ─── WHY THE NAVIGATION IS URL-NATIVE (T-037 justification) ─────────────────
 *
 * The browser already provides navigation. Every item in the row below is a
 * real `<Link>` with a real href: middle-click and long-press work, deep links
 * resolve, crawlers see the whole site, and keyboard focus follows DOM order
 * with no roving tabindex to reimplement. There is no onClick navigation, no
 * router.push, and no "current page" state variable — the active item is
 * DERIVED during render from `usePathname()` (DELIVERY.md D-011). The URL is
 * the single source of truth for where the visitor is; any state that mirrored
 * it would be a second source that could disagree (the T-034 bug, where a
 * persisted audience choice kept "Business" lit on /how-we-verify).
 *
 * Consequences, all intended:
 *  - On /privacy and /terms no item matches, so nothing is highlighted.
 *  - Exactly one item can ever carry aria-current="page".
 *  - The header renders identically on every page — the old two-variant
 *    split (`showAudienceSelector` true/false) and its chip AudienceSelector
 *    are gone; Privacy / Terms / About get the exact same row.
 *
 * The ONLY client state here is the audience context (sessionStorage) — see
 * audience-context.tsx for why that exists: it keeps the header CTA
 * audience-matched on pages whose URL carries no audience. On pages whose URL
 * DOES name an audience, the CTA follows the pathname directly, so a deep
 * link always shows the right CTA regardless of stored state.
 *
 * Visual treatment — all six links are one ghost group with a 2px `primary`
 * underline on the active item (branding.md §6 earmarks an accent underline as
 * a cheap, clean active indicator; the craft rule is one confident accent).
 * Transparent padding and an always-present underline rail sit on INACTIVE
 * links too, so toggling the classes never shifts layout. The group is
 * deliberately quiet so the primary CTA — the only filled element in the
 * header — stays the visual endpoint.
 *
 * Load-bearing constraints inherited from the Foundation shell:
 *  - `sticky top-0 z-50` — branding.md Section 2 requires the header stay
 *    legible and never be obscured by scroll-driven hero motion.
 *  - Parallax multiplier 0x (branding.md Section 8, Fixed UI): the header never
 *    drifts with scroll. Do not wrap it in a Parallax layer.
 */
export function Navbar() {
  const { audience } = useAudience();
  const pathname = usePathname();

  /**
   * CTA resolution: the URL wins when it names an audience; the stored session
   * audience covers the pages it doesn't. Derived in render — no effect, no
   * sync frame where a deep-linked page shows the wrong CTA.
   */
  const cta = AUDIENCE_CONFIG[PATH_TO_AUDIENCE[pathname] ?? audience];

  // "Is this the page the visitor is on" is pathname equality — never the
  // persisted audience context. The same page-scoped rule T-034 applied to the
  // selector, extended to every link. On /privacy and /terms nothing matches.
  const isCurrent = (href: string) => pathname === href;

  /**
   * Shared treatment for all six links: same size, shape, hover, and active
   * indicator. `after:` is the 2px accent underline rail; inactive links keep
   * it transparent so the active state never shifts layout. Hover and active
   * swap only text colour — the underline's `primary` carries the accent.
   */
  const navLinkClass = (href: string) =>
    cn(
      'relative inline-flex h-(--size-button-height) items-center rounded-sm px-md',
      'text-body-small font-semibold transition-colors duration-[var(--duration-normal)] ease-out-smooth',
      "after:absolute after:inset-x-md after:bottom-(--spacing-sm) after:h-[2px] after:rounded-full after:bg-primary after:transition-opacity after:duration-[var(--duration-normal)] after:ease-out-smooth",
      isCurrent(href)
        ? 'text-text-primary after:opacity-100'
        : 'text-text-secondary after:opacity-0 hover:text-text-primary hover:after:opacity-100'
    );

  /**
   * Floating links sit over the homepage hero, which is dark in BOTH modes —
   * `text-text-secondary` is dark slate in light mode and would vanish. White
   * at opacity keeps the hierarchy (secondary < primary) on the dark field.
   */
  const navLinkClassFloating = (href: string) =>
    cn(navLinkClass(href), !isCurrent(href) && 'text-white/80 after:bg-white hover:text-white');

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
        <div className="hidden items-center gap-lg md:flex">
          {/*
            ONE nav, ONE treatment. All six links render from SITE_NAV in the
            same order screens.md's Navigation Shell specifies; the audience
            destinations are plain links exactly like the others (T-037).
          */}
          <nav aria-label="Site" className="flex items-center gap-xs">
            {SITE_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent(link.href) ? 'page' : undefined}
                className={floating ? navLinkClassFloating(link.href) : navLinkClass(link.href)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* The single filled element in the header — everything to its left
              is quiet by design, so the CTA reads as the row's endpoint. */}
          <ButtonLink href={cta.href}>{cta.ctaLabel}</ButtonLink>
        </div>

        <MobileNavDrawer onDark={floating} onOpenChange={setMenuOpen} />
      </Container>
    </header>
  );
}
