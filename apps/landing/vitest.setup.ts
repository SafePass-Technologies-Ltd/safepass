import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

/**
 * Registers jest-dom's matchers against THIS project's `expect`.
 *
 * Deliberately not the `@testing-library/jest-dom/vitest` entry point, which
 * is the documented one-liner. That entry does `import { expect } from
 * 'vitest'` internally, but jest-dom does not declare `vitest` as a peer
 * dependency — so under pnpm's strict node_modules layout it cannot resolve
 * one from its own location, the matchers register against nothing, and every
 * assertion fails with "Invalid Chai property: toBeInTheDocument".
 *
 * That failure is install-shaped, not code-shaped: an incremental
 * `pnpm install` can leave a reachable hoisted copy and everything passes,
 * while CI's `pnpm install --frozen-lockfile` produces the strict layout and
 * 15 test files fail at once. Importing the pure `./matchers` export and
 * extending our own `expect` removes the resolution entirely.
 */
expect.extend(matchers);

afterEach(() => {
  cleanup();
});

/**
 * jsdom implements none of the browser APIs the motion layer depends on, and
 * an unstubbed call throws rather than returning a benign default — which
 * would fail every test that renders a page, not just the motion tests.
 *
 * `matchMedia` defaults to `matches: false`, i.e. motion ENABLED. Reduced-motion
 * behaviour is asserted by overriding this per test (see
 * `src/lib/motion/use-reduced-motion.test.ts`), so the default here exercises
 * the full-motion path rather than silently testing only the fallback.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class MockObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

vi.stubGlobal('IntersectionObserver', MockObserver);
vi.stubGlobal('ResizeObserver', MockObserver);

// GSAP and Lenis both drive their loops from rAF; jsdom provides it, but
// scrollTo is unimplemented and logs a noisy "Not implemented" error.
Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
