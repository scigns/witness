import type { Metadata } from 'next';

import { canonicalUrl, marketingSiteConfig } from './site-config';

export const DEFAULT_DESCRIPTION =
  'Witness connects evidence, consultation, decisions and actions into an accountable institutional record.';

export interface MarketingMetadataInput {
  title: string;
  description?: string;
  path?: string;
  type?: 'website' | 'article';
  image?: string;
  robots?: Metadata['robots'];
}

/** Build consistent, absolute metadata for a public marketing route. */
export function createMarketingMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  type = 'website',
  image,
  robots,
}: MarketingMetadataInput): Metadata {
  const config = marketingSiteConfig();
  const url = canonicalUrl(path, config);
  const openGraph: NonNullable<Metadata['openGraph']> = {
    type,
    url: url.href,
    siteName: 'Witness',
    locale: 'en_US',
    title,
    description,
    ...(image === undefined
      ? {}
      : { images: [{ url: new URL(image, config.canonicalOrigin).href }] }),
  };

  return {
    metadataBase: config.canonicalOrigin,
    title,
    description,
    alternates: { canonical: url.href },
    openGraph,
    twitter: { card: image === undefined ? 'summary' : 'summary_large_image', title, description },
    robots:
      robots ??
      (config.indexable ? { index: true, follow: true } : { index: false, follow: false }),
  };
}
