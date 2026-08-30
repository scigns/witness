/**
 * Configuration tests.
 *
 * The sovereignty guarantee in P1 is only as strong as the code that refuses to
 * start when it is violated. These tests are that guarantee's regression suite —
 * if one of them fails, Witness will boot in a configuration that ADR-0009 says
 * must be impossible.
 */

import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig, publicConfig } from './index.js';

const base = {
  DATABASE_URL: 'postgresql://witness:pw@localhost:5432/witness',
  NODE_ENV: 'development',
  WITNESS_DEPLOYMENT_PROFILE: 'development',
} satisfies NodeJS.ProcessEnv;

/**
 * `base`, plus everything a non-development profile requires: real
 * identity-provider config, and the two public addresses whose localhost
 * defaults are only ever right for a developer.
 */
const oidcBase = {
  ...base,
  OIDC_ISSUER: 'https://keycloak.example.org/realms/witness',
  KEYCLOAK_CLIENT_ID: 'witness-api',
  JWT_AUDIENCE: 'witness-api',
  WITNESS_WEB_ORIGIN: 'https://pilot.example.org',
  WITNESS_OIDC_REDIRECT_URI: 'https://api.pilot.example.org/api/v1/auth/callback',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a minimal valid development configuration', () => {
    const config = loadConfig({ ...base });
    expect(config.profile).toBe('development');
    expect(config.apiPort).toBe(3001);
    expect(config.externalInferenceEnabled).toBe(false);
    expect(config.billingProfile).toBeNull();
  });

  it('fails closed for partial billing configuration without exposing values', () => {
    expect(() =>
      loadConfig({
        ...base,
        BILLING_LEGAL_NAME: 'Supplier',
        BILLING_BANK_BSB: 'SYNTHETIC-BSB-123',
      }),
    ).toThrow(/required when billing configuration is present/i);
    try {
      loadConfig({ ...base, BILLING_EMAIL: 'not-an-email', BILLING_BANK_BSB: 'SYNTHETIC-BSB-123' });
    } catch (error) {
      expect(String(error)).not.toContain('SYNTHETIC-BSB-123');
    }
  });

  it('loads a complete reviewed billing profile but never includes it in public config', () => {
    const config = loadConfig({
      ...base,
      BILLING_LEGAL_NAME: 'Supplier',
      BILLING_ADDRESS: 'Address',
      BILLING_EMAIL: 'billing@example.invalid',
      BILLING_BANK_ACCOUNT_NAME: 'Supplier',
      BILLING_BANK_BSB: 'SYNTHETIC-BSB-123',
      BILLING_BANK_ACCOUNT_NUMBER: 'SYNTHETIC-ACCOUNT-456',
    });
    expect(config.billingProfile?.remittance.accountNumber).toBe('SYNTHETIC-ACCOUNT-456');
    expect(JSON.stringify(publicConfig(config))).not.toContain('SYNTHETIC');
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(ConfigurationError);
  });

  it('rejects an unknown deployment profile rather than defaulting to a permissive one', () => {
    expect(() => loadConfig({ ...base, WITNESS_DEPLOYMENT_PROFILE: 'cloud' })).toThrow(
      ConfigurationError,
    );
  });

  it('reports every problem at once, not one per restart', () => {
    try {
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_PROVIDER: 'openai',
        ALLOW_EXTERNAL_MODEL_EGRESS: 'true',
        TELEMETRY_EXTERNAL_REPORTING: 'true',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).problems.length).toBe(3);
    }
  });
});

