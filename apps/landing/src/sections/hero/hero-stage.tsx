'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from '@/lib/motion/gsap';
import { PARALLAX, durationSec, gsapEase } from '@/lib/motion/constants';
import { useMotionProfile } from '@/lib/motion/use-reduced-motion';
import { RouteLineCanvas } from '@/components/motion/route-line-canvas';
import { RadarSweepCanvas } from '@/components/motion/radar-sweep-canvas';

/**
 * The hero's motion shell — FEAT-003.
 *
 * Owns the three z-space layers from branding.md §8 (background 0.2x, midground
 * 0.5x, content 1.0x) and the desktop pin sequence. It takes the hero's actual
 * copy as `children` from a Server Component, which is the important structural
 * point: the headline, the sentence, and the CTAs are server-rendered and
 * present in the DOM before this file's JavaScript exists. Nothing meaningful
 * is ever injected by an animation.
 *
 * THREE PROFILES, per branding.md §8's Adaptation Strategy:
 *
 * - **Reduced motion** — nothing runs. The markup's own CSS is the composed
 *   state, so there is no `from` state to clear and no flash to avoid. Hard
 *   requirement, not an enhancement.
 * - **Mobile** — no pin, no parallax, no scrub. A single compressed reveal on
 *   load, matching Amaka's skim-and-decide session (user_personas.md) and
 *   Flow 1 step 2.
 * - **Desktop full motion** — pins for 150% of viewport height (the only pin on
 *   the site) with the route-line traced across it and the background drifting
 *   at 0.2x.
 *
 * The headline's masked line-wipe plays ONCE ON LOAD rather than being scrubbed
 * into the pin. `screens/01-homepage.md` describes it firing "at 10% scroll
 * progress into the pin", but a scrubbed wipe is by definition invisible at
 * scroll progress 0 — which would break FEAT-003's first acceptance criterion
 * ("headline and one-sentence explanation are visible without scrolling").
 * The scroll-INDEXED requirement is honoured where branding.md §6 actually
 * assigns it: the route-line traversal and the parallax layers. Reported as a
 * docs contradiction.
 */

/**
 * Pin length getter — branding.md §6's 150% of viewport height.
 *
 * Declared at module scope rather than inline so its identity is stable across
 * renders: passed as a prop it is an effect dependency, and a fresh closure on
 * every render would tear down and rebuild the route-line's ScrollTrigger
 * continuously.
 */
// (The pin length now lives in CSS as `--hero-pin-vh` / `.hero-track`, since
// the hold is done with `position: sticky` rather than a ScrollTrigger pin.)

