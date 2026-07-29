'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { useReducedMotion } from './use-reduced-motion';

/**
 * ScrollProvider — THE single scroll source and THE single render loop.
 *
 * branding.md Section 6 states this as a "Single source of truth" requirement:
 * "One smoothed scroll-progress value feeds every scroll-bound animation on
 * the page through one render loop — the route-line, parallax layers, and stat
 * count-ups never run on independent scroll listeners."
 *
 * Why it is enforced structurally rather than by convention: independent
 * scroll listeners desynchronise. Two elements bound to two listeners drift by
 * a frame or two under load, and on a page whose entire motion concept is "a
 * route being traced as you scroll", that drift reads as jitter — precisely the
 * opposite of the "precision instrument" feel the brand is built on. It also
 * multiplies layout thrash, putting the 60fps budget (R-006) at risk.
 *
 * So: ONE Lenis instance here, driving ONE gsap.ticker, with ScrollTrigger
 * synced to it. Consumers reach it through `useLenis`.
 *
 * NEVER add a `window.addEventListener('scroll')` or a second
 * `requestAnimationFrame` loop anywhere in this app.
 */

interface ScrollContextValue {
  /**
   * Ref to the live Lenis instance — `null` before init and whenever reduced
   * motion is active.
   *
   * A ref rather than state deliberately: consumers read it inside event
   * handlers and GSAP callbacks, never during render, so publishing it as
   * state would trigger an app-wide re-render on mount for no rendered
   * difference.
   */
  lenisRef: RefObject<Lenis | null>;
  /** Whether smooth scrolling is running (false under reduced motion). */
  isSmooth: boolean;
}

const ScrollContext = createContext<ScrollContextValue>({
  lenisRef: { current: null },
  isSmooth: false,
});

export function useLenis(): ScrollContextValue {
  return useContext(ScrollContext);
}

export function ScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Under reduced motion we never construct Lenis at all. Native scrolling
    // is what that visitor asked for, and smooth-scroll interception is itself
    // a motion effect — zeroing out durations wouldn't be enough.
    if (reducedMotion) return;

    const lenis = new Lenis({
      // Weighted and unhurried, per the motion personality. Higher values feel
      // floaty and undermine "precision instrument".
      lerp: 0.1,
      smoothWheel: true,
      // Touch smoothing stays OFF: intercepting native touch scrolling makes
      // the page feel laggy on exactly the low-end devices Amaka's persona
      // describes, and mobile already drops the pinned sequence per the
      // Adaptation Strategy.
      syncTouch: false,
    });

    lenisRef.current = lenis;

    // --- Wire Lenis into GSAP's ticker: one loop, not two. ---
    const update = (time: number) => {
      // gsap.ticker reports seconds; Lenis expects milliseconds.
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(update);
    // GSAP's own lag smoothing would fight Lenis's interpolation and produce
    // visible stutter on scroll-scrubbed timelines.
    gsap.ticker.lagSmoothing(0);

    // ScrollTrigger must read scroll position from Lenis, not from the window,
    // or every trigger fires at the wrong offset while smoothing is in flight.
    lenis.on('scroll', ScrollTrigger.update);

    return () => {
      gsap.ticker.remove(update);
      gsap.ticker.lagSmoothing(500, 33); // restore GSAP's default
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reducedMotion]);

  const value = useMemo<ScrollContextValue>(
    () => ({ lenisRef, isSmooth: !reducedMotion }),
    [reducedMotion]
  );

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
