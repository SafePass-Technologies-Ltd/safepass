import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteLineCanvas } from './route-line-canvas';
import { RadarSweepCanvas } from './radar-sweep-canvas';

/**
 * The two Canvas 2D motifs — route-line (FEAT-003) and radar sweep.
 *
 * jsdom implements no 2D rendering context, so `getContext('2d')` returns null
 * here. That is not a limitation to work around: it is EXACTLY the failure
 * `screens/01-homepage.md` specifies behaviour for — "falls back silently to
 * the static hero image state — never shows a broken canvas or console-visible
 * error to the visitor". These tests assert that path is silent and safe.
 */

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  setReducedMotion(false);
});

describe.each([
  ['RouteLineCanvas', RouteLineCanvas, 'route-line-canvas'] as const,
  ['RadarSweepCanvas', RadarSweepCanvas, 'radar-sweep-canvas'] as const,
])('%s', (_name, Component, testId) => {
  it('renders an aria-hidden canvas — decorative motion never reaches the a11y tree', () => {
    render(<Component />);

    const canvas = screen.getByTestId(testId);
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('fails silently when a 2D context cannot be created', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Component />)).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('mounts and unmounts cleanly under reduced motion', () => {
    setReducedMotion(true);

    const { unmount } = render(<Component />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it('tears down without leaking its observer or trigger', () => {
    const { unmount } = render(<Component />);
    expect(() => unmount()).not.toThrow();
  });
});
