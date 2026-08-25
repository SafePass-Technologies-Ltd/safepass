'use client';

import Image from 'next/image';
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from '@/lib/motion/gsap';
import { durationSec, gsapEase } from '@/lib/motion/constants';
import { useMotionProfile } from '@/lib/motion/use-reduced-motion';
import { RouteLineCanvas } from '@/components/motion/route-line-canvas';
import { RadarSweepCanvas } from '@/components/motion/radar-sweep-canvas';

/**
 * The hero's motion shell — FEAT-003.
 *
 * Owns the z-space layers (background, midground, content) and the entrance
 * sequence. It takes the hero's actual copy as `children` from a Server
 * Component, which is the important structural point: the headline, the
 * sentence, and the CTAs are server-rendered and present in the DOM before this
 * file's JavaScript exists. Nothing meaningful is ever injected by an
 * animation.
 *
 * NO HERO PIN. The site's first hero used to hold via CSS sticky + an oversized
 * `.hero-track` so the route line could be scroll-scrubbed across the hold —
 * but that made the hero "wait until the line is fully drawn", which read as
 * broken scroll. The pin hold and the scroll-gated line are removed: the hero
 * scrolls away naturally, and the route line animates once on load (see the
 * RouteLineCanvas usage below). branding.md §8's desktop pin sequence is
 * intentionally not applied; this is a client-driven deviation.
 *
 * Motion profiles, per branding.md §8's Adaptation Strategy:
 *
 * - **Reduced motion** — nothing runs. The markup's own CSS is the composed
 *   state, so there is no `from` state to clear and no flash to avoid. Hard
 *   requirement, not an enhancement.
 * - **Mobile** — a single compressed reveal on load, matching Amaka's
 *   skim-and-decide session (user_personas.md) and Flow 1 step 2.
 * - **Desktop** — the same reveal with a slightly longer headline line-wipe and
 *   line-by-line stagger, but no pin and no parallax.
 *
 * The headline's masked line-wipe plays ONCE ON LOAD — a scrubbed wipe is by
 * definition invisible at scroll progress 0, which would break FEAT-003's first
 * acceptance criterion ("headline and one-sentence explanation are visible
 * without scrolling").
 */

export function HeroStage({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reduced, fullMotion } = useMotionProfile();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    // gsap.context scopes every selector and tween created inside it, so a
    // single `revert()` removes them all. Without it, a profile change (resize
    // across the tablet breakpoint) would leave orphaned tweens behind.
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
    }, root);

    return () => context.revert();
  }, [reduced, fullMotion]);

  return (
    <div
      ref={rootRef}
      data-testid="hero-stage"
      /**
       * The scroll TRACK — exactly one viewport tall (`.hero-track` in
       * globals.css). The hero no longer pins, so there is no hold: the stage
       * scrolls away like any other section.
       *
       * `-mt-(--size-header)` pulls the track up UNDER the sticky header, and
       * the stage inside puts the padding back. Starting at true zero lets the
       * `gradient-hero` field run behind the translucent header, which is what
       * branding.md's night-sky treatment expects.
       */
      className="hero-track relative -mt-(--size-header) overflow-hidden"
    >
      <div className="gradient-hero relative isolate flex min-h-svh flex-col justify-center overflow-hidden pt-(--size-header)">
          {/* Background layer — ambient grid, the "instrument panel" field. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {/*
              A1 from manifest.md — the environmental road plate, as the hero's
              background image. (The docs scope it to the mobile/reduced-motion
              static fallback, but the client wants it as a background here on
              every breakpoint — docs to be reconciled later.) A brand tint keeps
              it night-navy and calm, and the gradient-scrim below keeps the
              white hero text legible; neither is baked into the image.
            */}
            <Image
              src="/images/hero-road-dusk.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 gradient-hero opacity-50" />
            {/* Faint route grid. Cell size and line colour both come from tokens
                (`spacing-3xl`, `color-border`) rather than literals. */}
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:var(--spacing-3xl)_var(--spacing-3xl)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            {/* gradient-scrim keeps text legible where it sits on an image
                (branding §3.5), harmless over the plain gradient. */}
            <div className="absolute inset-0 gradient-scrim opacity-70" />
          </div>

        {/* Midground layer — the route being watched, and the radar cue. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 bottom-0 h-1/3">
            {/*
              The route line draws ONCE ON LOAD via its timeline driver, not
              scrubbed against a scroll hold. Client feedback: the hero pinned
              until the line fully drew, which made scroll feel broken. With the
              pin hold removed (see globals.css + the top of this file) there is
              no scroll range to scrub against, so 'timeline' is the correct
              driver on every breakpoint — a single-pass draw on mount.
            */}
            <RouteLineCanvas driver="timeline" />
          </div>
          <div className="absolute top-(--size-header) -right-2xl aspect-square w-2/3 opacity-70 md:w-1/2">
            <RadarSweepCanvas />
          </div>
        </div>

        {/* Content layer (1.0x) — the only layer that receives input. */}
        <div className="relative z-10 w-full">{children}</div>
      </div>
    </div>
  );
}
