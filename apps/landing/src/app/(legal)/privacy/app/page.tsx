import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { LegalArticle } from '@/lib/content/legal/legal-article';
import { appPrivacyPolicy } from '@/lib/content/legal/app-privacy-policy';

/**
 * App Privacy Policy — the mobile app's disclosure (Android + iOS).
 *
 * This is the URL submitted as the privacy policy for the Play listing. It is
 * deliberately separate from /privacy, which covers the marketing website and
 * says so in its own intro; Google Play requires the submitted policy to
 * describe what the app itself collects.
 *
 * Static by construction: no data fetching, no client boundary, no motion.
 */
export const metadata: Metadata = {
  title: 'App Privacy Policy',
  description: appPrivacyPolicy.description,
  alternates: { canonical: '/privacy/app' },
  robots: { index: true, follow: true },
};

export default function AppPrivacyPage() {
  return (
    <Container width="prose">
      <LegalArticle document={appPrivacyPolicy} />
    </Container>
  );
}
