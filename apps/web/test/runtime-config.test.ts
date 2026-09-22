import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from '../src/lib/runtime-config';

describe('browser API origin contract', () => {
  it('uses the independent API origin for a production bundle', () => {
    expect(
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'sovereign',
        NEXT_PUBLIC_WITNESS_API_URL: 'https://api.buildwithwitness.com/',
      }),
    ).toBe('https://api.buildwithwitness.com');
  });

  it('keeps the development localhost fallback', () => {
    expect(resolveApiBaseUrl({ WITNESS_BUILD_PROFILE: 'development' })).toBe(
      'http://localhost:3001',
    );
  });

  it('requires an explicit API origin outside development', () => {
    expect(() => resolveApiBaseUrl({ WITNESS_BUILD_PROFILE: 'sovereign' })).toThrow(
      /must be set outside/i,
    );
  });

  it.each([
    'api.buildwithwitness.com',
    'javascript:alert(1)',
    'https://user:password@api.example.org',
  ])('rejects unsafe API origin %s', (value) => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'sovereign',
        NEXT_PUBLIC_WITNESS_API_URL: value,
      }),
    ).toThrow();
  });

  it('rejects plaintext API origins outside development', () => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'sovereign',
        NEXT_PUBLIC_WITNESS_API_URL: 'http://api.example.org',
      }),
    ).toThrow(/must use HTTPS/i);
  });

  it('allows plaintext API origins only for local development', () => {
    expect(
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'development',
        NEXT_PUBLIC_WITNESS_API_URL: 'http://localhost:3001',
      }),
    ).toBe('http://localhost:3001');
  });
});

// A monorepo-root `.env` legitimately pointed at a real deployment for
// unrelated ops work on the same machine silently redirected a local `next
// dev` session's browser traffic at that same real API — caught mid-session
// once already (two stray `GET /api/v1/me` calls landing on the live pilot
// host instead of localhost). These are the regression tests for that
// specific footgun, not a general re-test of the branches above.
describe('local-by-default development guard', () => {
  it('accepts private-network and .local addresses in development (LAN device testing)', () => {
    for (const host of [
      'http://127.0.0.1:3001',
      'http://192.168.1.20:3001',
      'http://my-mac.local:3001',
    ]) {
      expect(
        resolveApiBaseUrl({
          WITNESS_BUILD_PROFILE: 'development',
          NEXT_PUBLIC_WITNESS_API_URL: host,
        }),
      ).toBe(host);
    }
  });

  it('ATTACK — refuses a real, non-local API URL in development by default', () => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'development',
        NEXT_PUBLIC_WITNESS_API_URL: 'https://witness-api.pacificdigitalconsultancy.org',
      }),
    ).toThrow(/Refusing to start/);
  });

  it('the refusal names the escape hatch and warns it must not live in the shared root .env', () => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'development',
        NEXT_PUBLIC_WITNESS_API_URL: 'https://witness-api.pacificdigitalconsultancy.org',
      }),
    ).toThrow(/NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API/);
  });

  it('a real remote API is reachable in development once explicitly acknowledged', () => {
    expect(
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'development',
        NEXT_PUBLIC_WITNESS_API_URL: 'https://witness-api.pacificdigitalconsultancy.org',
        NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API: 'true',
      }),
    ).toBe('https://witness-api.pacificdigitalconsultancy.org');
  });

  it('the guard does not apply outside development — a real deployment always states its own API', () => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_BUILD_PROFILE: 'sovereign',
        NEXT_PUBLIC_WITNESS_API_URL: 'https://witness-api.pacificdigitalconsultancy.org',
      }),
    ).not.toThrow();
  });
});
