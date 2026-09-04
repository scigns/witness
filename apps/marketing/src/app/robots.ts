import type { MetadataRoute } from 'next';

import { canonicalUrl, marketingSiteConfig } from '../lib/site-config';

export default function robots(config = marketingSiteConfig()): MetadataRoute.Robots {
  return config.indexable
    ? {
        rules: { userAgent: '*', allow: '/' },
        sitemap: canonicalUrl('/sitemap.xml', config).href,
      }
    : { rules: { userAgent: '*', disallow: '/' } };
}
