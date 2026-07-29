'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { gsap, ScrollTrigger } from '@/lib/motion/gsap';
import {
  REVEAL_START,
  SCALE_ENTRY_FROM,
  durationSec,
  gsapEase,
  type DurationName,
} from '@/lib/motion/constants';
import { useReducedMotion } from '@/lib/motion/use-reduced-motion';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Render as a different element (e.g. 'section', 'li'). Defaults to 'div'. */
  as?: ElementType;
  /** Stagger index — multiplies the delay for list/grid entries. */
  index?: number;
  /** Include the 0.96 → 1.0 settle. Used for cards and stat call-outs. */
  scale?: boolean;
  /** Duration token. Defaults to `normal` (400ms) per the card/stat reveal spec. */
  duration?: DurationName;
}

/**
 * Scroll-entry reveal — the workhorse primitive for section and card entrances.
 *
 * Implements branding.md's reveal spec: entrance begins when the element's top
 * edge hits 82% of viewport height (REVEAL_START), eases with `ease-out-smooth`,
 * and optionally settles from 0.96x scale — "a near-imperceptible settle, not
 * a pop".
 *
 * CRITICAL — the content is always in the DOM and always visible to a screen
 * reader and to a crawler. Only `opacity` and `transform` are animated, and the
 * reduced-motion path renders the final state directly. branding.md Section 4
 * requires that "all meaningful stat call-outs have static text equivalents
 * present in the DOM before animation runs, not injected only after a
 * scroll-triggered reveal", and FEAT-005 requires credibility content be
 * crawlable rather than interaction-gated. Never reimplement this by mounting
 * children on intersection.
 */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
  index = 0,
  scale = false,
  duration = 'normal',
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    // Reduced motion: the element already sits at its final state because no
    // inline `from` was ever applied. Nothing to do — deliberately not an
    // "instant tween", which would still be a (zero-length) animation.
    if (!element || reducedMotion) return;

    const animation = gsap.fromTo(
      element,
      {
        opacity: 0,
        y: 24,
        ...(scale ? { scale: SCALE_ENTRY_FROM } : {}),
      },
      {
        opacity: 1,
        y: 0,
        ...(scale ? { scale: 1 } : {}),
        duration: durationSec(duration),
        ease: gsapEase('outSmooth'),
        delay: index * 0.08,
        scrollTrigger: {
          trigger: element,
          start: REVEAL_START,
          // once: the entrance plays on first entry only. Re-triggering on
          // every scroll pass is the fidgety behaviour branding.md rules out
          // for stat count-ups ("never on every scroll pass").
          once: true,
        },
      }
    );

    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
      // Clear GSAP's inline styles so the element returns to its CSS-defined
      // final state rather than keeping a stale transform.
      gsap.set(element, { clearProps: 'opacity,transform' });
    };
  }, [reducedMotion, index, scale, duration]);

  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}

/**
 * Parallax layer — binds an element's Y offset to scroll progress.
 *
 * Depth multipliers come from branding.md Section 8: background 0.2x,
 * midground 0.5x, content 1.0x. Purely decorative, so it is `aria-hidden` by
 * default; pass `aria-hidden={false}` only if the layer carries real content.
 *
 * `scrub: true` (not a number) is what makes this scroll-INDEXED rather than
 * scroll-triggered — the transform's state is a continuous function of scroll
 * position, so scrubbing back up reverses it exactly, per branding.md's
 * "precision instrument" requirement.
 */
export function Parallax({
  children,
  className,
  speed = 0.2,
  ariaHidden = true,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
  ariaHidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element || reducedMotion) return;

    const distance = element.offsetHeight * speed;

    const animation = gsap.fromTo(
      element,
      { y: -distance / 2 },
      {
        y: distance / 2,
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );

    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
      gsap.set(element, { clearProps: 'transform' });
    };
  }, [reducedMotion, speed]);

  return (
    <div ref={ref} className={cn(className)} aria-hidden={ariaHidden || undefined}>
      {children}
    </div>
  );
}

/** Re-export so section code can pull one import for scroll-entry work. */
export { ScrollTrigger };
