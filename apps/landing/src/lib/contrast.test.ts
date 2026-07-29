import { describe, expect, it } from 'vitest';

/**
 * WCAG AA contrast guards for the token pairings the components actually use.
 *
 * branding.md §4 commits to AA "in both light and dark mode — verified
 * independently per mode, not assumed from the light-mode pass". That was not
 * true: white-on-`primary` shipped at 2.77:1 in light and 2.14:1 in dark on
 * every conversion button on the site, and nothing caught it because contrast
 * is invisible to a type checker, a linter, and a render test alike.
 *
 * These assertions encode the pairings as arithmetic so a future palette or
 * variant change fails here rather than in front of a visitor.
 */

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** branding.md §3.1, verbatim. */
const LIGHT = {
  primary: '#0EA5E9',
  primaryLight: '#E0F4FD',
  surface: '#FFFFFF',
  surfaceSecondary: '#F8FAFC',
  textPrimary: '#1E293B',
  textSecondary: '#54647A',
  ink: '#1E293B',
  accentText: '#0369A1',
} as const;

const DARK = {
  primary: '#38BDF8',
  primaryLight: '#0B3A52',
  surface: '#0B1220',
  surfaceSecondary: '#151E2E',
  textPrimary: '#F8FAFC',
  textSecondary: '#9AA9BF',
  ink: '#0B1220',
  accentText: '#38BDF8',
} as const;

const AA_NORMAL = 4.5;

describe('sanity — the luminance maths is right', () => {
  it('scores black on white at 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('scores a colour against itself at 1:1', () => {
    expect(contrastRatio('#0EA5E9', '#0EA5E9')).toBeCloseTo(1, 5);
  });
});

describe('primary CTA — the most important text on the site', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('passes AA in %s mode', (_mode, t) => {
    // `ink`, not white. White fails both modes; see button.tsx.
    expect(contrastRatio(t.primary, t.ink)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('confirms the branding.md §3.5 white-on-primary spec would fail', () => {
    // Documents WHY we deviate, so nobody "restores" it from the doc.
    expect(contrastRatio(LIGHT.primary, '#FFFFFF')).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(DARK.primary, '#FFFFFF')).toBeLessThan(AA_NORMAL);
  });
});

describe('secondary CTA and selected states on primary-light', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('passes AA in %s mode', (_mode, t) => {
    expect(contrastRatio(t.primaryLight, t.textPrimary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('confirms blue-on-primary-light fails in light mode', () => {
    expect(contrastRatio(LIGHT.primaryLight, LIGHT.primary)).toBeLessThan(AA_NORMAL);
  });
});

describe('body copy', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('passes AA on both surfaces in %s mode', (_mode, t) => {
    for (const bg of [t.surface, t.surfaceSecondary]) {
      expect(contrastRatio(bg, t.textPrimary)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(bg, t.textSecondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * KNOWN, REPORTED FAILURES — asserted as failing on purpose.
 *
 * These are palette-level problems that cannot be fixed with any existing
 * token, so they are queued for product-shaper rather than papered over. The
 * assertions are inverted deliberately: if a future palette change fixes them,
 * THESE TESTS FAIL, which is the prompt to delete them and add the pairing to
 * the passing sets above.
 */
describe('accent text', () => {
  it.each([
    ['light surface', LIGHT.surface, LIGHT.accentText],
    ['light surface-secondary', LIGHT.surfaceSecondary, LIGHT.accentText],
    ['light primary-light', LIGHT.primaryLight, LIGHT.accentText],
    ['dark surface', DARK.surface, DARK.accentText],
    ['dark surface-secondary', DARK.surfaceSecondary, DARK.accentText],
    ['dark primary-light', DARK.primaryLight, DARK.accentText],
  ])('passes AA on %s', (_where, bg, fg) => {
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('exists because `primary` cannot carry text on a light surface', () => {
    // Documents the reason for a second blue, so nobody collapses the two.
    // `primary-hover` was checked too and only reaches 4.03:1.
    expect(contrastRatio(LIGHT.surface, LIGHT.primary)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(LIGHT.surface, '#0C87BD')).toBeLessThan(AA_NORMAL);
  });

  it('must NOT be used on the hero, which is dark in both modes', () => {
    // The light-mode accent is a dark blue: on the hero's ink field it drops to
    // 2.47:1. The hero eyebrow correctly keeps `primary` (5.28:1) instead.
    expect(contrastRatio(LIGHT.ink, LIGHT.accentText)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(LIGHT.ink, LIGHT.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('known palette gaps (fail intentionally — see product-shaper brief)', () => {
  it('the light-mode button hover tone cannot pass with any text colour', () => {
    expect(contrastRatio('#0C87BD', LIGHT.ink)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio('#0C87BD', '#FFFFFF')).toBeLessThan(AA_NORMAL);
  });

  it('white on the dark-mode error tone fails', () => {
    // Only bites if the `destructive` variant is ever used — currently unused.
    expect(contrastRatio('#F26B60', '#FFFFFF')).toBeLessThan(AA_NORMAL);
  });
});
