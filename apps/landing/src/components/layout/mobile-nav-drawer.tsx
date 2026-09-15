'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { AUDIENCE_CONFIG, PATH_TO_AUDIENCE, useAudience } from '@/lib/audience/audience-context';
import { durationMs } from '@/lib/motion/constants';
import { SITE_NAV } from '@/lib/content/navigation';
import { cn } from '@/lib/utils';

/**
 * Mobile nav drawer — FEAT-001's "collapses into a mobile nav drawer below the
 * tablet breakpoint" criterion, unified in T-037.
 *
 * T-037: the drawer presents the SAME six links as the desktop header in ONE
 * consistent list, with the same URL-derived active states. The old split (an
 * "I'm travelling as" audience section separate from an "Explore" section,
 * with a `showAudienceSelector` variant on legal pages) reproduced the desktop
 * header's two-treatment problem; it is gone. One list, one treatment, one
 * active rule — `pathname === link.href` — shared with navbar.tsx.
 *
 * The active treatment is the header's underline, moved to the row: a 2px
 * `primary` bar along the row's left edge plus `aria-current="page"`. Colour
 * is not the only signal (branding.md §4).
 *
 * Breakpoint is `md` (768px): branding.md Section 8 keeps the full creative
 * experience at tablet, so the drawer is a below-tablet affordance only.
 * Elevation is `shadow-lg`, per screens.md's Shared Components note pointing at
 * branding.md Section 3.4 (mobile nav drawer sits in the same elevation class
 * as modals and the lead-capture panel).
 *
 * The drawer is a modal surface, so it carries the full modal contract:
 * `aria-modal`, a focus trap, Escape to dismiss, focus returned to the trigger
 * on close, and `aria-expanded` on the trigger. None of this is optional —
 * branding.md Section 4 treats keyboard operability and never-removed focus
 * indicators as hard requirements.
 */

