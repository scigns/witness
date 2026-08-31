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
});
