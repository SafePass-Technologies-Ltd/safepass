'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { gsap, ScrollTrigger } from '@/lib/motion/gsap';
import { durationSec, gsapEase } from '@/lib/motion/constants';
import { useReducedMotion } from '@/lib/motion/use-reduced-motion';
import { cn } from '@/lib/utils';

/**
 * Route-line motif — the site's one recurring visual thread (branding.md §5:
 * "the road/route line is the site's one recurring visual thread").
 *
 * A route is traced left-to-right across the surface as scroll progresses.
 * This is the literal "motion is evidence" case from branding.md §5 — the
 * graphic depicts a journey being watched, which is the thing the product
 * does, so it is scroll-INDEXED: the traced position is a continuous function
 * of scroll, and scrubbing back up untraces it exactly. That reversibility is
 * the "precision instrument" requirement, and it is why `scrub: true` is used
 * rather than a one-shot trigger.
 *
 * WHY CANVAS 2D AND NOT LOTTIE: branding.md §7 nominates Lottie for this
 * sequence, but IMPLEMENTATION.md records a scope decision (mitigating
 * risk_log.md R-005, motion fragility, and R-006, the <1.5MB budget) deferring
 * Lottie/Rive/three.js. A procedurally drawn line costs no payload at all,
 * which is the right trade on the variable Nigerian mobile networks R-006 is
 * written about.
 *
 * NO SECOND LOOP: there is no requestAnimationFrame here. Redraws happen in
 * ScrollTrigger's `onUpdate`, which is already driven by the single Lenis →
 * gsap.ticker loop owned by `ScrollProvider`.
 */

/**
 * Path geometry in normalized (0-1) space.
 *
 * These are drawing coordinates, not design tokens — there is no theme token
 * for "how far the road bends". They are named and centralized so the shape is
 * tunable in one place rather than scattered through the draw call.
 */
const PATH = {
  /** Vertical centre of the line within the canvas. */
  baseline: 0.55,
  /** Peak deviation above/below the baseline. */
  amplitude: 0.3,
  /** Number of half-waves across the width — 1.5 reads as a road, not a sine test card. */
  waves: 1.5,
  /** Sample count. High enough to look smooth at 1920px, cheap enough to redraw per frame. */
  samples: 160,
  /** Stroke width in CSS px — branding.md §7 specifies 2px line art throughout. */
  strokeWidth: 2,
  /** Radius of the leading "current position" dot, in CSS px. */
  headRadius: 4,
  /** Glow radius behind the head, echoing the logo's emissive edge. */
  headGlow: 14,
};

/** Reads a theme custom property; returns '' when unset (SSR-ish/jsdom). */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface RouteLineCanvasProps {
  className?: string;
  /**
   * Element whose scroll progress drives the trace. Defaults to the canvas
   * itself. Pass the hero's sticky track so the trace maps onto the hold.
   */
  triggerRef?: RefObject<HTMLElement | null>;
  /** ScrollTrigger `start`. Defaults to entering the viewport. */
  start?: string;
  /** ScrollTrigger `end`, string or getter (a getter re-evaluates on resize). */
  end?: string | (() => string);
  /**
   * How the trace is driven.
   *
   * - `'scroll'` — scrubbed against the trigger's scroll progress. Requires the
   *   trigger to actually HAVE scroll range; see the note below.
   * - `'timeline'` — a one-shot timed draw on mount.
   *
   * This exists because the two are not interchangeable. On mobile the hero has
   * no pin (branding.md §8 removes it), so its track is exactly one viewport
   * tall and `start: 'top top'` / `end: 'bottom bottom'` resolve to the SAME
   * scroll position. A zero-length scrub range snaps straight from 0 to 1, so
   * the line appeared fully drawn the instant the visitor scrolled — no
   * traversal at all.
   *
   * `'timeline'` is also what the docs actually ask for on mobile: a "single-
   * pass reveal on load" (screens/01) rather than a scroll-indexed sequence.
   */
  driver?: 'scroll' | 'timeline';
}

