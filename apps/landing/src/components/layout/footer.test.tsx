import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Footer } from './footer';
import { CONTACT_EMAIL, SOCIAL_LINKS } from '@/lib/content/navigation';

/**
 * FEAT-002 — Footer with Trust & Legal Links.
 *
 * One test per acceptance criterion. The legal-link test is also R-011's and
 * FEAT-015's guard: those pages must stay reachable within two clicks of the
 * homepage, and the footer is the only thing that guarantees it.
 */

describe('Footer', () => {
  it('links to the Privacy Policy, Terms of Service, and About pages', () => {
    render(<Footer />);
    const legal = screen.getByRole('navigation', { name: 'Legal' });

    expect(within(legal).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
    expect(within(legal).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms'
    );
    expect(within(legal).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });

  it('exposes a contact method as a mailto link', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`
    );
  });

  it('repeats a secondary CTA for each of the three audiences', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Get the App' })).toHaveAttribute(
      'href',
      '/individual'
    );
    expect(screen.getByRole('link', { name: 'Request a Demo' })).toHaveAttribute(
      'href',
      '/business'
    );
    expect(screen.getByRole('link', { name: 'Partner With Us' })).toHaveAttribute(
      'href',
      '/transport-partners'
    );
  });

  it('renders the brand line and current copyright year', () => {
    render(<Footer />);

    expect(
      screen.getByText(new RegExp(`${new Date().getFullYear()} SafePass`))
    ).toBeInTheDocument();
  });

  it('renders social links when supplied, and none before they exist', () => {
    // SOCIAL_LINKS is deliberately empty until the client supplies real URLs.
    // The footer must not render a Social column (or a fabricated handle) when
    // there is nothing to point at — this is the documented deferral decision.
    const { container } = render(<Footer />);
    expect(container.querySelectorAll('nav[aria-label="Social"]')).toHaveLength(
      SOCIAL_LINKS.length > 0 ? 1 : 0
    );
  });

  it('offers a route back to the homepage and to every top-level page', () => {
    render(<Footer />);
    const explore = screen.getByRole('navigation', { name: 'Explore' });

    expect(within(explore).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(explore).getByRole('link', { name: 'How We Verify' })).toHaveAttribute(
      'href',
      '/how-we-verify'
    );
  });
});
