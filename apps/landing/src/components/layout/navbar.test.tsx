import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from './navbar';
import { AudienceProvider } from '@/lib/audience/audience-context';

/**
 * FEAT-001 — Global Navigation, as unified in T-037.
 *
 * The client's feedback was blunt: the header mixed two treatments (plain
 * text links vs. a chip AudienceSelector) and the legal pages rendered a third
 * variant. These tests pin the redesign: ONE nav, ONE treatment, identical on
 * every page, active state derived from the URL only, and the primary CTA
 * audience-matched by the session context on pages whose URL carries no
 * audience.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function renderNavbar() {
  return render(
    <AudienceProvider>
      <Navbar />
    </AudienceProvider>
  );
}

const SITE_LINKS = [
  'Home',
  'Individual',
  'Business',
  'Transport Partner',
  'How We Verify',
  'About',
];

function getSiteNav() {
  return screen.getAllByRole('navigation', { name: 'Site' })[0];
}

beforeEach(() => {
  mockPathname.value = '/';
  window.sessionStorage.clear();
});

describe('Navbar — one unified nav on every page', () => {
  it('renders all six links in one site nav, in screens.md order', () => {
    renderNavbar();

    const links = within(getSiteNav()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(SITE_LINKS);
  });

  it('routes every link to its real href — URL-native navigation, no onClick routing', () => {
    renderNavbar();

    const expected = ['/', '/individual', '/business', '/transport-partners', '/how-we-verify', '/about'];
    within(getSiteNav())
      .getAllByRole('link')
      .forEach((link, index) => expect(link).toHaveAttribute('href', expected[index]));
  });

  it('gives all six links the SAME treatment — no chip group, no two-class split', () => {
    // T-037's core complaint. On a page where nothing is active and no
    // floating state applies, every link resolves to the IDENTICAL class
    // string — the only differences elsewhere are the active/floating state
    // tokens, never a per-item treatment. The old audience chips' bordered/
    // filled classes must not appear on any link.
    mockPathname.value = '/privacy';
    renderNavbar();

    const links = within(getSiteNav()).getAllByRole('link');
    const baseClasses = links[0].className;
    for (const link of links.slice(1)) {
      expect(link.className).toBe(baseClasses);
    }
    for (const link of links) {
      expect(link.className).not.toContain('border-border');
      expect(link.className).not.toContain('bg-surface-secondary');
    }
  });

  it('keeps the audience pages reachable without any separate selector', () => {
    // The old component was <nav aria-label="Choose your audience">; its
    // absence is the point — but the destinations must still be one click away.
    renderNavbar();

    expect(screen.queryByRole('navigation', { name: /choose your audience/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Individual' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Business' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transport Partner' })).toBeInTheDocument();
  });

  it('stays fixed and above page content so scroll motion never obscures it', () => {
    const { container } = renderNavbar();
    const header = container.querySelector('header');

    // branding.md Section 2 + Section 8 (Fixed UI, parallax multiplier 0x).
    expect(header).toHaveClass('sticky', 'top-0', 'z-50');
  });
});

describe('Navbar — URL-derived active states', () => {
  it.each([
    ['/', 'Home'],
    ['/individual', 'Individual'],
    ['/business', 'Business'],
    ['/transport-partners', 'Transport Partner'],
    ['/how-we-verify', 'How We Verify'],
    ['/about', 'About'],
  ])('marks exactly %s active on %s with aria-current', (pathname, label) => {
    mockPathname.value = pathname;
    renderNavbar();

    const links = within(getSiteNav()).getAllByRole('link');
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it('marks nothing active on /privacy — no item IS that page', () => {
    mockPathname.value = '/privacy';
    renderNavbar();

    within(getSiteNav())
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  });

  it('marks nothing active on /terms', () => {
    mockPathname.value = '/terms';
    renderNavbar();

    within(getSiteNav())
      .getAllByRole('link')
      .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  });

  it('highlights nothing from the persisted audience — only the URL (T-034 regression)', () => {
    // The client's earlier bug: Business stayed lit on /how-we-verify because
    // the highlight followed the session audience. The context may still drive
    // the CTA, but it must never drive the highlight. On /how-we-verify the
    // How We Verify link IS current (it is the page); the assertion is that
    // no AUDIENCE link carries the state.
    window.sessionStorage.setItem('safepass:audience', 'business');
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    const links = within(getSiteNav()).getAllByRole('link');
    for (const label of ['Home', 'Individual', 'Business', 'Transport Partner', 'About']) {
      expect(within(getSiteNav()).getByRole('link', { name: label })).not.toHaveAttribute(
        'aria-current'
      );
    }
    // Exactly one link is current, and it is the page's own.
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['How We Verify']);
  });

  it('applies the active visual treatment to exactly the current page', () => {
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    const active = within(getSiteNav()).getByRole('link', { name: 'How We Verify' });
    const inactive = within(getSiteNav()).getByRole('link', { name: 'About' });

    // Active: accent text colour + visible underline. Inactive: quiet text,
    // underline rail present but transparent (so no layout shift on toggle).
    expect(active.className).not.toBe(inactive.className);
    expect(active.className).toContain('text-text-primary');
    expect(inactive.className).toContain('text-text-secondary');
    expect(active.className).toContain('after:opacity-100');
    expect(inactive.className).toContain('after:opacity-0');
  });
});

describe('Navbar — the primary CTA', () => {
  it('renders the primary CTA after the nav links, as the only button-like element', () => {
    renderNavbar();

    const header = screen.getByRole('banner');
    const cta = within(header).getByRole('link', { name: 'Get the App' });

    // Default session audience is individual: the consumer app download.
    expect(cta).toHaveAttribute('href', '/individual');
    // Filled treatment, distinct from the ghost nav links.
    expect(cta).toHaveClass('bg-primary');
  });

  it('keeps the CTA audience-matched after the visitor chose an audience (session continuity)', async () => {
    // user_flow.md's persistence global flow: a Business visitor must keep
    // seeing "Request a Demo" on pages whose URL carries no audience.
    const user = userEvent.setup();
    const { unmount } = renderNavbar();

    // Choose Business by visiting its page (the URL is the only writer now).
    mockPathname.value = '/business';
    unmount();
    renderNavbar();

    // Move on to a page with no audience in the URL. The stored choice —
    // adopted from the /business pathname — keeps the CTA matched.
    unmount();
    mockPathname.value = '/how-we-verify';
    renderNavbar();

    await user.tab(); // interaction sanity: nothing routes on click handlers
    expect(screen.getAllByRole('link', { name: 'Request a Demo' }).length).toBeGreaterThan(0);
  });

  it('lets a deep link override the stored audience for the CTA', () => {
    // The URL is the more recent, more explicit signal of intent.
    window.sessionStorage.setItem('safepass:audience', 'individual');
    mockPathname.value = '/transport-partners';
    renderNavbar();

    expect(screen.getAllByRole('link', { name: 'Partner With Us' }).length).toBeGreaterThan(0);
  });
});

describe('Navbar — floating-over-hero state', () => {
  it('switches the nav links to the on-dark treatment while floating', () => {
    renderNavbar(); // homepage, unscrolled

    const inactive = within(getSiteNav()).getByRole('link', { name: 'About' });
    // White text over the always-dark hero — text-text-secondary is dark
    // slate in light mode and would vanish.
    expect(inactive.className).toContain('text-white/80');
  });

  it('renders the normal treatment on pages without a dark hero band', () => {
    mockPathname.value = '/privacy';
    renderNavbar();

    const inactive = within(getSiteNav()).getByRole('link', { name: 'About' });
    expect(inactive.className).toContain('text-text-secondary');
    expect(inactive.className).not.toContain('text-white/80');
  });
});