export function HeroStage({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const midgroundRef = useRef<HTMLDivElement>(null);
  const { reduced, fullMotion } = useMotionProfile();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    // gsap.context scopes every selector and tween created inside it, so
    // `revert()` removes all of them — including the pin's DOM wrapper — in one
    // call. Without it, a profile change (resize across the tablet breakpoint)
    // leaves an orphaned pin spacer behind.
    const context = gsap.context(() => {
      const lines = gsap.utils.toArray<HTMLElement>('[data-hero-line]');
      const supporting = gsap.utils.toArray<HTMLElement>('[data-hero-supporting]');

      // --- Headline masked line-wipe (both mobile and desktop) -------------
      // `clipPath` + `y` only: no layout properties, so this stays on the
      // compositor and inside the 60fps budget (risk_log.md R-006).
      gsap.fromTo(
        lines,
        { clipPath: 'inset(0 100% 0 0)', y: '0.1em' },
        {
          clipPath: 'inset(0 0% 0 0)',
          y: '0em',
          duration: durationSec(fullMotion ? 'slow' : 'normal'),
          ease: gsapEase('outExpo'),
          // Desktop staggers line by line; mobile's Adaptation Strategy
          // reduces stagger to a single step, so the lines move together.
          stagger: fullMotion ? durationSec('instant') : 0,
        }
      );

      gsap.fromTo(
        supporting,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: durationSec('normal'),
          ease: gsapEase('outSmooth'),
          delay: durationSec('fast'),
          stagger: fullMotion ? durationSec('instant') : 0,
        }
      );

      // Mobile stops here: single-pass reveal, no sticky hold, no parallax.
      if (!fullMotion) return;

      // --- Desktop background parallax, across the sticky track -------------
      //
      // NOTE: no `pin: true`. The hold is done in CSS by `.hero-track` +
      // `sticky` — see globals.css. GSAP only reads scroll progress here; it
      // never restructures the DOM, which is what previously broke client-side
      // navigation.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            // The track is taller than the viewport, so 'bottom bottom' is
            // exactly the moment the hero releases from sticky.
            end: 'bottom bottom',
            // `scrub: true` is what makes the sequence scroll-INDEXED —
            // scrubbing back up reverses it exactly (branding.md §6).
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(
          backgroundRef.current,
          { yPercent: 0 },
          { yPercent: PARALLAX.background * 100, ease: 'none' },
          0
        )
        .fromTo(
          midgroundRef.current,
          { yPercent: 0 },
          { yPercent: PARALLAX.midground * 20, ease: 'none' },
          0
        );
    }, root);

    return () => context.revert();
  }, [reduced, fullMotion]);

  return (
    <div
      ref={rootRef}
      data-testid="hero-stage"
      /**
       * The scroll TRACK. Taller than the viewport on desktop (see
       * `.hero-track` in globals.css); the stage inside it is `sticky`, which
       * is what produces the hold.
       *
       * `-mt-(--size-header)` pulls the track up UNDER the sticky header, and
       * the stage inside puts the padding back. Without it the header's 64px of
       * document flow pushed the hero down, so the hold could not begin until
       * the visitor had already scrolled 64px — the hero lurched upward and
       * only then froze, reading as a stutter.
       *
       * Starting at true zero also lets the `gradient-hero` field run behind
       * the translucent header, which is what branding.md's night-sky
       * treatment expects.
       */
      className="hero-track relative -mt-(--size-header)"
    >
      <div className="gradient-hero sticky top-0 isolate flex h-svh flex-col justify-center overflow-hidden pt-(--size-header)">
        {/* Background layer (0.2x) — ambient grid, the "instrument panel" field. */}
        <div ref={backgroundRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
          {/* Faint route grid. Cell size and line colour both come from tokens
              (`spacing-3xl`, `color-border`) rather than literals. */}
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:var(--spacing-3xl)_var(--spacing-3xl)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="absolute inset-0 gradient-scrim opacity-60" />
        </div>

        {/* Midground layer (0.5x) — the route being watched, and the radar cue. */}
        <div ref={midgroundRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 bottom-0 h-1/3">
            {/*
              Bound to the TRACK, not to this element: the track is what
              actually scrolls, so its progress is the hold's progress.

              The driver switches with the profile because the two cases are
              genuinely different, not cosmetically so. On desktop the track is
              taller than the viewport, so there is scroll range to scrub
              against. On mobile there is no pin (branding.md §8), the track is
              exactly one viewport tall, and start/end collapse onto the same
              scroll position — a scrub there snapped 0 → 1 with no visible
              traversal. Mobile therefore gets the timed single-pass draw the
              screen doc specifies.
            */}
            <RouteLineCanvas
              triggerRef={rootRef}
              start="top top"
              end="bottom bottom"
              driver={fullMotion ? 'scroll' : 'timeline'}
            />
          </div>
          <div className="absolute -top-2xl -right-2xl aspect-square w-2/3 opacity-70 md:w-1/2">
            <RadarSweepCanvas />
          </div>
        </div>

        {/* Content layer (1.0x) — the only layer that receives input. */}
        <div className="relative z-10 w-full">{children}</div>
      </div>
    </div>
  );
}
