'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

/**
 * Audience state (FEAT-001) — which of the three personas the visitor has
 * identified as, driving the header CTA on pages whose URL carries no audience.
 *
 * ─── WHY THIS STATE EXISTS AT ALL (T-037 justification) ─────────────────────
 *
 * Navigation on this site is URL-native: every nav item is a real anchor and
 * the active state comes from `usePathname()` (DELIVERY.md D-011). Navigation
 * itself needs zero client state. This module is NOT navigation — it is the
 * one piece of state the CTA requirement forces:
 *
 *  - user_flow.md's "Audience Selector Persistence" global flow: selecting an
 *    audience "persists for the session so the header CTA stays stable".
 *  - A visitor who came in through /business must keep seeing "Request a
 *    Demo" on /how-we-verify and /privacy — offering a Business visitor the
 *    consumer app-download CTA there is the exact conversion bug FEAT-009
 *    exists to prevent.
 *
 * Pages whose URL names an audience (/individual, /business,
 * /transport-partners) do not need this state — the CTA derives from the
 * pathname (see PATH_TO_AUDIENCE). The storage exists solely for the OTHER
 * pages — /, /how-we-verify, /about, /privacy, /terms — whose URL carries no
 * audience signal.
 *
 * WHAT WOULD BREAK WITHOUT IT: every non-audience page would fall back to the
 * default `individual` CTA. A Business visitor deep-linked to /business who
 * then opened /privacy would be offered "Get the App" — the session-continuity
 * requirement dies, and with it the reason R-002's mitigation works.
 *
 * sessionStorage, not localStorage: user_flow.md scopes persistence to "the
 * same session". A visitor returning months later should get the neutral
 * default rather than an identity chosen on a previous visit.
 *
 * There is deliberately NO public setter. Under the old two-variant header the
 * selector wrote `setAudience` on click; T-037 removes that component and the
 * URL becomes the only source of truth — the effect below adopts the audience
 * of whichever audience page the visitor is on. One writer, one signal,
 * nothing to fall out of sync.
 *
 * Modelled with `useSyncExternalStore` rather than useState + useEffect so the
 * stored value is read during render on the client and never causes a
 * cascading re-render.
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
 * The `storage` listener keeps duplicate tabs consistent if the visitor opens
 * the site twice; it cannot fire for same-tab writes, which is what the
 * pathname-adopt effect below needs `emit()` for.
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

/**
 * The single writer. Called only from the pathname-adopt effect: landing on an
 * audience page adopts that audience for the rest of the session.
 */
function persist(audience: Audience): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, audience);
  } catch {
    // Storage write failed (private browsing quota, etc.). The current page
    // still derives its CTA from the URL; only cross-page continuity is lost.
    // Not worth breaking the page over.
  }
  emit();
}

interface AudienceContextValue {
  audience: Audience;
}

const AudienceContext = createContext<AudienceContextValue>({ audience: 'individual' });

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
  // session — the URL is the only signal that ever writes here. This is a
  // write to an external system, not a state sync.
  useEffect(() => {
    if (fromPath && fromPath !== storedAudienceStore.getSnapshot()) {
      persist(fromPath);
    }
  }, [fromPath]);

  return <AudienceContext.Provider value={{ audience }}>{children}</AudienceContext.Provider>;
}
