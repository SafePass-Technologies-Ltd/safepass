import type { MetadataRoute } from 'next';
import { clientEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The lead intake handler is a POST-only internal endpoint; there is
      // nothing to crawl and nothing that should appear in an index.
      disallow: '/api/',
    },
    sitemap: `${clientEnv.siteUrl}/sitemap.xml`,
  };
}
