const CANONICAL_MARKETING_ORIGIN = 'https://buildwithwitness.com';
const DEFAULT_DEPLOYMENT_URL = 'http://localhost:3002';

export interface MarketingSiteConfig {
  deploymentUrl: URL;
  canonicalOrigin: URL;
  appUrl: URL;
  demoUrl: URL;
  indexable: boolean;
}

/**
 * Public, non-secret marketing configuration. Indexing fails closed: only the
 * exact value `true` enables it, so an unconfigured preview remains noindex.
 */
export function marketingSiteConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MarketingSiteConfig {
  const deploymentUrl = new URL(
    environment['WITNESS_MARKETING_SITE_URL'] ?? DEFAULT_DEPLOYMENT_URL,
  );
  const appUrl = new URL(
    environment['WITNESS_MARKETING_APP_URL'] ?? 'https://app.buildwithwitness.com/signin',
  );
  const demoUrl = new URL(
    environment['WITNESS_MARKETING_DEMO_URL'] ??
      'mailto:hello@buildwithwitness.com?subject=Witness%20demonstration%20request',
  );

  if (deploymentUrl.protocol !== 'http:' && deploymentUrl.protocol !== 'https:') {
    throw new Error('WITNESS_MARKETING_SITE_URL must use http or https.');
  }
  if (appUrl.protocol !== 'http:' && appUrl.protocol !== 'https:') {
    throw new Error('WITNESS_MARKETING_APP_URL must use http or https.');
  }
  if (!['http:', 'https:', 'mailto:'].includes(demoUrl.protocol)) {
    throw new Error('WITNESS_MARKETING_DEMO_URL must use http, https, or mailto.');
  }

  const canonicalOrigin = new URL(CANONICAL_MARKETING_ORIGIN);
  const indexable =
    environment['WITNESS_MARKETING_INDEXABLE'] === 'true' &&
    environment['WITNESS_MARKETING_ENV'] === 'production' &&
    deploymentUrl.origin === canonicalOrigin.origin;

  return {
    deploymentUrl,
    canonicalOrigin,
    appUrl,
    demoUrl,
    indexable,
  };
}

export function canonicalUrl(pathname: string, config = marketingSiteConfig()): URL {
  return new URL(pathname, config.canonicalOrigin);
}
