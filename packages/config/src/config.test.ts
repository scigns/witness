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

describe('loadConfig', () => {
  it('accepts a minimal valid development configuration', () => {
    const config = loadConfig({ ...base });
    expect(config.profile).toBe('development');
    expect(config.apiPort).toBe(3001);
    expect(config.externalInferenceEnabled).toBe(false);
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
        ...base,
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
      ...base,
      NODE_ENV: 'production',
      WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
    });
    expect(config.externalInferenceEnabled).toBe(false);
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
      ...base,
      WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
      EXTERNAL_MODEL_PROVIDER: 'openai',
      ALLOW_EXTERNAL_MODEL_EGRESS: 'true',
    });
    expect(config.externalInferenceEnabled).toBe(true);
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
