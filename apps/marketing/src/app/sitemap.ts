import type { MetadataRoute } from 'next';

import { canonicalUrl, marketingSiteConfig } from '../lib/site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const config = marketingSiteConfig();
  return [{ url: canonicalUrl('/', config).href, changeFrequency: 'monthly', priority: 1 }];
}