describe('sovereign profile (ADR-0009, principle P1)', () => {
  it('REFUSES TO START with an external model provider configured', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_PROVIDER: 'openai',
      }),
    ).toThrow(/zero external calls/i);
  });

  // `.invalid` is reserved by RFC 2606 and can never resolve. Using a real
  // provider hostname here would put a hard-coded external endpoint in the tree,
  // which scripts/security/verify-no-egress.sh refuses outright — correctly, and
  // the gate should not be loosened to accommodate a test.
  it('refuses a provider smuggled in via base URL alone', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_BASE_URL: 'https://external-provider.invalid/v1',
      }),
    ).toThrow(/zero external calls/i);
  });

  it('refuses a provider smuggled in via API key alone', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_API_KEY: 'sk-something',
      }),
    ).toThrow(/zero external calls/i);
  });

  it('refuses external telemetry reporting — telemetry egress is egress', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        TELEMETRY_EXTERNAL_REPORTING: 'true',
      }),
    ).toThrow(/telemetry egress is egress/i);
  });

  it('starts happily when nothing external is configured', () => {
    const config = loadConfig({
      ...oidcBase,
      NODE_ENV: 'production',
      WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
    });
    expect(config.externalInferenceEnabled).toBe(false);
  });

  it('REFUSES TO START with S3 object storage configured — recordings and documents are institutional content too', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        S3_ENDPOINT: 'https://example-r2-endpoint.invalid',
      }),
    ).toThrow(/zero external calls/i);
  });

  it('refuses S3 credentials smuggled in without an endpoint', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        S3_ACCESS_KEY_ID: 'not-a-real-credential',
      }),
    ).toThrow(/zero external calls/i);
  });
});

describe('OIDC identity provider (ADR-0007)', () => {
  it('REFUSES TO START outside development without OIDC_ISSUER, KEYCLOAK_CLIENT_ID, or JWT_AUDIENCE', () => {
    expect(() => loadConfig({ ...base, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' })).toThrow(
      /requires OIDC_ISSUER/i,
    );
  });

  it('the development profile does not require OIDC configuration', () => {
    expect(() => loadConfig({ ...base })).not.toThrow();
  });

  it('starts with real identity-provider configuration', () => {
    const config = loadConfig({ ...oidcBase, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' });
    expect(config.oidcIssuer).toBe('https://keycloak.example.org/realms/witness');
    expect(config.oidcClientId).toBe('witness-api');
    expect(config.jwtAudience).toBe('witness-api');
  });

  it('derives the redirect URI from the API port when not set explicitly', () => {
    const config = loadConfig({ ...base, WITNESS_API_PORT: '4001' });
    expect(config.oidcRedirectUri).toBe('http://localhost:4001/api/v1/auth/callback');
  });

  it('honours an explicit redirect URI', () => {
    const config = loadConfig({
      ...base,
      WITNESS_OIDC_REDIRECT_URI: 'https://witness.gov.example/api/v1/auth/callback',
    });
    expect(config.oidcRedirectUri).toBe('https://witness.gov.example/api/v1/auth/callback');
  });

  it('trims whitespace from OIDC configuration values before storing them', () => {
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
      OIDC_ISSUER: '  https://keycloak.example.org/realms/witness  ',
      KEYCLOAK_CLIENT_ID: '  witness-api  ',
      KEYCLOAK_CLIENT_SECRET: '  a-secret  ',
      JWT_AUDIENCE: '  witness-api  ',
    });
    // Untrimmed, these would break `.well-known/openid-configuration` fetches
    // (built from oidcIssuer) and every ID-token audience check (jwtAudience) —
    // see the KeycloakOidcAdapter and health.controller.ts call sites.
    expect(config.oidcIssuer).toBe('https://keycloak.example.org/realms/witness');
    expect(config.oidcClientId).toBe('witness-api');
    expect(config.oidcClientSecret).toBe('a-secret');
    expect(config.jwtAudience).toBe('witness-api');
  });

  it('rejects OIDC_ISSUER that is whitespace-only outside development', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        OIDC_ISSUER: '   ',
      }),
    ).toThrow(/requires OIDC_ISSUER/i);
  });

  it('rejects KEYCLOAK_CLIENT_ID that is whitespace-only outside development', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        KEYCLOAK_CLIENT_ID: '   ',
      }),
    ).toThrow(/requires KEYCLOAK_CLIENT_ID/i);
  });

  it('rejects JWT_AUDIENCE that is whitespace-only outside development', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        JWT_AUDIENCE: '   ',
      }),
    ).toThrow(/requires JWT_AUDIENCE/i);
  });
});

describe('development profile (ADR-0013)', () => {
  it('REFUSES TO START in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', WITNESS_DEPLOYMENT_PROFILE: 'development' }),
    ).toThrow(/must never run in production/i);
  });
});

