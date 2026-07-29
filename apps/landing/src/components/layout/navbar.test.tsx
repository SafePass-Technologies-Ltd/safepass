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

    expect(screen.getByRole('link', { name: /safepass — home/i })).toHaveAttribute('href', '/');

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

  it('marks the active audience with aria-current, not colour alone', () => {
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

    // Simulate landing on a page that is not itself an audience page: the
    // stored selection, not the URL, must carry the state.
    unmount();
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    const selector = screen.getByRole('navigation', { name: /choose your audience/i });
    expect(within(selector).getByRole('link', { name: 'Business' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getAllByRole('link', { name: 'Request a Demo' }).length).toBeGreaterThan(0);
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

    expect(screen.getByRole('link', { name: /safepass — home/i })).toBeInTheDocument();

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

  it('applies no active audience state to any nav link', () => {
    renderNavbar({ showAudienceSelector: false });
    const siteNav = screen.getAllByRole('navigation', { name: 'Site' })[0];

    within(siteNav)
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  });
});
