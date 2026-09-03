import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { clientEnv } from '@/lib/env';
import { Providers } from './providers';
import './globals.css';

/**
 * Inter as a VARIABLE font, not static weights.
 *
 * branding.md Section 3.2 depends on this: headline weight interpolates across
 * the 400-700 axis during scroll-triggered reveals, reading as "a focus
 * pulling into view" rather than a pop. Static weight files would make that
 * effect impossible and force a jump between discrete weights.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
});

/** Monospace face for stat/data readouts (the `stat` type token). */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.siteUrl),
  title: {
    default: 'SafePass: Every Journey Matters',
    template: '%s | SafePass',
  },
  description:
    'Safety-focused satnav with live human monitoring for road travel in Nigeria. Real officers watch your journey from departure to arrival.',
  openGraph: {
    type: 'website',
    siteName: 'SafePass',
    locale: 'en_NG',
  },
  /**
   * The card image itself comes from the `opengraph-image.png` file convention
   * in this directory (with its alt text alongside it), so it does not need
   * listing here. `summary_large_image` is what makes X/Twitter render it at
   * full width rather than as a thumbnail — branding.md §2 lists the social
   * share image as a required logo placement, and a cropped thumbnail defeats
   * that.
   */
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Matches the `ink` token in each mode so the mobile browser chrome doesn't
  // clash with the night-navy field the design is built on.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-NG"
      // suppressHydrationWarning is required by next-themes: it writes the
      // theme class onto <html> before React hydrates, which would otherwise
      // be reported as a mismatch on every load.
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/*
          Skip link — WCAG 2.4.1 Bypass Blocks (Level A, and therefore required
          by branding.md Section 4's "All text meets WCAG AA" commitment).
          Every page carries the same persistent header, audience selector, and
          nav, so a keyboard or screen-reader user would otherwise tab through
          the identical block before reaching content on all eight screens.

          Visually hidden until focused, then rendered as a real, visible
          control — a skip link nobody can see when focused is not a bypass
          mechanism.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-100 focus:rounded-md focus:bg-primary focus:px-md focus:py-sm focus:text-body focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
