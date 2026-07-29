'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ScrollProvider } from '@/lib/motion/scroll-provider';
import { AudienceProvider } from '@/lib/audience/audience-context';

/**
 * Client provider stack.
 *
 * Kept as a thin client boundary at the root so the layout itself and every
 * page below stay Server Components — architecture.md requires that pages be
 * "fully readable before hydration completes, so motion is additive, not a
 * rendering dependency."
 *
 * Order matters: ScrollProvider owns the single Lenis instance and GSAP ticker
 * (see its module doc), so it must wrap anything that animates.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      /**
       * `system`, not `dark`.
       *
       * branding.md §3.1 defines an explicit LIGHT value for all 15 colour
       * tokens and both shadow sets, so light mode is a specified mode, not a
       * side effect. With `defaultTheme="dark"` the `dark` class was never
       * removed and there is no toggle in the UI, which meant that entire half
       * of the design system was unreachable — implemented, tested, and dead.
       *
       * Following the OS preference makes it reachable without inventing a
       * theme switcher that no screen in `screens/` specifies.
       *
       * NOTE FOR ANYONE ADDING A DARK BAND: sections that stay dark in BOTH
       * modes (the hero's `gradient-hero`, the drawer scrim) must use explicit
       * `text-white`, never `text-text-primary` — that token flips to dark
       * slate in light mode and would render dark-on-dark.
       */
      defaultTheme="system"
      enableSystem
      // Theme transitions would fight the scroll-driven motion and read as a
      // flash on a page whose background is a full-bleed gradient.
      disableTransitionOnChange
    >
      <AudienceProvider>
        <ScrollProvider>{children}</ScrollProvider>
      </AudienceProvider>
    </ThemeProvider>
  );
}
