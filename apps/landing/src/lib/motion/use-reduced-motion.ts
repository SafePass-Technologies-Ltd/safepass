'use client';

import { useSyncExternalStore } from 'react';
import { BREAKPOINT } from './constants';

/**
 * Media-query and connection hooks.
 *
 * All of these are `useSyncExternalStore` subscriptions rather than
 * useState + useEffect pairs. That is the correct primitive: `matchMedia` and
 * `navigator.connection` are external stores, and reading them into state
 * inside an effect causes the cascading re-render that
 * `react-hooks/set-state-in-effect` flags — an extra render pass on every
 * motion-aware component, on a page already working against a 60fps budget
 * (risk_log.md R-006).
 *
 * It also gives correct SSR behaviour for free: `getServerSnapshot` defines
 * exactly what the server renders, with no hydration mismatch.
 */

/** Shared subscribe/snapshot factory for a media query. */
function createMediaQueryStore(query: string) {
  return {
    subscribe(onChange: () => void): () => void {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    getSnapshot(): boolean {
      return window.matchMedia(query).matches;
    },
  };
}

const reducedMotionStore = createMediaQueryStore('(prefers-reduced-motion: reduce)');
const mobileStore = createMediaQueryStore(`(max-width: ${BREAKPOINT.tablet - 1}px)`);

/**
 * Tracks `prefers-reduced-motion`.
 *
 * The server snapshot is `true` (motion OFF). This default is deliberate and
 * is the safe direction: the server render and first paint show the static
 * composed state, so a reduced-motion visitor never catches a frame of
 * animation before the preference resolves. The opposite default would flash
 * motion at exactly the people who asked not to see it.
 *
 * branding.md Section 8 makes this a hard requirement, not an enhancement.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    () => true
  );
}

/**
 * True below the tablet breakpoint, where branding.md's mobile Adaptation
 * Strategy applies: 2 parallax layers rather than 3, no hero pin sequence,
 * single-pass reveals, reduced stagger.
 *
 * Server snapshot is `true` (mobile) — the cheapest experience renders first,
 * matching Amaka's mobile-first primary context.
 */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(mobileStore.subscribe, mobileStore.getSnapshot, () => true);
}

/** Chromium-only Network Information API surface. */
type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function getConnection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

const connectionStore = {
  subscribe(onChange: () => void): () => void {
    const connection = getConnection();
    connection?.addEventListener?.('change', onChange);
    return () => connection?.removeEventListener?.('change', onChange);
  },
  getSnapshot(): boolean {
    const connection = getConnection();
    if (!connection) return false;

    const effectiveType = connection.effectiveType ?? '4g';
    return (
      connection.saveData === true ||
      effectiveType === 'slow-2g' ||
      effectiveType === '2g' ||
      effectiveType === '3g'
    );
  },
};

/**
 * Slow-connection detection for branding.md Section 8's fallback: video
 * backgrounds swap to static imagery and motion assets swap to lower
 * frame-count exports on 2g/3g.
 *
 * `navigator.connection` is Chromium-only; its absence is treated as a fast
 * connection, since assuming "slow" everywhere would strip the experience for
 * every Safari and Firefox visitor.
 */
export function useSlowConnection(): boolean {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot, () => false);
}

/**
 * Combined motion profile — several call sites need "full desktop sequence"
 * vs. "compressed single-pass" as a single decision.
 */
export function useMotionProfile(): {
  reduced: boolean;
  mobile: boolean;
  slowConnection: boolean;
  /** Full scroll-scrubbed sequences (hero pin, parallax, radar loop). */
  fullMotion: boolean;
} {
  const reduced = useReducedMotion();
  const mobile = useIsMobileViewport();
  const slowConnection = useSlowConnection();

  return { reduced, mobile, slowConnection, fullMotion: !reduced && !mobile };
}