describe('hybrid profile', () => {
  it('requires an explicit egress opt-in as well as a permitting profile', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
        EXTERNAL_MODEL_PROVIDER: 'openai',
        ALLOW_EXTERNAL_MODEL_EGRESS: 'false',
      }),
    ).toThrow(/explicit opt-in/i);
  });

  it('enables external inference only when profile and opt-in agree', () => {
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
      EXTERNAL_MODEL_PROVIDER: 'openai',
      ALLOW_EXTERNAL_MODEL_EGRESS: 'true',
    });
    expect(config.externalInferenceEnabled).toBe(true);
  });

  // `.invalid` is reserved by RFC 2606 and can never resolve — same reasoning
  // as the EXTERNAL_MODEL_BASE_URL test above.
  const s3Env = {
    S3_ENDPOINT: 'https://example-r2-endpoint.invalid',
    S3_ACCESS_KEY_ID: 'not-a-real-credential',
    S3_SECRET_ACCESS_KEY: 'not-a-real-credential-either',
    S3_BUCKET_MEDIA: 'witness-media',
    S3_BUCKET_DOCUMENTS: 'witness-documents',
  } satisfies NodeJS.ProcessEnv;

  it('requires an explicit object-storage egress opt-in as well as a permitting profile', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
        ...s3Env,
        ALLOW_OBJECT_STORAGE_EGRESS: 'false',
      }),
    ).toThrow(/explicit opt-in/i);
  });

  it('requires both buckets once S3 is configured', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
        S3_ENDPOINT: s3Env.S3_ENDPOINT,
        S3_ACCESS_KEY_ID: s3Env.S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: s3Env.S3_SECRET_ACCESS_KEY,
        ALLOW_OBJECT_STORAGE_EGRESS: 'true',
        // S3_BUCKET_MEDIA / S3_BUCKET_DOCUMENTS deliberately omitted.
      }),
    ).toThrow(/S3_BUCKET_MEDIA or S3_BUCKET_DOCUMENTS is empty/i);
  });

  it('enables object storage only when profile and opt-in agree', () => {
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
      ...s3Env,
      ALLOW_OBJECT_STORAGE_EGRESS: 'true',
    });
    expect(config.objectStorageEnabled).toBe(true);
    expect(config.s3.bucketMedia).toBe('witness-media');
    expect(config.s3.bucketDocuments).toBe('witness-documents');
  });

  it('object storage stays disabled without the egress opt-in, even fully configured otherwise', () => {
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'development',
      ...s3Env,
    });
    expect(config.objectStorageEnabled).toBe(false);
  });
});

describe('publicConfig', () => {
  it('exposes no secret and no connection string', () => {
    const config = loadConfig({
      ...base,
      EXTERNAL_MODEL_API_KEY: 'sk-super-secret',
    });
    const serialised = JSON.stringify(publicConfig(config));

    expect(serialised).not.toContain('sk-super-secret');
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toMatch(/pw/);
  });
});

describe('web origin (CORS)', () => {
  it('derives from the web port when not set explicitly', () => {
    const config = loadConfig({ ...base, WITNESS_WEB_PORT: '3020' });
    expect(config.webOrigin).toBe('http://localhost:3020');
  });

  it('defaults to port 3000', () => {
    expect(loadConfig({ ...base }).webOrigin).toBe('http://localhost:3000');
  });

  it('honours an explicit origin, for reverse-proxied deployments', () => {
    const config = loadConfig({
      ...base,
      WITNESS_WEB_PORT: '3020',
      WITNESS_WEB_ORIGIN: 'https://witness.gov.example',
    });
    expect(config.webOrigin).toBe('https://witness.gov.example');
  });
});

