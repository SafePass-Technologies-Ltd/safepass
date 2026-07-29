import { describe, expect, it } from 'vitest';
import {
  EASE,
  HERO_PIN_VH,
  PARALLAX,
  REVEAL_THRESHOLD,
  SCALE_ENTRY_FROM,
  cssEase,
  durationMs,
  durationSec,
  gsapEase,
} from './constants';

/**
 * Foundation tests pinning the motion constants to branding.md's stated values.
 *
 * These exist because the values are individually easy to "tidy" into
 * plausible-looking round numbers, and each one that drifts silently breaks a
 * documented design intent rather than causing an obvious failure.
 */

describe('easing tokens', () => {
  it('matches branding.md Section 6 exactly', () => {
    expect(EASE.outSmooth).toEqual([0.16, 1, 0.3, 1]);
    expect(EASE.inOutSpring).toEqual([0.34, 1.2, 0.64, 1]);
    expect(EASE.outExpo).toEqual([0.19, 1, 0.22, 1]);
    expect(EASE.inOutSmooth).toEqual([0.65, 0, 0.35, 1]);
    expect(EASE.inPower).toEqual([0.7, 0, 0.84, 0]);
  });

  it('keeps the spring overshoot restrained', () => {
    // branding.md: "low overshoot — a security product doesn't bounce".
    // A typical spring sits at 1.7+; anything at or above that has drifted
    // away from the Calm/Authoritative personality.
    expect(EASE.inOutSpring[1]).toBeLessThan(1.5);
  });

  it('formats as a CSS cubic-bezier', () => {
    expect(cssEase('outSmooth')).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });
});

/**
 * Regression guard for a bug that shipped silently.
 *
 * GSAP cannot parse CSS `cubic-bezier(...)` syntax. Passing one to
 * `gsap.parseEase()` returns undefined (a runtime crash), and passing one as a
 * tween's `ease` does NOT throw — GSAP falls back to its default `power1.out`.
 * Every tween in the app was quietly running on the default curve while looking
 * fine, which is why these assertions check the ease is a FUNCTION producing
 * the right SHAPE, not merely that a token exists.
 */
describe('gsapEase', () => {
  it('returns a callable function, not a string GSAP would silently ignore', () => {
    expect(typeof gsapEase('outSmooth')).toBe('function');
  });

  it('pins the endpoints exactly', () => {
    for (const name of ['outSmooth', 'outExpo', 'inOutSmooth', 'inPower'] as const) {
      const ease = gsapEase(name);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  it('clamps out-of-range input, which ScrollTrigger can produce mid-scrub', () => {
    const ease = gsapEase('outExpo');
    expect(ease(-0.2)).toBe(0);
    expect(ease(1.2)).toBe(1);
  });

  it('front-loads ease-out curves, matching their declared character', () => {
    // `ease-out-expo` is "fast start, long tail" — at the midpoint it must be
    // well past halfway. A default power1.out would sit around 0.75; the real
    // curve is far higher. This is the assertion that would have caught the
    // silent fallback.
    const expo = gsapEase('outExpo');
    expect(expo(0.5)).toBeGreaterThan(0.9);

    const smooth = gsapEase('outSmooth');
    expect(smooth(0.5)).toBeGreaterThan(0.8);
  });

  it('produces a restrained overshoot for the spring, never a bounce', () => {
    // branding.md: "a security product doesn't bounce". The curve may exceed 1
    // in its tail, but only slightly.
    const spring = gsapEase('inOutSpring');
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => spring(i / 100)));
    expect(peak).toBeLessThan(1.05);
  });

  it('is monotonic for the non-spring curves', () => {
    for (const name of ['outSmooth', 'outExpo', 'inOutSmooth', 'inPower'] as const) {
      const ease = gsapEase(name);
      let previous = 0;
      for (let i = 0; i <= 100; i += 1) {
        const value = ease(i / 100);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = value;
      }
    }
  });

  it('matches a known browser cubic-bezier value', () => {
    // cubic-bezier(0.65, 0, 0.35, 1) is symmetric, so its midpoint is exactly
    // 0.5 — an independent check that the solver is correct rather than merely
    // self-consistent.
    expect(gsapEase('inOutSmooth')(0.5)).toBeCloseTo(0.5, 5);
  });

  it('caches, so per-frame scrub calls do not rebuild the solver', () => {
    expect(gsapEase('outSmooth')).toBe(gsapEase('outSmooth'));
  });
});

describe('duration tokens', () => {
  it('resolves each token to its branding.md value', () => {
    // jsdom has no real stylesheet, so this exercises the fallback table —
    // which is precisely the path used during SSR.
    expect(durationMs('instant')).toBe(100);
    expect(durationMs('fast')).toBe(200);
    expect(durationMs('normal')).toBe(400);
    expect(durationMs('slow')).toBe(600);
    expect(durationMs('cinematic')).toBe(1000);
  });

  it('exposes seconds for GSAP', () => {
    expect(durationSec('normal')).toBe(0.4);
  });

  it('keeps the ambient loop inside the 3000-6000ms band', () => {
    expect(durationMs('ambient')).toBeGreaterThanOrEqual(3000);
    expect(durationMs('ambient')).toBeLessThanOrEqual(6000);
  });
});

describe('spatial constants', () => {
  it('uses the three documented parallax depths, with fixed UI pinned at 0', () => {
    expect(PARALLAX.background).toBe(0.2);
    expect(PARALLAX.midground).toBe(0.5);
    expect(PARALLAX.content).toBe(1.0);
    // The header must never drift with scroll — branding.md Section 2 requires
    // it stay legible and unobscured during the hero motion.
    expect(PARALLAX.fixed).toBe(0);
  });

  it('reveals at 82%, not the common 80% default', () => {
    // branding.md chose this deliberately for "a fractionally more deliberate,
    // considered pacing consistent with Calm".
    expect(REVEAL_THRESHOLD).toBe(0.82);
  });

  it('settles rather than pops', () => {
    // "a near-imperceptible settle, not a pop"
    expect(SCALE_ENTRY_FROM).toBe(0.96);
    expect(1 - SCALE_ENTRY_FROM).toBeLessThan(0.05);
  });
});

describe('hero pin', () => {
  it('keeps the hero from dominating the page', () => {
    // Measured at 1.5 (the documented value) the hero consumed 48% of total
    // page scroll before the second section appeared, against branding.md's
    // own stated intent of "efficient rather than heavy... three different
    // audiences need to reach their CTA quickly". Guarded so a future change
    // has to reckon with that measurement rather than restore 1.5 by reflex.
    expect(HERO_PIN_VH).toBeLessThanOrEqual(1);
    expect(HERO_PIN_VH).toBeGreaterThan(0.5);
  });
});