export function RouteLineCanvas({
  className,
  triggerRef,
  start = 'top bottom',
  end = 'bottom top',
  driver = 'scroll',
}: RouteLineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /**
     * Error state, per `screens/01-homepage.md`: a surface that cannot be
     * created "falls back silently to the static hero image state — never
     * shows a broken canvas or console-visible error to the visitor". The
     * canvas element stays in the DOM, empty and `aria-hidden`; every piece of
     * meaningful content sits in the DOM layer above and is unaffected.
     */
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /**
     * Reduced motion renders the STATIC COMPOSED STATE — the completed route,
     * not an empty canvas and not a zero-duration animation. branding.md §8
     * makes this a hard requirement: the content must be trustworthy
     * independent of the spectacle, and a half-drawn road is not the composed
     * artwork.
     */
    let progress = reducedMotion ? 1 : 0;

    function draw() {
      if (!canvas || !ctx) return;

      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);
      if (progress <= 0) return;

      const primary = readToken('--sp-primary');
      const success = readToken('--sp-success');
      // Without resolved tokens (no stylesheet — jsdom) there is nothing safe
      // to draw with, and inlining a hex here would violate the token rule.
      if (!primary || !success) return;

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, primary);
      gradient.addColorStop(1, success);

      ctx.lineWidth = PATH.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = gradient;

      const pointAt = (t: number): [number, number] => [
        t * width,
        (PATH.baseline - Math.sin(t * Math.PI * PATH.waves) * PATH.amplitude * 0.5) * height,
      ];

      // Sample the traced portion only, 0 → `progress`, at a fixed step count
      // so the line's smoothness doesn't degrade early in the trace.
      const steps = PATH.samples;

      ctx.beginPath();
      for (let i = 0; i <= steps; i += 1) {
        const [x, y] = pointAt((i / steps) * progress);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Leading head — the implicit focal point of the hero per branding.md §8
      // ("the route-line's current traced position is the implicit focal
      // point"). Hidden at full progress so the completed static state reads as
      // a finished route rather than a stalled one.
      if (progress < 1) {
        const [hx, hy] = pointAt(progress);
        ctx.save();
        ctx.shadowBlur = PATH.headGlow;
        ctx.shadowColor = primary;
        ctx.fillStyle = primary;
        ctx.beginPath();
        ctx.arc(hx, hy, PATH.headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function resize() {
      if (!canvas || !ctx) return;
      const { width, height } = canvas.getBoundingClientRect();
      // Cap DPR at 2: beyond that the pixel cost climbs sharply for no visible
      // gain on a 2px line, and R-006 budgets for 60fps on modest hardware.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    if (reducedMotion) {
      return () => observer.disconnect();
    }

    /**
     * Timed single-pass draw — mobile, per branding.md §8's Adaptation Strategy
     * ("hero pin sequence is removed entirely") and screens/01's "single-pass
     * reveal on load".
     *
     * A scrub is impossible here: with no pin the hero track is exactly one
     * viewport tall, so the trigger's start and end land on the same scroll
     * position and progress jumps 0 → 1 with no traversal to see. A timed draw
     * is both the correct behaviour and the documented one. `ease-out-expo`
     * applies properly here because this genuinely IS a time-based tween.
     */
    if (driver === 'timeline') {
      const state = { value: 0 };
      const tween = gsap.to(state, {
        /**
         * `cinematic` (1000ms) with `ease-out-smooth`, not `slow` with
         * `ease-out-expo`.
         *
         * Expo is so front-loaded that a 600ms draw was visually complete in
         * about 300ms — on a real phone that finishes during hydration, so the
         * traversal was over before the visitor had looked at it and the line
         * simply appeared. The motif is meant to read as a route being traced;
         * a draw nobody sees is the same as no draw. `ease-out-smooth` still
         * decelerates (branding.md's "unhurried") while leaving roughly half a
         * second of visible travel.
         */
        duration: durationSec('cinematic'),
        ease: gsapEase('outSmooth'),
        onUpdate: () => {
          progress = state.value;
          draw();
        },
      });

      return () => {
        tween.kill();
        observer.disconnect();
      };
    }

    /**
     * The scrubbed traversal maps LINEARLY to scroll progress. This is
     * deliberate, and a considered deviation from branding.md §6, which lists
     * `ease-out-expo` under "scroll-driven route-line traversal".
     *
     * Why: an ease-out curve applied to scroll progress front-loads the entire
     * animation. With `ease-out-expo` the line was 48% drawn after 10% of the
     * pin, 98% after 50%, and 99.8% after 75% — so the final ~675px of the
     * hero's pinned scroll produced no visible change whatsoever. The visitor
     * kept scrolling against a frozen page, which reads as the site having
     * hung rather than as a deliberate sequence.
     *
     * An ease describes how something moves *through time*. Scroll position is
     * not time: it is a value the visitor sets directly, and easing it makes
     * the same wheel movement produce wildly different amounts of motion
     * depending on where in the pin you are. Linear mapping is also what
     * branding.md actually asks for in spirit — "scroll position is a timeline
     * scrubber from 0 to 1" and "scrubbing up reverses the animation exactly"
     * — since a 1:1 mapping is the only one that feels like a precision
     * instrument under the hand.
     *
     * Reported as a docs conflict rather than resolved in the doc.
     */
    const trigger = ScrollTrigger.create({
      trigger: triggerRef?.current ?? canvas,
      start,
      end,
      scrub: true,
      onUpdate: (self) => {
        progress = self.progress;
        draw();
      },
    });

    return () => {
      trigger.kill();
      observer.disconnect();
    };
  }, [reducedMotion, triggerRef, start, end, driver]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="route-line-canvas"
      className={cn('block h-full w-full', className)}
    />
  );
}
