import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { AudienceProvider } from '@/lib/audience/audience-context';

/**
 * FEAT-001 — "Header collapses into a mobile nav drawer below the tablet
 * breakpoint", plus branding.md Section 4's accessibility requirements, which
 * are treated as hard requirements rather than polish.
 *
 * jsdom has no layout engine, so the breakpoint itself is asserted on the
 * responsive classes (the only thing that carries it — there is no JS media
 * query in this component by design); behaviour is asserted for real.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function renderDrawer(showAudienceSelector = true) {
  return render(
    <AudienceProvider>
      <MobileNavDrawer showAudienceSelector={showAudienceSelector} />
    </AudienceProvider>
  );
}

beforeEach(() => {
  mockPathname.value = '/';
  window.sessionStorage.clear();
});

describe('MobileNavDrawer', () => {
  it('is hidden at and above the tablet breakpoint', () => {
    const { container } = renderDrawer();
    expect(container.firstElementChild).toHaveClass('md:hidden');
  });

  it('starts closed with aria-expanded=false and no dialog in the DOM', () => {
    renderDrawer();

    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on trigger click, exposing the selector, nav, and CTA', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const dialog = screen.getByRole('dialog', { name: /site menu/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    expect(
      within(dialog).getByRole('navigation', { name: /choose your audience/i })
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'How We Verify' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Get the App' })).toBeInTheDocument();
  });

  it('carries shadow-lg, the elevation branding.md 3.4 assigns the drawer', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('dialog')).toHaveClass('shadow-lg');
  });

  it('moves focus into the panel on open and back to the trigger on close', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole('button', { name: /open menu/i });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');

    // The drawer animates out over `duration-normal` before unmounting; wait for
    // it to leave the DOM, then confirm focus returned to the trigger (it lands
    // in the effect cleanup, which runs just after the portal is removed).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }))
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    // Exit is animated, so the dialog unmounts after the transition.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('traps Tab focus inside the panel while open', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog');
    const focusable = within(dialog).getAllByRole('link');
    const last = focusable[focusable.length - 1];

    last.focus();
    await user.tab();

    // Wraps to the first item rather than escaping to the page behind.
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('omits the audience selector in the non-audience-selecting variant, showing plain links instead', async () => {
    const user = userEvent.setup();
    mockPathname.value = '/privacy';
    renderDrawer(false);

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog');

    expect(
      within(dialog).queryByRole('navigation', { name: /choose your audience/i })
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Business' })).toHaveAttribute(
      'href',
      '/business'
    );
  });

  describe('page-scoped active states (T-034)', () => {
    it('marks an audience row active only while the visitor is on that page', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/business';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const dialog = screen.getByRole('dialog');

      // jsdom flattens the row's spans into the accessible name "BusinessSelected".
      expect(within(dialog).getByRole('link', { name: /Business/ })).toHaveAttribute(
        'aria-current',
        'page'
      );
      expect(
        within(dialog).getByRole('link', { name: /Individual/ })
      ).not.toHaveAttribute('aria-current');
    });

    it('highlights nothing when the persisted audience does not match the page', async () => {
      // The T-034 bug's drawer half: after choosing Business, /how-we-verify
      // used to show the Business row as "Selected". The context still drives
      // the CTA below — only the highlight is page-scoped now.
      const user = userEvent.setup();
      window.sessionStorage.setItem('safepass:audience', 'business');
      mockPathname.value = '/how-we-verify';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const dialog = screen.getByRole('dialog');

      // No AUDIENCE row may read as current: the persisted context says
      // Business, but the visitor is on /how-we-verify, which is nobody's
      // audience page. (The Explore section's own page-scoped active state —
      // How We Verify here — is asserted in the test below.)
      const audienceNav = within(dialog).getByRole('navigation', {
        name: /choose your audience/i,
      });
      within(audienceNav)
        .getAllByRole('link')
        .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
      // Documented kept behaviour: the CTA still follows the session audience.
      expect(within(dialog).getByRole('link', { name: 'Request a Demo' })).toBeInTheDocument();
    });

    it('marks How We Verify active in the Explore section on its own page', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/how-we-verify';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getAllByRole('navigation', {
        name: 'Site',
      })[0];

      expect(within(siteNav).getByRole('link', { name: 'How We Verify' })).toHaveAttribute(
        'aria-current',
        'page'
      );
      expect(within(siteNav).getByRole('link', { name: 'About' })).not.toHaveAttribute(
        'aria-current'
      );
      // Same Active chip tokens as the header's audience selector, so the
      // drawer speaks the page's one active-state language.
      expect(within(siteNav).getByRole('link', { name: 'How We Verify' })).toHaveClass(
        'bg-primary-light',
        'border-primary'
      );
    });

    it('marks Home active in Explore on the homepage, and first in the section', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getAllByRole('navigation', {
        name: 'Site',
      })[0];

      const home = within(siteNav).getByRole('link', { name: 'Home' });
      expect(home).toHaveAttribute('href', '/');
      expect(home).toHaveAttribute('aria-current', 'page');
      expect(within(siteNav).getAllByRole('link')[0]).toBe(home);
    });

    it('marks nothing active on the legal variant, and still lists Home first', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/terms';
      renderDrawer(false);

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getAllByRole('navigation', {
        name: 'Site',
      })[0];

      const links = within(siteNav).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        'Home',
        'Individual',
        'Business',
        'Transport Partner',
        'How We Verify',
        'About',
      ]);
      links.forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
    });
  });
});
