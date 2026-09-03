import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CredibilityPreview, CredibilitySection } from './credibility-section';
import { StatCallout, parseStatValue } from './stat-callout';
import { SAFETY_DATA_STATS, getStat } from '@/lib/content/safety-data-stats';
import { SOURCES } from '@/lib/content/credibility';

/**
 * FEAT-005 acceptance criteria — one test per criterion, plus the shared-module
 * requirement from screens.md's Cross-Screen Notes.
 *
 * These render synchronously with no user interaction anywhere, which is the
 * test of the "not gated behind interaction-only reveal" criterion: if any of
 * this content only appeared after a scroll or a click, every assertion below
 * would fail.
 */

describe('CredibilitySection (FEAT-005)', () => {
  it('explains all three cold-start layers in public-appropriate language', () => {
    render(<CredibilitySection />);

    expect(screen.getAllByText(/Analyst curation, before launch/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Crowdsourcing, from day one onward/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Confidence scoring/i).length).toBeGreaterThan(0);

    // Layer 1's sourcing is the substance, not the heading.
    expect(
      screen.getByText(/areas with repeated publicly reported kidnapping incidents/i)
    ).toBeInTheDocument();
  });

  it('explains all five verification tiers, each with a text label alongside its colour', () => {
    render(<CredibilitySection />);

    for (const label of ['Verified', 'Partially Confirmed', 'Unverified', 'Disputed', 'Rejected']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('renders every stat with its source and a visible as-of date', () => {
    const { container } = render(<CredibilitySection />);

    for (const stat of SAFETY_DATA_STATS) {
      const figure = container.querySelector(`[data-stat-id="${stat.statId}"]`);
      expect(figure, `no call-out rendered for ${stat.statId}`).not.toBeNull();

      const scope = within(figure as HTMLElement);
      expect(scope.getByText(new RegExp(stat.source.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))).toBeInTheDocument();
      expect(figure!.querySelector(`time[datetime="${stat.asOfDate}"]`)).not.toBeNull();
    }
  });

  it('serves the real stat values in the server-rendered HTML a crawler receives', () => {
    // Rendered on the server, with no effects and no client JS at all — this
    // is literally the markup a crawler indexes. The count-up rewrites the
    // number after hydration, so asserting on the client render would test the
    // animation rather than the crawlability criterion.
    const html = renderToStaticMarkup(<CredibilitySection />);

    for (const stat of SAFETY_DATA_STATS) {
      expect(html).toContain(stat.label);
      expect(html).toContain(stat.source);
      expect(html).toContain(stat.asOfDate);
    }
    expect(html).toContain('5+');
  });

  it('uses the monospace stat type token for the value', () => {
    const stat = getStat('verification-tiers');
    const html = renderToStaticMarkup(<StatCallout stat={stat} />);

    expect(html).toMatch(/class="[^"]*font-mono[^"]*text-stat[^"]*"/);
  });

  it('states the content-review commitment (R-007)', () => {
    render(<CredibilitySection />);
    expect(screen.getByText(/reviewed at least quarterly/i)).toBeInTheDocument();
  });

  it('explains how quickly information changes', () => {
    render(<CredibilitySection />);
    expect(
      screen.getByRole('heading', { name: /how quickly information changes/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/remain alert and exercise personal judgement/i)).toBeInTheDocument();
    expect(screen.getByText(/updated, downgraded, or removed/i)).toBeInTheDocument();
  });

  it('lists its sources as named source types, not figures', () => {
    render(<CredibilitySection />);
    expect(screen.getByRole('heading', { name: /where the information comes from/i })).toBeInTheDocument();

    for (const source of SOURCES.items) {
      expect(screen.getByText(source)).toBeInTheDocument();
    }
  });

  it('renders the module heading as an h1 when standalone and an h2 when embedded', () => {
    const { unmount } = render(<CredibilitySection headingLevel="h1" />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    unmount();

    render(<CredibilitySection headingLevel="h2" />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});

describe('CredibilityPreview (shared module, screens.md Cross-Screen Notes)', () => {
  it('links through to the full methodology page', () => {
    render(<CredibilityPreview />);

    const link = screen.getByRole('link', { name: /see the full methodology/i });
    expect(link).toHaveAttribute('href', '/how-we-verify');
  });

  it('draws its stat from the same sourced content as the full module', () => {
    const stat = getStat('confirmations-to-verified');
    const html = renderToStaticMarkup(<CredibilityPreview statId="confirmations-to-verified" />);

    expect(html).toContain('data-stat-id="confirmations-to-verified"');
    expect(html).toContain(stat.source);
    expect(html).toContain(stat.asOfDate);
  });
});

describe('parseStatValue', () => {
  it('splits a currency-prefixed grouped value', () => {
    expect(parseStatValue('₦2,000')).toEqual({
      prefix: '₦',
      amount: 2000,
      suffix: '',
      grouped: true,
    });
  });

  it('splits a suffixed value', () => {
    expect(parseStatValue('5+')).toEqual({ prefix: '', amount: 5, suffix: '+', grouped: false });
  });

  it('returns no amount for a value with no digits, so nothing is animated', () => {
    expect(parseStatValue('Quarterly').amount).toBeNull();
  });
});
