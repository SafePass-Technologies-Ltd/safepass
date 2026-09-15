import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from './navbar';
import { AudienceProvider } from '@/lib/audience/audience-context';

/**
 * FEAT-001 — Global Navigation & Audience Selector.
 *
 * Each `it` maps to one acceptance criterion in features.md. The persistence
 * criterion is exercised end-to-end through the real AudienceProvider rather
 * than a mock, because the criterion is about the selector and the session
 * store agreeing — mocking the store would assert nothing.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function renderNavbar(props: { showAudienceSelector?: boolean } = {}) {
  return render(
    <AudienceProvider>
      <Navbar {...props} />
    </AudienceProvider>
  );
}

beforeEach(() => {
  mockPathname.value = '/';
  window.sessionStorage.clear();
});

describe('Navbar — audience-selecting variant', () => {
  it('displays logo, all three audience options, and a primary CTA', () => {
    renderNavbar();

    expect(screen.getByRole('link', { name: /safepass home/i })).toHaveAttribute('href', '/');

    const selector = screen.getByRole('navigation', { name: /choose your audience/i });
    expect(within(selector).getByRole('link', { name: 'Individual' })).toBeInTheDocument();
    expect(within(selector).getByRole('link', { name: 'Business' })).toBeInTheDocument();
    expect(within(selector).getByRole('link', { name: 'Transport Partner' })).toBeInTheDocument();

    // Default audience is 'individual', so the header CTA is the app download.
    expect(screen.getAllByRole('link', { name: 'Get the App' }).length).toBeGreaterThan(0);
  });

  it("routes each audience option to that audience's dedicated page", () => {
    renderNavbar();
    const selector = screen.getByRole('navigation', { name: /choose your audience/i });

    expect(within(selector).getByRole('link', { name: 'Individual' })).toHaveAttribute(
      'href',
      '/individual'
    );
    expect(within(selector).getByRole('link', { name: 'Business' })).toHaveAttribute(
      'href',
      '/business'
    );
    expect(within(selector).getByRole('link', { name: 'Transport Partner' })).toHaveAttribute(
      'href',
      '/transport-partners'
    );
  });

  it('shows no audience pre-selected on the homepage', () => {
    // The homepage is the neutral entry point (client feedback): it must not
    // render "Individual" as selected by default, nor carry a stale session
    // selection back onto it. Each audience page highlights its own option.
    renderNavbar();
    const selector = screen.getByRole('navigation', { name: /choose your audience/i });

    within(selector)
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  });

  it('marks the active audience with aria-current on its own page, not colour alone', () => {
    mockPathname.value = '/individual';
    renderNavbar();
    const selector = screen.getByRole('navigation', { name: /choose your audience/i });

    expect(within(selector).getByRole('link', { name: 'Individual' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(selector).getByRole('link', { name: 'Business' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('persists the selected audience across navigation within the session', async () => {
    const user = userEvent.setup();
    const { unmount } = renderNavbar();

    await user.click(
      within(screen.getByRole('navigation', { name: /choose your audience/i })).getByRole('link', {
        name: 'Business',
      })
    );

    // Simulate landing on a page that is not itself an audience page. The
    // stored selection still carries the state: the header CTA stays
    // audience-matched (that behaviour is documented and kept). The chip
    // highlight, however, is page-scoped (T-034) — /how-we-verify must NOT
    // present "Business" as if the visitor were on /business.
    unmount();
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    const selector = screen.getByRole('navigation', { name: /choose your audience/i });
    within(selector)
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
    expect(screen.getAllByRole('link', { name: 'Request a Demo' }).length).toBeGreaterThan(0);
  });

  it('marks How We Verify active only on its own page, with aria-current (T-034)', () => {
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    const siteNav = screen.getAllByRole('navigation', { name: 'Site' })[0];
    expect(within(siteNav).getByRole('link', { name: 'How We Verify' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(siteNav).getByRole('link', { name: 'About' })).not.toHaveAttribute(
      'aria-current'
    );
    // Not colour alone, and not the persisted context either: while the
    // highlight flips, background/border tokens (bg-primary-light,
    // border-primary) stay exactly the audience selector's Active treatment.
    expect(within(siteNav).getByRole('link', { name: 'How We Verify' })).toHaveClass(
      'bg-primary-light',
      'border-primary'
    );
  });

  it('places an explicit Home link before the audience selector (T-034)', () => {
    renderNavbar();
    const header = screen.getByRole('banner');
    const all = within(header).getAllByRole('link');
    const logo = within(header).getByRole('link', { name: /safepass home/i });

    expect(within(header).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    // Home must sit BEFORE the selector's first link in reading order.
    expect(all.indexOf(within(header).getByRole('link', { name: 'Home' }))).toBeLessThan(
      all.indexOf(within(header).getByRole('link', { name: 'Individual' }))
    );
    // The logo still links home — unchanged alongside the new link.
    expect(logo).toHaveAttribute('href', '/');
  });

  it('marks Home active on the homepage', () => {
    renderNavbar();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('matches the audience set by a deep link rather than defaulting to Individual', () => {
    mockPathname.value = '/transport-partners';
    renderNavbar();

    const selector = screen.getByRole('navigation', { name: /choose your audience/i });
    expect(within(selector).getByRole('link', { name: 'Transport Partner' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getAllByRole('link', { name: 'Partner With Us' }).length).toBeGreaterThan(0);
  });

  it('stays fixed and above page content so scroll motion never obscures it', () => {
    const { container } = renderNavbar();
    const header = container.querySelector('header');

    // branding.md Section 2 + Section 8 (Fixed UI, parallax multiplier 0x).
    expect(header).toHaveClass('sticky', 'top-0', 'z-50');
  });
});

describe('Navbar — non-audience-selecting variant (legal pages)', () => {
  beforeEach(() => {
    mockPathname.value = '/privacy';
  });

  it('renders no audience selector but keeps the logo, nav links, and a CTA', () => {
    renderNavbar({ showAudienceSelector: false });

    expect(
      screen.queryByRole('navigation', { name: /choose your audience/i })
    ).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /safepass home/i })).toBeInTheDocument();

    const siteNav = screen.getAllByRole('navigation', { name: 'Site' })[0];
    expect(within(siteNav).getByRole('link', { name: 'Individual' })).toHaveAttribute(
      'href',
      '/individual'
    );
    expect(within(siteNav).getByRole('link', { name: 'How We Verify' })).toHaveAttribute(
      'href',
      '/how-we-verify'
    );

    expect(screen.getAllByRole('link', { name: 'Get the App' }).length).toBeGreaterThan(0);
  });

  it('applies no active audience state to any nav link on the privacy page', () => {
    // The static variant carries Home + audiences + How We Verify + About, but
    // none of them IS /privacy — nothing may read as current (T-034).
    renderNavbar({ showAudienceSelector: false });
    const siteNav = screen.getAllByRole('navigation', { name: 'Site' })[0];

    within(siteNav)
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  });

  it('leads its nav with the explicit Home link (T-034)', () => {
    renderNavbar({ showAudienceSelector: false });
    const siteNav = screen.getAllByRole('navigation', { name: 'Site' })[0];

    expect(within(siteNav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    const links = within(siteNav).getAllByRole('link');
    expect(links[0]).toBe(within(siteNav).getByRole('link', { name: 'Home' }));
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Individual',
      'Business',
      'Transport Partner',
      'How We Verify',
      'About',
    ]);
  });
});
