import { canonicalUrl } from '../lib/site-config';

const ORGANIZATION_DATA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Witness',
  url: canonicalUrl('/').href,
} as const;

export function OrganizationStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_DATA) }}
    />
  );
}
