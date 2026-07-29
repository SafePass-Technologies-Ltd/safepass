'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Audience state (FEAT-001) — which of the three personas the visitor has
 * identified as, and which content and CTA they therefore see.
 *
 * This is the site's central information-architecture mechanism and the
 * mitigation for two named risks: R-001 (one site diluting messaging across
 * three buyer types) and R-002 (a visitor bouncing before finding the CTA
 * meant for them). Treat it as load-bearing, not a convenience toggle.
 *
 * This module owns the REACT STATE only. The audience DATA (labels, routes,
 * CTA labels) lives in `./audience-config`, which is deliberately not a
 * `'use client'` module so Server Components can read it — see that file's
 * header for why that separation is load-bearing rather than stylistic.
 */

import {
  AUDIENCES,
  AUDIENCE_CONFIG,
  AUDIENCE_LIST,
  PATH_TO_AUDIENCE,
  type Audience,
  type AudienceDefinition,
} from './audience-config';

// Re-exported so client components can pull state and data from one import.
// Server Components must import from './audience-config' directly.
export { AUDIENCES, AUDIENCE_CONFIG, AUDIENCE_LIST, PATH_TO_AUDIENCE };
export type { Audience, AudienceDefinition };

const STORAGE_KEY = 'safepass:audience';

/**
 * sessionStorage as an external store.
 *
 * Modelled with `useSyncExternalStore` rather than useState + useEffect so the
 * stored value is read during render on the client and never causes a
 * cascading re-render — and so multiple selector instances (header and mobile
 * drawer, say) stay in lockstep automatically.
 *
 * sessionStorage, not localStorage: user_flow.md scopes persistence to "the
 * same session". A visitor returning months later should get the neutral
 * default rather than an identity chosen on a previous visit.
 */
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

const storedAudienceStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // 'storage' fires for other tabs; harmless here and keeps duplicate tabs
    // consistent if the visitor opens the site twice.
    window.addEventListener('storage', listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', listener);
    };
  },
  getSnapshot(): Audience {
    try {
      const value = window.sessionStorage.getItem(STORAGE_KEY);
      return AUDIENCES.includes(value as Audience) ? (value as Audience) : 'individual';
    } catch {
      // Private browsing or a storage-disabled context — fall back to the
      // default rather than failing the render over a storage error.
      return 'individual';
    }
  },
};

function persist(audience: Audience): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, audience);
  } catch {
    // Selection still works for the current page; it just won't survive
    // navigation. Not worth breaking the page over.
  }
  emit();
}

interface AudienceContextValue {
  audience: Audience;
  setAudience: (next: Audience) => void;
}

const AudienceContext = createContext<AudienceContextValue>({
  audience: 'individual',
  setAudience: () => {},
});

export function useAudience(): AudienceContextValue {
  return useContext(AudienceContext);
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 'individual' is the SSR snapshot: it is the primary persona (Amaka) and
  // the homepage's default state, so the server render matches the most common
  // first view.
  const stored = useSyncExternalStore(
    storedAudienceStore.subscribe,
    storedAudienceStore.getSnapshot,
    () => 'individual' as Audience
  );

  const fromPath = pathname ? PATH_TO_AUDIENCE[pathname] : undefined;

  // Resolution order matters: an explicit deep link beats a stored preference,
  // because the URL is a stronger and more recent signal of intent than
  // whatever the visitor clicked earlier in the session. Derived during render
  // rather than synced through an effect, so there's no frame where a
  // deep-linked page shows the wrong audience's content.
  const audience = fromPath ?? stored;

  // Landing on an audience page adopts that audience for the rest of the
  // session. This is a write to an external system, not a state sync.
  useEffect(() => {
    if (fromPath && fromPath !== storedAudienceStore.getSnapshot()) {
      persist(fromPath);
    }
  }, [fromPath]);

  const setAudience = useCallback((next: Audience) => {
    persist(next);
  }, []);

  return (
    <AudienceContext.Provider value={{ audience, setAudience }}>
      {children}
    </AudienceContext.Provider>
  );
}
