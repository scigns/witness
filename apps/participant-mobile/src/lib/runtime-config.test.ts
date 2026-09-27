import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from './runtime-config.js';

describe('resolveApiBaseUrl', () => {
  it('falls back to localhost only in the development profile', () => {
    expect(resolveApiBaseUrl({})).toBe('http://localhost:3001');
    expect(resolveApiBaseUrl({ VITE_WITNESS_BUILD_PROFILE: 'development' })).toBe(
      'http://localhost:3001',
    );
  });

  it('fails closed outside development with no configured URL — never silently picks a default production origin', () => {
    expect(() => resolveApiBaseUrl({ VITE_WITNESS_BUILD_PROFILE: 'production' })).toThrow(
      /must be set outside the development profile/,
    );
  });

  it('accepts a well-formed HTTPS production URL', () => {
    expect(
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'production',
        VITE_WITNESS_API_URL: 'https://witness-prod-api.pacificdigitalconsultancy.org/',
      }),
    ).toBe('https://witness-prod-api.pacificdigitalconsultancy.org');
  });

  it('rejects a malformed URL', () => {
    expect(() =>
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'production',
        VITE_WITNESS_API_URL: 'not-a-url',
      }),
    ).toThrow(/absolute HTTP\(S\) URL/);
  });

  it('rejects plain HTTP outside development — a store-shipped binary gets no exception', () => {
    expect(() =>
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'production',
        VITE_WITNESS_API_URL: 'http://api.example.org',
      }),
    ).toThrow(/must use HTTPS outside the development profile/);
  });

  it('allows plain HTTP in development, e.g. a LAN address for physical-device testing', () => {
    expect(
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'development',
        VITE_WITNESS_API_URL: 'http://192.168.1.50:3001',
      }),
    ).toBe('http://192.168.1.50:3001');
  });

  it('rejects a URL carrying embedded credentials', () => {
    expect(() =>
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'production',
        VITE_WITNESS_API_URL: 'https://user:pass@api.example.org',
      }),
    ).toThrow(/must not contain credentials/);
  });

  it('strips a trailing slash so callers can concatenate paths safely', () => {
    expect(
      resolveApiBaseUrl({
        VITE_WITNESS_BUILD_PROFILE: 'production',
        VITE_WITNESS_API_URL: 'https://api.example.org/',
      }),
    ).toBe('https://api.example.org');
  });
});
