import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SafetyDataStat } from '@safepass/shared';
import { gsap } from '@/lib/motion/gsap';
import { StatCallout, parseStatValue } from './stat-callout';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Regression guard for a published-wrong-number bug.
 *
 * GSAP's `fromTo` renders its `from` state immediately on creation, even when a
 * ScrollTrigger defers the tween. The count-up therefore overwrote the
 * server-rendered figure with 0 at mount, so every stat below the fold read
 * "₦0" until the visitor scrolled it into view — on the page whose whole
 * purpose is proving SafePass's figures are trustworthy (risk_log.md R-007).
 *
 * The static-markup crawlability tests could not catch this: the server HTML was
 * always correct. Only the mounted, hydrated component was wrong.
 */

const PRICE_STAT: SafetyDataStat = {
  statId: 'journey-fee',
  label: 'Cost of a monitored journey',
  value: '₦2,000',
  verificationTier: 'verified',
  source: 'SafePass published pricing',
  asOfDate: '2026-07-27',
};

describe('StatCallout', () => {
  it('defers the count-up render so a below-fold stat is never shown as zero', () => {
    /**
     * This asserts the `immediateRender: false` flag directly, which is
     * unusually implementation-shaped for a test — deliberately so.
     *
     * The flag IS the requirement. Without it GSAP writes the tween's `from`
     * state (0) during the effect, before any frame runs and before the
     * ScrollTrigger has a say, so every stat below the fold displayed "₦0"
     * until scrolled into view.
     *
     * It cannot be asserted through rendered output here: jsdom has no layout,
     * so ScrollTrigger can never defer, and the tween runs immediately no
     * matter what the flag says. The rendered-output proof lives in the browser
     * verification step; this guards the flag from being removed.
     */
    const fromTo = vi.spyOn(gsap, 'fromTo');
    render(<StatCallout stat={PRICE_STAT} />);

    expect(fromTo).toHaveBeenCalled();
    const vars = fromTo.mock.calls[0][2] as { immediateRender?: boolean };
    expect(vars.immediateRender).toBe(false);
  });

  it('settles on the true figure once the count-up finishes', async () => {
    // jsdom has no layout, so ScrollTrigger cannot gate the tween and it runs
    // straight away — which conveniently lets the completion state be asserted.
    const { container } = render(<StatCallout stat={PRICE_STAT} />);
    await new Promise((resolve) => setTimeout(resolve, 1400));

    expect(container.querySelector('[data-stat-id] span')?.textContent).toBe(PRICE_STAT.value);
  });

  it('renders its source and as-of date alongside the figure (R-007)', () => {
    render(<StatCallout stat={PRICE_STAT} />);
    expect(screen.getByText(/SafePass published pricing/)).toBeInTheDocument();
    expect(screen.getByText(/27 July 2026/)).toBeInTheDocument();
  });

  it('pairs the tier with an icon and text label, never colour alone', () => {
    render(<StatCallout stat={PRICE_STAT} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});

describe('parseStatValue', () => {
  it('splits a currency figure into prefix, amount, and grouping', () => {
    expect(parseStatValue('₦2,000')).toEqual({
      prefix: '₦',
      amount: 2000,
      suffix: '',
      grouped: true,
    });
  });

  it('splits a suffixed figure', () => {
    expect(parseStatValue('5+')).toEqual({ prefix: '', amount: 5, suffix: '+', grouped: false });
  });

  it('returns a null amount for a qualitative value so nothing is animated', () => {
    // A stat with no number must not be faked into a count-up.
    expect(parseStatValue('Verified daily').amount).toBeNull();
  });
});
