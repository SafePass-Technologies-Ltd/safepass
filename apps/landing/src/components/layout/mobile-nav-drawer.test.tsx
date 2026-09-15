import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { AudienceProvider } from '@/lib/audience/audience-context';

/**
 * FEAT-001 — "Header collapses into a mobile nav drawer below the tablet
 * breakpoint", unified in T-037: the drawer presents the SAME six links as the
 * desktop header, in ONE consistent list, with the same URL-derived active
 * states. The modal contract (aria-modal, focus trap, Escape, focus return,
 * aria-expanded, scroll lock, exit animation) is asserted for real because
 * branding.md Section 4 treats it as a hard requirement.
 *
 * jsdom has no layout engine, so the breakpoint itself is asserted on the
 * responsive classes (the only thing that carries it — there is no JS media
 * query in this component by design); behaviour is asserted for real.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function renderDrawer() {
  return render(
    <AudienceProvider>
      <MobileNavDrawer />
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

  it('opens on trigger click with the full modal contract', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const dialog = screen.getByRole('dialog', { name: /site menu/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
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

  it('locks body scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
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

  describe('one consistent list (T-037)', () => {
    it('presents the SAME six links as the desktop header, in one section', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const dialog = screen.getByRole('dialog');

      // Exactly one site nav — the old split rendered an audience section
      // separate from an Explore section.
      const navs = within(dialog).getAllByRole('navigation', { name: 'Site' });
      expect(navs).toHaveLength(1);

      const links = within(navs[0]).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(SITE_LINKS);

      // No leftover audience-selector group.
      expect(
        within(dialog).queryByRole('navigation', { name: /choose your audience/i })
      ).not.toBeInTheDocument();
    });

    it('renders identically on legal pages — no variant, same six links', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/privacy';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const dialog = screen.getByRole('dialog');
      const siteNav = within(dialog).getAllByRole('navigation', { name: 'Site' })[0];

      const links = within(siteNav).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(SITE_LINKS);
    });

    it('closes when a link is tapped, so the overlay never covers the destination', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Home' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('URL-derived active states (T-037)', () => {
    it('marks the current page active in the list, with aria-current and the accent bar', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/business';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getByRole('navigation', {
        name: 'Site',
      });

      const current = within(siteNav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current.map((link) => link.textContent)).toEqual(['Business']);
      // Same accent treatment family as the header underline.
      expect(current[0].className).toContain('before:opacity-100');
 expect(current[0].className).toContain('bg-primary-light');
    });

    it('highlights nothing from the persisted audience that is not the page itself', async () => {
      // The T-034 bug's drawer half: after visiting /business, /how-we-verify
      // must not present Business as current. The context still drives the
      // CTA below — only the highlight is URL-derived, so the only current
      // link is the page's own.
      const user = userEvent.setup();
      window.sessionStorage.setItem('safepass:audience', 'business');
      mockPathname.value = '/how-we-verify';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getByRole('navigation', {
        name: 'Site',
      });

      for (const label of ['Home', 'Individual', 'Business', 'Transport Partner', 'About']) {
        expect(within(siteNav).getByRole('link', { name: label })).not.toHaveAttribute(
          'aria-current'
        );
      }
      const current = within(siteNav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current.map((link) => link.textContent)).toEqual(['How We Verify']);
      // Documented kept behaviour: the CTA still follows the session audience.
      expect(
        within(screen.getByRole('dialog')).getByRole('link', { name: 'Request a Demo' })
      ).toBeInTheDocument();
    });

    it('marks nothing active on /terms, and still lists all six links', async () => {
      const user = userEvent.setup();
      mockPathname.value = '/terms';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const siteNav = within(screen.getByRole('dialog')).getByRole('navigation', {
        name: 'Site',
      });

      const links = within(siteNav).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(SITE_LINKS);
      links.forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
    });
  });

  describe('the primary CTA', () => {
    it('renders the audience-matched CTA beneath the list', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      const dialog = screen.getByRole('dialog');

      const cta = within(dialog).getByRole('link', { name: 'Get the App' });
      expect(cta).toHaveAttribute('href', '/individual');
      expect(cta).toHaveClass('bg-primary');
    });

    it('follows the stored session audience on pages with no audience in the URL', async () => {
      const user = userEvent.setup();
      window.sessionStorage.setItem('safepass:audience', 'business');
      mockPathname.value = '/privacy';
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /open menu/i }));
      expect(
        within(screen.getByRole('dialog')).getByRole('link', { name: 'Request a Demo' })
      ).toBeInTheDocument();
    });
  });
});