describe('deployed public addresses', () => {
  it('accepts the independent Witness production domain contract', () => {
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
      WITNESS_PUBLIC_URL: 'https://buildwithwitness.com',
      WITNESS_WEB_ORIGIN: 'https://app.buildwithwitness.com',
      WITNESS_WEB_BASE_URL: 'https://app.buildwithwitness.com',
      OIDC_ISSUER: 'https://id.buildwithwitness.com/realms/witness',
      WITNESS_OIDC_REDIRECT_URI: 'https://api.buildwithwitness.com/api/v1/auth/callback',
    });
    expect(config.publicUrl).toBe('https://buildwithwitness.com');
    expect(config.webOrigin).toBe('https://app.buildwithwitness.com');
    expect(config.oidcIssuer).toBe('https://id.buildwithwitness.com/realms/witness');
  });

  it('rejects a malformed independent product URL', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        WITNESS_PUBLIC_URL: 'buildwithwitness.com',
      }),
    ).toThrow(/WITNESS_PUBLIC_URL is not a valid absolute URL/);
  });

  it('refuses a deployed profile that never states the browser origin', () => {
    const { WITNESS_WEB_ORIGIN: _omitted, ...withoutOrigin } = oidcBase;
    expect(() => loadConfig({ ...withoutOrigin, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' })).toThrow(
      /WITNESS_WEB_ORIGIN must be set explicitly/,
    );
  });

  it('refuses a deployed profile that never states the OIDC redirect URI', () => {
    const { WITNESS_OIDC_REDIRECT_URI: _omitted, ...withoutRedirect } = oidcBase;
    expect(() =>
      loadConfig({ ...withoutRedirect, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' }),
    ).toThrow(/WITNESS_OIDC_REDIRECT_URI must be set explicitly/);
  });

  it('refuses a localhost origin on a deployed instance', () => {
    // The failure this prevents is silent and misattributed: CORS refuses every
    // request from the real frontend, and the browser blames CORS rather than
    // the configuration that was copied from a developer's machine.
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        WITNESS_WEB_ORIGIN: 'https://localhost:3000',
      }),
    ).toThrow(/only reachable from the machine running Witness/);
  });

  it('refuses a plaintext redirect URI on a deployed instance', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        WITNESS_OIDC_REDIRECT_URI: 'http://pilot.example.org/api/v1/auth/callback',
      }),
    ).toThrow(/must use https/);
  });

  it('refuses a plaintext issuer on a deployed instance', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        OIDC_ISSUER: 'http://keycloak.example.org/realms/witness',
      }),
    ).toThrow(/must use https/);
  });

  it('reports both addresses at once rather than one restart at a time', () => {
    const { WITNESS_WEB_ORIGIN: _o, WITNESS_OIDC_REDIRECT_URI: _r, ...bare } = oidcBase;
    try {
      loadConfig({ ...bare, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' });
      expect.unreachable('expected a ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).problems).toHaveLength(2);
    }
  });

  it('still derives localhost defaults in development', () => {
    const config = loadConfig({ ...base });
    expect(config.webOrigin).toBe('http://localhost:3000');
    expect(config.oidcRedirectUri).toBe('http://localhost:3001/api/v1/auth/callback');
  });
});

describe('web base URL', () => {
  it('defaults to the root of the web origin', () => {
    const config = loadConfig({ ...oidcBase, WITNESS_DEPLOYMENT_PROFILE: 'sovereign' });
    expect(config.webBaseUrl).toBe('https://pilot.example.org/');
  });

  it('carries a sub-path, with the trailing slash the callback redirect needs', () => {
    // Without the trailing slash `new URL('auth/callback', base)` replaces the
    // last segment and the callback lands on somebody else's homepage.
    const config = loadConfig({
      ...oidcBase,
      WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
      WITNESS_WEB_BASE_URL: 'https://pilot.example.org/witness',
    });
    expect(config.webBaseUrl).toBe('https://pilot.example.org/witness/');
    expect(new URL('auth/callback', config.webBaseUrl).toString()).toBe(
      'https://pilot.example.org/witness/auth/callback',
    );
  });

  it('ATTACK — refuses a base URL on a different origin', () => {
    // The callback redirect carries a live session token in its fragment.
    // A base URL pointing elsewhere would be an open redirect that hands it over.
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        WITNESS_WEB_BASE_URL: 'https://attacker.example/witness',
      }),
    ).toThrow(/different origin/i);
  });

  it('refuses a base URL that is not a URL at all', () => {
    expect(() =>
      loadConfig({
        ...oidcBase,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        WITNESS_WEB_BASE_URL: '/witness',
      }),
    ).toThrow(/not a valid absolute URL/i);
  });
});
