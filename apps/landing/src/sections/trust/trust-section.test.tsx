import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustSection } from './trust-section';
import { TRUST } from '@/lib/content/trust';

/**
 * Homepage trust section — client-requested layer between Hero and How It Works.
 *
 * The value of this section is presence and crawlability (it states operating
 * principles, not statistics, so there is no source/date to assert — R-007
 * applies to figures). The assertions therefore check that every principle and
 * every transparency link ships in the server-rendered markup.
 */
describe('TrustSection', () => {
  it('states every operating principle with the heading', () => {
    render(<TrustSection />);

    expect(
      screen.getByRole('heading', { name: /trusted by people travelling nigeria/i })
    ).toBeInTheDocument();

    for (const principle of TRUST.principles) {
      expect(screen.getByText(principle)).toBeInTheDocument();
    }
  });

  it('pairs every principle with a decorative check icon, never colour alone', () => {
    const { container } = render(<TrustSection />);

    const checks = container.querySelectorAll('[aria-hidden="true"] svg');
    expect(checks.length).toBeGreaterThanOrEqual(TRUST.principles.length);
  });

  it('exposes a transparency nav with all three links', () => {
    render(<TrustSection />);

    const nav = screen.getByRole('navigation', { name: /transparency/i });
    for (const link of TRUST.links) {
      const anchor = screen.getByRole('link', { name: new RegExp(link.label, 'i') });
      expect(anchor).toHaveAttribute('href', link.href);
      expect(nav.contains(anchor)).toBe(true);
    }
  });

  it('keeps the principles in the markup a crawler receives', () => {
    const { container } = render(<TrustSection />);
    for (const principle of TRUST.principles) {
      expect(container.innerHTML).toContain(principle);
    }
  });
});
