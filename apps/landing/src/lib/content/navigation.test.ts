import { describe, expect, it } from 'vitest';
import { AUDIENCES, AUDIENCE_CONFIG } from '@/lib/audience/audience-config';
import {
  AUDIENCE_NAV,
  FOOTER_EXPLORE,
  FOOTER_LEGAL,
  HOME_LINK,
  STATIC_NAV,
} from './navigation';

/**
 * `AUDIENCE_NAV` is derived from AUDIENCE_CONFIG, so label/href/CTA drift is no
 * longer expressible and needs no guard test. What still needs asserting is
 * COVERAGE and ORDER: an audience silently missing from the nav, or reordered
 * out of screens.md's Individual → Business → Transport Partner sequence, is a
 * conversion bug rather than a cosmetic one — audience routing is R-001/R-002's
 * named mitigation.
 */
describe('AUDIENCE_NAV', () => {
  it('covers every audience, in order, with no extras', () => {
    expect(AUDIENCE_NAV.map((entry) => entry.audience)).toEqual([...AUDIENCES]);
  });

  it('carries each audience its own converting CTA', () => {
    // FEAT-006/009/011 each require their audience's own CTA — offering Tunde
    // an app download instead of "Request a Demo" is the exact failure the
    // audience split exists to prevent.
    expect(AUDIENCE_NAV.map((entry) => entry.ctaLabel)).toEqual(
      AUDIENCES.map((audience) => AUDIENCE_CONFIG[audience].ctaLabel)
    );
  });
});

describe('navigation link sets', () => {
  it('routes every audience plus the credibility and about pages in the static nav', () => {
    expect(STATIC_NAV.map((link) => link.href)).toEqual([
      '/',
      '/individual',
      '/business',
      '/transport-partners',
      '/how-we-verify',
      '/about',
    ]);
  });

  it('leads the static nav with Home (T-034 client feedback)', () => {
    expect(STATIC_NAV[0]).toEqual(HOME_LINK);
    expect(HOME_LINK).toEqual({ label: 'Home', href: '/' });
  });

  it('offers a homepage route from the footer exactly once', () => {
    // Home leads the footer explore list; it must not appear again now that
    // STATIC_NAV itself carries it.
    expect(FOOTER_EXPLORE[0]).toEqual({ label: 'Home', href: '/' });
    expect(FOOTER_EXPLORE.filter((link) => link.href === '/')).toHaveLength(1);
  });

  // FEAT-015 / risk_log R-011: all three must stay reachable from every page.
  it('exposes all three legal routes', () => {
    expect(FOOTER_LEGAL.map((link) => link.href)).toEqual(['/privacy', '/terms', '/about']);
  });
});
