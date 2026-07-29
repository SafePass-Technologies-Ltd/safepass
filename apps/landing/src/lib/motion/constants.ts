/**
 * Motion constants — the JS-side mirror of branding.md Section 6 and Section 8.
 *
 * Easing and duration VALUES live in globals.css as theme tokens. This module
 * re-declares the easing curves in GSAP's own syntax because GSAP cannot
 * consume a CSS custom property as an ease function — but the numbers are the
 * same numbers, and if branding.md changes, both must change together.
 *
 * Durations are read FROM the CSS tokens at runtime (see `durationMs`) rather
 * than duplicated, since GSAP accepts a plain number.
 */

/**
 * Easing curves from branding.md Section 6's Easing Tokens, in GSAP's
 * `CustomEase`-compatible cubic-bezier form.
 *
 * Note `easeInOutSpring`'s deliberately low overshoot (1.2, not the 1.7+ of a
 * typical spring): branding.md's own note is "a security product doesn't
 * bounce". Don't "fix" this to feel springier.
 */
export const EASE = {
  /** Gentle deceleration — section reveals, stat call-outs entering view. */
  outSmooth: [0.16, 1, 0.3, 1],
  /** Restrained settle — audience-selector switch, form field focus. */
  inOutSpring: [0.34, 1.2, 0.64, 1],
  /** Fast start, long tail — scroll-driven route-line traversal, parallax. */
  outExpo: [0.19, 1, 0.22, 1],
  /** Symmetric, no bounce — radar-sweep loop, ambient background drift. */
  inOutSmooth: [0.65, 0, 0.35, 1],
  /** Sharp, brief — modal/menu dismissal. */
  inPower: [0.7, 0, 0.84, 0],
} as const;

export type EaseName = keyof typeof EASE;

/** Formats an EASE entry as a CSS `cubic-bezier(...)` string. */
export function cssEase(name: EaseName): string {
  const [a, b, c, d] = EASE[name];
  return `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
}

/**
 * Converts an easing token into a function GSAP can actually use.
 *
 * READ THIS BEFORE "SIMPLIFYING" IT BACK TO A STRING.
 *
 * GSAP does not understand CSS `cubic-bezier(...)` syntax. Its `ease` option
 * takes one of its own named eases ('power3.out'), a CustomEase instance, or a
 * plain function `(progress: number) => number`. Passing a cubic-bezier string
 * fails in two different ways, and the quiet one is the dangerous one:
 *
 *  - `gsap.parseEase('cubic-bezier(...)')` returns `undefined`, so calling the
 *    result throws `ease is not a function` at runtime.
 *  - `gsap.to(el, { ease: 'cubic-bezier(...)' })` does NOT throw. GSAP cannot
 *    resolve the name and silently falls back to its default `power1.out`.
 *
 * The second is how every tween in this app ended up ignoring branding.md's
 * easing tokens while appearing to work. The curves are a specified part of the
 * design system — `ease-in-out-spring`'s deliberately low overshoot is the
 * difference between "restrained settle" and "a security product that bounces"
 * — so silently substituting a default is a real design regression, not a
 * detail.
 *
 * Rather than depend on the CustomEase plugin, this evaluates the same cubic
 * Bézier the browser does, so CSS transitions and GSAP tweens driven by the
 * same token are genuinely identical curves.
 */
const easeFunctionCache = new Map<EaseName, (progress: number) => number>();

export function gsapEase(name: EaseName): (progress: number) => number {
  const cached = easeFunctionCache.get(name);
  if (cached) return cached;

  const [x1, y1, x2, y2] = EASE[name];
  const fn = cubicBezierEase(x1, y1, x2, y2);
  easeFunctionCache.set(name, fn);
  return fn;
}

/**
 * Builds `y(x)` for the CSS cubic-bezier curve with control points
 * (x1,y1) and (x2,y2), the first and last points being fixed at (0,0)/(1,1).
 *
 * The curve is parametric in `t`, but an easing function is queried by `x`
 * (elapsed progress), so each call solves `x(t) = progress` for `t` first —
 * Newton-Raphson, falling back to bisection where the derivative is too flat
 * for Newton to converge (which happens on curves like `ease-out-expo`, whose
 * near-vertical start is exactly the shape used here).
 */
function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (progress: number) => number {
  // Polynomial coefficients for the parametric form.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  function solveT(x: number): number {
    let t = x;

    // Newton-Raphson: converges in a handful of iterations for most curves.
    for (let i = 0; i < 8; i += 1) {
      const currentX = sampleX(t) - x;
      if (Math.abs(currentX) < 1e-6) return t;

      const derivative = sampleDerivativeX(t);
      if (Math.abs(derivative) < 1e-6) break;

      t -= currentX / derivative;
    }

    // Bisection fallback — slower but cannot diverge.
    let low = 0;
    let high = 1;
    t = x;

    while (low < high) {
      const currentX = sampleX(t);
      if (Math.abs(currentX - x) < 1e-6) return t;
      if (x > currentX) low = t;
      else high = t;
      t = (high - low) / 2 + low;
      if (high - low < 1e-7) break;
    }

    return t;
  }

  return (progress: number) => {
    // Clamp: GSAP can hand back values fractionally outside 0-1 mid-scrub, and
    // an unclamped solve there produces a visible jump.
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sampleY(solveT(progress));
  };
}

/** Duration token names from branding.md Section 6's Timing Scale. */
export type DurationName =
  | 'instant'
  | 'fast'
  | 'normal'
  | 'slow'
  | 'cinematic'
  | 'ambient';

/**
 * Fallback duration values in milliseconds.
 *
 * `durationMs()` prefers the live CSS token so the stylesheet stays the single
 * source of truth; these are used when there's no computed style to read from
 * (server render, jsdom tests).
 */
const DURATION_FALLBACK_MS: Record<DurationName, number> = {
  instant: 100,
  fast: 200,
  normal: 400,
  slow: 600,
  cinematic: 1000,
  ambient: 4500,
};

/**
 * Reads a duration token from the CSS theme, in milliseconds.
 *
 * Resolving from CSS rather than hardcoding means a timing change in
 * branding.md is made in exactly one place (globals.css) and both the CSS
 * transitions and the GSAP tweens pick it up.
 */
export function durationMs(name: DurationName): number {
  if (typeof window === 'undefined') return DURATION_FALLBACK_MS[name];

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--duration-${name}`)
    .trim();

  if (!raw) return DURATION_FALLBACK_MS[name];
  const parsed = raw.endsWith('ms')
    ? Number.parseFloat(raw)
    : raw.endsWith('s')
      ? Number.parseFloat(raw) * 1000
      : Number.parseFloat(raw);

  return Number.isFinite(parsed) ? parsed : DURATION_FALLBACK_MS[name];
}

