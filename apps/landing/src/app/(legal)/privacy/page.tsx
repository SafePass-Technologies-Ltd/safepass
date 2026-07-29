import type { Metadata } from 'next';
import { LegalArticle } from '@/lib/content/legal/legal-article';
import { privacyPolicy } from '@/lib/content/legal/privacy-policy';

/**
 * Privacy Policy — screens/06-privacy-policy.md. FEAT-015.
 *
 * LAUNCH BLOCKER: risk_log.md R-011 makes a live Privacy Policy a hard
 * prerequisite for FEAT-008/010/012's lead-capture forms — each of those forms
 * must link here before submission, so this route must stay live and indexable.
 *
 * Static by construction: no data fetching, no client boundary, no motion. The
 * only states screens/06 defines are Loaded and a page-level render failure,
 * and the latter is handled by the shared `app/error.tsx` boundary (screens.md's
 * Shared Error State) rather than by anything here.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: privacyPolicy.description,
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalArticle document={privacyPolicy} />;
}
