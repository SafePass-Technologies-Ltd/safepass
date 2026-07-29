import type { Metadata } from 'next';
import { LegalArticle } from '@/lib/content/legal/legal-article';
import { termsOfService } from '@/lib/content/legal/terms-of-service';

/**
 * Terms of Service — screens/07-terms-of-service.md. FEAT-015.
 *
 * These terms govern this WEBSITE only, not the SafePass app or dashboards —
 * screens/07 is explicit about that boundary and the copy states it up front.
 * Same static structure and error handling as the Privacy Policy.
 */

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: termsOfService.description,
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalArticle document={termsOfService} />;
}
