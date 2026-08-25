import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from './hero-section';
import { HERO } from '@/lib/content/hero';
import { ScrollTrigger } from '@/lib/motion/gsap';

/**
 * FEAT-003 — Homepage Hero Sequence.
 *
 * One test per acceptance criterion, plus the states listed in
 * `screens/01-homepage.md` (Loading, Loaded full-motion, reduced-motion
 * fallback, Error) and Flow 1's Alternate Path A.
 *
 * The recurring assertion across almost all of them is the same one: the
 * headline, the sentence, and the CTAs are in the DOM. That is the point. A
 * hero whose copy depends on an animation having run is a hero that fails for
 * the visitor on the worst connection — which is Amaka, the persona it is
 * written for.
 */

/**
 * Pins the motion profile for a test.
 *
 * The DEFAULT here is the mobile profile, and deliberately so. jsdom has no
 * layout, so ScrollTrigger's desktop pin re-parents the hero into a pin spacer
 * with zero measured height — which breaks React's own unmount, not the
 * component. The desktop path is therefore asserted at the level jsdom can
 * actually speak to (that a pinned, scrubbed trigger is created) in its own
 * test below, and the content assertions run on the mobile profile, which is
 * also Amaka's real context (user_personas.md).
 */
function setMotionProfile({ reduce = false, mobile = true } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduce
      : query.includes('max-width')
        ? mobile
        : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  setMotionProfile();
});

afterEach(() => {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  vi.restoreAllMocks();
  setMotionProfile();
});

describe('FEAT-003 acceptance criteria', () => {
  it('renders the headline and the one-sentence explanation', () => {
    render(<HeroSection />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(HERO.headline);
    expect(screen.getByText(HERO.subheadline)).toBeInTheDocument();
  });

  it('exposes exactly one H1, announced as a single clean sentence', () => {
    render(<HeroSection />);

    // The visible headline is split into animatable line spans; a screen reader
    // must still hear one sentence, not "Every Journey" / "Matters."
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName('Every Journey Matters.');
  });

  it('renders a primary CTA leading to the app download', () => {
    render(<HeroSection />);

    expect(
      screen.getByRole('link', { name: /download safepass on the app store/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get safepass on google play/i })).toBeInTheDocument();
  });

  it('offers the individual path as a secondary action', () => {
    render(<HeroSection />);

    expect(screen.getByRole('link', { name: HERO.secondaryCta.label })).toHaveAttribute(
      'href',
      HERO.secondaryCta.href
    );
  });

  it('never pins the hero at any breakpoint', () => {
    /**
     * GSAP's pin wraps the hero in a `.pin-spacer` div it owns, re-parenting a
     * node React created — and React then cannot remove it, which crashed every
     * client-side navigation with "The node to be removed is not a child of
     * this node". The hero no longer holds at all (client feedback: a held hero
     * "waits until the route line is fully drawn", making scroll feel broken),
     * so no trigger may pin AND none may scrub an oversized track.
     */
    setMotionProfile({ mobile: false });

    const { unmount } = render(<HeroSection />);

    const scrubbed = ScrollTrigger.getAll().filter((trigger) => trigger.vars.scrub);
    expect(scrubbed).toHaveLength(0);

    const pinned = ScrollTrigger.getAll().filter((trigger) => trigger.vars.pin);
    expect(pinned).toHaveLength(0);

    // Unmount must now succeed against a normal, attached container — the
    // detached-container workaround this test used to need was itself a symptom
    // of the navigation bug.
    expect(() => unmount()).not.toThrow();
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  });

  it('renders the full static composed state under prefers-reduced-motion', () => {
    setMotionProfile({ reduce: true });
    render(<HeroSection />);

    // Alternate Path A: "Content and CTAs remain fully present and functional;
    // only the motion layer is removed."
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(HERO.headline);
    expect(screen.getByText(HERO.subheadline)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /download safepass on the app store/i })
    ).toBeInTheDocument();

    // No `from` state was ever applied, so nothing is left mid-wipe.
    const line = document.querySelector('[data-hero-line]');
    expect(line).not.toBeNull();
    expect((line as HTMLElement).style.clipPath).toBe('');
  });
});

describe('hero states (screens/01-homepage.md)', () => {
  it('Loading — the copy is in the markup, not injected by the motion layer', () => {
    const { container } = render(<HeroSection />);

    // Asserted against the raw HTML rather than the accessibility tree: this is
    // specifically the "visible before any motion-layer JavaScript loads"
    // requirement for the slow-connection edge case.
    expect(container.innerHTML).toContain('Every Journey');
    expect(container.innerHTML).toContain(HERO.subheadline);
  });

  it('Error — decorative surfaces never block the content layer', () => {
    // jsdom provides no 2D context, so both canvases take exactly the branch a
    // browser takes when context creation fails. The hero must be unaffected.
    render(<HeroSection />);

    expect(screen.getByTestId('route-line-canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('radar-sweep-canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('marks every decorative layer aria-hidden', () => {
    const { container } = render(<HeroSection />);

    const stage = screen.getByTestId('hero-stage');
    const decorative = stage.querySelectorAll('.pointer-events-none');
    expect(decorative.length).toBeGreaterThan(0);
    decorative.forEach((layer) => {
      // Either the layer itself or an ancestor carries aria-hidden.
      expect(layer.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    expect(container.querySelector('canvas[aria-hidden="true"]')).not.toBeNull();
  });

  it('provides a real anchor into How It Works (Flow 1 step 3)', () => {
    render(<HeroSection />);

    expect(screen.getByRole('link', { name: new RegExp(HERO.scrollCue, 'i') })).toHaveAttribute(
      'href',
      '#how-it-works'
    );
  });
});
