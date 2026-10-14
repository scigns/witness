import type { MetadataRoute } from 'next';

import { canonicalUrl, marketingSiteConfig } from '../lib/site-config';

// Resolved entirely from build-time env (marketingSiteConfig's process.env
// default) — safe to statically export alongside the Cloudflare Pages build.
export const dynamic = 'force-static';

export default function robots(config = marketingSiteConfig()): MetadataRoute.Robots {
  return config.indexable
    ? {
        rules: { userAgent: '*', allow: '/' },
        sitemap: canonicalUrl('/sitemap.xml', config).href,
      }
    : { rules: { userAgent: '*', disallow: '/' } };
}
