import type { Metadata } from 'next';
import { LegalArticle } from '@/lib/content/legal/legal-article';
import { about } from '@/lib/content/legal/about';

/**
 * About Page — screens/08-about.md. FEAT-015.
 *
 * This page is read during vendor due-diligence by Tunde (corporate security)
 * and Chidinma (transport operator), which is why the copy in
 * `lib/content/legal/about.ts` is real product substance rather than generic
 * "About Us" filler — screens/08's Edge Case treats a thin page here as a
 * failure of the screen even when it is technically complete.
 */

export const metadata: Metadata = {
  title: 'About SafePass',
  description: about.description,
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return <LegalArticle document={about} />;
}
