import type { MetadataRoute } from 'next';
import { clientEnv } from '@/lib/env';

/**
 * Sitemap covering every public route in screens.md's Screen Inventory
 * (FEAT-013's acceptance criterion: "Sitemap and robots.txt are present and
 * correctly reference all public pages").
 *
 * FEAT-013 is a Phase 2 feature, but this ships in Foundation because a route
 * added in Phase 1 and forgotten here is invisible drift — cheaper to keep in
 * step from the start than to audit later.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = clientEnv.siteUrl;

  const routes: Array<{ path: string; priority: number; changeFrequency: 'monthly' | 'yearly' }> = [
    { path: '/', priority: 1.0, changeFrequency: 'monthly' },
    { path: '/individual', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/business', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/transport-partners', priority: 0.9, changeFrequency: 'monthly' },
    // The credibility page is the SEO/trust moat identified in the README's
    // Opportunities, so it ranks above the legal pages.
    { path: '/how-we-verify', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ];

  const lastModified = new Date();

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
