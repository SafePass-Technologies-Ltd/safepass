import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollTrigger } from '@/lib/motion/gsap';
import { HeroStage } from './hero-stage';

/**
 * Reduced-motion profile for every test in this file.
 *
 * Not incidental: jsdom has no layout, so ScrollTrigger's desktop pin
 * re-parents the hero into a pin spacer of zero measured height, which breaks
 * React's unmount and hangs the vitest worker (see the same note in
 * hero-section.test.tsx). Under reduced motion no GSAP runs at all, leaving the
 * markup — which is what these assertions are about — cleanly inspectable.
 */
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Regression guard for the hero's pin start position.
 *
 * The header is `sticky`, so it occupies 64px of normal document flow. That
 * pushed the hero down by exactly that much, which meant ScrollTrigger's
 * `start: 'top top'` could not fire until the visitor had already scrolled
 * 64px — the hero visibly lurched upward and only THEN froze into its pin,
 * reading as a stutter rather than a deliberate sequence.
 *
 * The fix couples three values that must stay in agreement: the header's
 * height, the hero's negative top margin, and the hero's compensating top
 * padding — all sourced from the single `--size-header` token. These
 * assertions fail if any of them is dropped.
 *
 * The scroll behaviour itself needs real layout and is verified in the browser;
 * jsdom cannot pin anything.
 */
describe('HeroStage', () => {
  it('offsets itself by exactly the header height so its pin starts at scroll 0', () => {
    render(
      <HeroStage>
        <h1>Every Journey Matters.</h1>
      </HeroStage>
    );

    const track = screen.getByTestId('hero-stage');
    expect(track.className).toContain('-mt-(--size-header)');
    // Padding must put back exactly what the negative margin removed, or the
    // headline slides under the header.
    expect(track.querySelector('.sticky')?.className).toContain('pt-(--size-header)');
  });

  it('holds the hero with CSS sticky, never a ScrollTrigger pin', () => {
    /**
     * `pin: true` wraps the pinned element in a `.pin-spacer` div, re-parenting
     * a node React owns. On client-side navigation React then calls
     * `removeChild` on a node whose parent it no longer is and throws "The node
     * to be removed is not a child of this node" — every page transition died
     * into the error boundary.
     *
     * The hold is therefore CSS: a `.hero-track` taller than the viewport with
     * a `sticky` stage inside. Restoring the GSAP pin would reintroduce the
     * navigation crash.
     */
    render(
      <HeroStage>
        <h1>Every Journey Matters.</h1>
      </HeroStage>
    );

    const track = screen.getByTestId('hero-stage');
    expect(track.className).toContain('hero-track');
    expect(track.querySelector('.sticky')).not.toBeNull();
  });

  it('drives the route line by timeline on mobile, where there is no scroll range', () => {
    /**
     * On mobile branding.md §8 removes the hero pin, so `.hero-track` is
     * exactly one viewport tall — which makes the route line's ScrollTrigger
     * `start: 'top top'` and `end: 'bottom bottom'` resolve to the SAME scroll
     * position. Scrubbing across a zero-length range snapped the line from 0 to
     * 1 the instant the visitor scrolled: no traversal at all, on the persona
     * (Amaka) the hero is written for.
     *
     * Mobile therefore uses the timed single-pass draw screens/01 specifies.
     * Asserted through the ScrollTrigger population because the visual result
     * needs real layout, which jsdom has none of.
     */
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'), // mobile, motion NOT reduced
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { unmount } = render(
      <HeroStage>
        <h1>Every Journey Matters.</h1>
      </HeroStage>
    );

    // No scrubbed trigger may exist on mobile — a scrub here is the bug.
    expect(ScrollTrigger.getAll().filter((t) => t.vars.scrub)).toHaveLength(0);

    unmount();
    ScrollTrigger.getAll().forEach((t) => t.kill());
  });

  it('renders its content as children rather than injecting it', () => {
    // The headline is server-rendered and present before this component's JS
    // runs — motion is additive, never a rendering dependency.
    render(
      <HeroStage>
        <h1>Every Journey Matters.</h1>
      </HeroStage>
    );
    expect(screen.getByRole('heading', { name: 'Every Journey Matters.' })).toBeInTheDocument();
  });
});