/** Interactive descendants, in DOM order, for the focus trap. */
function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function MobileNavDrawer({
  /**
   * True while the header is floating over the dark hero. The trigger icon then
   * has to be white — `text-text-primary` is dark slate in light mode and would
   * vanish against the hero.
   */
  onDark = false,
  /**
   * Fired whenever the drawer opens or closes, so the header can take its
   * frosted (non-floating) material while the menu is open.
   */
  onOpenChange,
}: {
  onDark?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();

  /**
   * Open state is stored as "the route the drawer was opened on", so that
   * navigating anywhere closes it as a derived consequence rather than through
   * an effect that syncs one piece of React state to another. Tapping a link in
   * the drawer must not leave the overlay up over the page it just navigated
   * to, and an effect doing `setOpen(false)` on pathname change is a cascading
   * render the lint rule correctly rejects.
   */
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const open = openedOnPath !== null && openedOnPath === pathname;

  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { audience } = useAudience();

  /**
   * CTA resolution — same rule as the desktop header: the pathname wins when it
   * names an audience; the stored session audience covers pages it doesn't.
   */
  const cta = AUDIENCE_CONFIG[PATH_TO_AUDIENCE[pathname] ?? audience];

  const [exiting, setExiting] = useState(false);
  const [shown, setShown] = useState(false);
  /**
   * Enter/exit choreography state.
   *
   * `exiting` keeps the portal mounted through the exit animation so the panel
   * can fade/slide OUT. It starts in the close() EVENT (synchronous setState
   * in an event handler is fine — it is effect bodies the lint rule forbids),
   * and an effect below schedules the unmount only once the exit transition
   * window (duration-normal) has elapsed. A `shown` timer does the reveal: the
   * hidden state paints first, so the enter transition runs rather than
   * jumping.
   *
   * The portal is mounted by DERIVING it in render (`open || exiting`), never
   * from an effect-timer: mount is synchronous with the open event's commit,
   * so the focus effect below is flushed in the same act boundary as the
   * click. The earlier `setTimeout`-mounted portal left the focus effect racing
   * the portal and broke the "focus moves into the panel" behaviour — this is
   * the T-022 regression this structure addresses.
   */
  /** Deferred-only mirror of `open`, used to route closes without an event (browser back/forward) through the same exit choreography. Ref-writes, not setState. */
  const wasOpenRef = useRef(false);

  // close is the BEGIN of the exit choreography, not merely clearing intent:
  // collapse the panel first (starts the fade/slide OUT), keep the portal
  // mounted, and let the unmount effect tear it down after the transition.
  const close = useCallback(() => {
    if (!open) return;
    setOpenedOnPath(null); // clear the open intent
    setShown(false); // collapse the panel to its hidden transform
    setExiting(true); // keep the portal mounted through the exit animation
  }, [open]);

  // Opening cancels an in-flight exit (rapid re-tap) and re-uses the panel;
  // the reveal effect below re-runs on `open` and re-animates the enter.
  const openNow = useCallback(() => {
    if (exiting) setExiting(false);
    setOpenedOnPath(pathname);
  }, [exiting, pathname]);

  // Close EVENTS set the exit state synchronously; back/forward closes (no
  // event) arrive here instead, and the deferred write routes them through the
  // exact same exit path so both behave identically.
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (open) {
      // Reveal on the next tick after the portal mount so the hidden state
      // paints first; a same-tick class swap is a jump, not a transition.
      const timer = window.setTimeout(() => setShown(true), 0);
      return () => window.clearTimeout(timer);
    }

    if (!wasOpen) return;

    const timer = window.setTimeout(() => {
      setExiting(true);
      setShown(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Unmount the portal only after the exit animation has finished — the
  // window matches the CSS transition (duration-normal).
  useEffect(() => {
    if (!exiting) return;

    const timer = window.setTimeout(() => setExiting(false), durationMs('normal'));
    return () => window.clearTimeout(timer);
  }, [exiting]);

  // Keep the header informed of the open state so it can switch to the frosted
  // material for the duration of the overlay (see navbar.tsx). Fired on every
  // open/close, including the close-by-navigation path.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Focus management + Escape + focus trap, scoped to the PRESENT lifecycle
  // (`open || exiting`) so it stays in force through the exit animation (the
  // panel is still on screen while it animates out and can re-enter).
  const present = open || exiting;

  useEffect(() => {
    if (!present) return;

    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel) return;

    focusableWithin(panel)[0]?.focus();

    // Lenis owns the scroll position; locking the body is what keeps the page
    // behind the overlay from scrolling under a touch drag.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = focusableWithin(panel);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap in both directions so focus can never escape to the page behind
      // the overlay while it is open.
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus to the trigger keeps a keyboard user's place in the
      // header rather than dumping them at the top of the document.
      trigger?.focus();
    };
  }, [present, close]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openNow())}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        // Sized to `button-height` rather than the bare 44px a11y floor: it is
        // the only tap target in the mobile header, and it is a token.
        className={cn(
          'inline-flex size-(--size-button-height) items-center justify-center rounded-md',
          'transition-colors duration-[var(--duration-normal)] ease-out-smooth',
          // While open the panel covers the hero, so the icon sits on the solid
          // panel surface and must use the normal token even when floating.
          onDark && !open
            ? 'text-white hover:bg-white/10'
            : 'text-text-primary hover:bg-surface-secondary'
        )}
      >
        {open ? (
          <X aria-hidden="true" className="size-(--size-icon-md)" />
        ) : (
          <Menu aria-hidden="true" className="size-(--size-icon-md)" />
        )}
      </button>

      {/*
        PORTALLED TO `document.body`, and that is load-bearing rather than
        tidiness.

        The header carries `backdrop-blur-md`, and an ancestor with a
        `backdrop-filter` becomes the CONTAINING BLOCK for `position: fixed`
        descendants. Rendered in place, this overlay resolved its `inset` against
        the 64px-tall header instead of the viewport: `bottom-0` and
        `max-h-full` collapsed the panel to roughly zero height, so tapping the
        hamburger opened an invisible sliver and the mobile menu simply did not
        work. The scrim vanished for the same reason.

        A portal moves the overlay outside every filtered ancestor, so `fixed`
        means fixed to the viewport again. Do not inline this back into the
        header.
      */}
      {present &&
        createPortal(
          <>
            {/* Scrim. Decorative and pointer-only — Escape and the close button
                are the keyboard paths out, so it carries no role. Fades in/out
                with the panel. */}
            <div
              aria-hidden="true"
              onClick={close}
              className={cn(
                'fixed inset-x-0 bottom-0 top-(--size-header) z-40 bg-ink/60',
                'transition-opacity duration-[var(--duration-normal)] ease-out-smooth',
                shown ? 'opacity-100' : 'pointer-events-none opacity-0'
              )}
            />

            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              className={cn(
                // Bounded by the viewport below the header so a short landscape
                // screen scrolls the panel rather than clipping the CTA off it.
                'fixed inset-x-0 bottom-0 top-(--size-header) z-50 h-fit max-h-[calc(100svh-var(--size-header))] overflow-y-auto',
                'border-b border-border bg-surface/85 shadow-lg backdrop-blur-md',
                'flex flex-col gap-lg p-lg',
                // Enter/exit: fade + a gentle slide in from above, on the
                // duration-normal / ease-out-smooth tokens (branding §6).
                'transition-all duration-[var(--duration-normal)] ease-out-smooth',
                shown
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none -translate-y-2 opacity-0'
              )}
            >
              {/*
                THE nav — the same six links the desktop header renders, from
                the same SITE_NAV list, in one section (T-037). No separate
                audience group, no variant for legal pages.
              */}
              <nav aria-label="Site" className="flex flex-col gap-xs">
                <h2 className="px-sm text-caption uppercase tracking-wide text-text-secondary">
                  Menu
                </h2>

                {SITE_NAV.map((link) => {
                  // Same active rule as the desktop header: pathname equality,
                  // never the persisted audience context.
                  const isActive = pathname === link.href;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={close}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-(--size-button-height) items-center rounded-sm px-md text-body font-semibold',
                        'transition-colors duration-[var(--duration-fast)] ease-in-out-spring',
                        // The header's 2px accent underline, as a row's left
                        // edge: `primary` when active, transparent rail when
                        // not so the state never shifts layout. On the active
                        // row the fill is `primary-light` — branding.md §3.5's
                        // Active pairing — with `text-text-primary` because
                        // blue-on-primary-light is 2.45:1 in light mode (see
                        // button.tsx's secondary variant for the same maths).
                        'before:absolute before:inset-y-(--spacing-sm) before:left-0 before:w-[2px] before:rounded-full before:bg-primary',
                        isActive
                          ? 'bg-primary-light text-text-primary before:opacity-100'
                          : 'text-text-primary before:opacity-0 hover:bg-surface-secondary'
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              {/* The single converting action, identical to the desktop CTA:
                  the drawer is a menu, not a second pitch. */}
              <ButtonLink
                href={cta.href}
                className="w-full border-t border-border"
                onClick={close}
              >
                {cta.ctaLabel}
              </ButtonLink>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
