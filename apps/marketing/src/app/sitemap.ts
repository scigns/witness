import type { MetadataRoute } from 'next';

import { canonicalUrl, marketingSiteConfig } from '../lib/site-config';

/**
 * Every real, published content route. Indexing itself remains noindex-gated
 * (`createMarketingMetadata`/CW-009) regardless of what is listed here, so
 * extending this list carries no live SEO effect until indexing is
 * separately, explicitly enabled — it only keeps the sitemap honest about
 * what actually exists.
 */
const CONTENT_ROUTES = [
  '/',
  '/platform',
  '/how-it-works',
  '/why-witness',
  '/platform/evidence',
  '/platform/decisions',
  '/platform/institutional-memory',
  '/platform/co-design',
  '/platform/knowledge',
  '/platform/change',
  '/solutions',
  '/solutions/government',
  '/solutions/international-development',
  '/solutions/research',
  '/solutions/consultation',
  '/demo',
  '/trust',
  '/trust/security',
  '/trust/data-sovereignty',
  '/trust/privacy',
  '/stories',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const config = marketingSiteConfig();
  return CONTENT_ROUTES.map((path) => ({
    url: canonicalUrl(path, config).href,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