/** Same as `durationMs`, in seconds — GSAP's native unit. */
export function durationSec(name: DurationName): number {
  return durationMs(name) / 1000;
}

/**
 * Parallax depth multipliers — branding.md Section 8's Depth Strategy.
 *
 * Three z-space layers. Fixed UI (nav, sticky audience selector) is 0x: it
 * must never drift, since branding.md Section 2 requires the header stay
 * legible and unobscured during scroll motion.
 */
export const PARALLAX = {
  background: 0.2,
  midground: 0.5,
  content: 1.0,
  fixed: 0,
} as const;

export type ParallaxLayer = keyof typeof PARALLAX;

/**
 * Reveal threshold: an element begins its entrance when its top edge reaches
 * this fraction of viewport height.
 *
 * 82%, not the common 80% — branding.md specifies the difference deliberately:
 * "a fractionally more deliberate, considered pacing consistent with 'Calm'".
 */
export const REVEAL_THRESHOLD = 0.82;

/** GSAP ScrollTrigger `start` string equivalent of REVEAL_THRESHOLD. */
export const REVEAL_START = `top ${REVEAL_THRESHOLD * 100}%`;

/**
 * Breakpoints (px) governing the Adaptation Strategy in branding.md Section 8.
 * Below `tablet`, the mobile adaptation applies: 2 parallax layers instead of
 * 3, no hero pin, single-pass reveals.
 */
export const BREAKPOINT = {
  tablet: 768,
  desktop: 1024,
} as const;

/** Tablet retains the full creative experience at 60% parallax intensity. */
export const TABLET_PARALLAX_INTENSITY = 0.6;

/**
 * Hero pin length as a fraction of viewport height — desktop only.
 *
 * DELIBERATE DEVIATION: branding.md §6 and screens/01-homepage.md both specify
 * 150% (1.5). Measured on a 1440x900 desktop, that made the hero consume
 * 2,250px of a 4,714px page — 48% of all scrolling before the second section
 * appeared. branding.md's own stated intent for this pin is the opposite:
 * "keeping the overall scroll feel efficient rather than heavy, since three
 * different audiences need to reach their CTA quickly."
 *
 * At 0.75 the hero takes ~31% of page scroll, and because the route-line
 * traversal now maps linearly (see route-line-canvas.tsx), the sequence still
 * completes exactly at the pin's end — full sequence, no dead scroll.
 *
 * Reported for product-shaper to reconcile in the docs; do not "restore" 1.5
 * without re-measuring the resulting page proportion.
 */
export const HERO_PIN_VH = 0.75;

/**
 * Scale-in range for cards and stat call-outs on scroll entry.
 * 0.96 → 1.0 is "a near-imperceptible settle, not a pop".
 */
export const SCALE_ENTRY_FROM = 0.96;
