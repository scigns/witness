import { describe, expect, it, vi, afterEach } from 'vitest';

import { fetchPublishedStories, resolveApiBaseUrl } from '../src/lib/stories-api';

describe('resolveApiBaseUrl', () => {
  it('defaults to localhost outside production', () => {
    expect(resolveApiBaseUrl({})).toBe('http://localhost:3001');
  });

  it('requires WITNESS_MARKETING_API_URL when WITNESS_MARKETING_ENV=production', () => {
    expect(() => resolveApiBaseUrl({ WITNESS_MARKETING_ENV: 'production' })).toThrow(/must be set/);
  });

  it('accepts an explicit HTTPS URL in production', () => {
    expect(
      resolveApiBaseUrl({
        WITNESS_MARKETING_ENV: 'production',
        WITNESS_MARKETING_API_URL: 'https://api.buildwithwitness.com',
      }),
    ).toBe('https://api.buildwithwitness.com');
  });

  it('rejects HTTP in production', () => {
    expect(() =>
      resolveApiBaseUrl({
        WITNESS_MARKETING_ENV: 'production',
        WITNESS_MARKETING_API_URL: 'http://api.buildwithwitness.com',
      }),
    ).toThrow(/HTTPS/);
  });

  it('rejects a malformed URL', () => {
    expect(() => resolveApiBaseUrl({ WITNESS_MARKETING_API_URL: 'not a url' })).toThrow(
      /absolute HTTP/,
    );
  });

  it('rejects embedded credentials', () => {
    expect(() =>
      resolveApiBaseUrl({ WITNESS_MARKETING_API_URL: 'https://user:pass@api.example.com' }),
    ).toThrow(/credentials/);
  });

  it('strips a trailing slash', () => {
    expect(resolveApiBaseUrl({ WITNESS_MARKETING_API_URL: 'https://api.example.com/' })).toBe(
      'https://api.example.com',
    );
  });
});

describe('fetchPublishedStories', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed to an empty list on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );
    expect(await fetchPublishedStories({})).toEqual([]);
  });

  it('fails closed to an empty list on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    expect(await fetchPublishedStories({})).toEqual([]);
  });

  it('fails closed to an empty list on an unexpected response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ not: 'an array' }), { status: 200 })),
      ),
    );
    expect(await fetchPublishedStories({})).toEqual([]);
  });

  it('returns the published stories on a normal response', async () => {
    const stories = [
      { organisationLabel: 'A Witness customer', quote: 'Q', context: 'C', role: 'Participant' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(stories), { status: 200 }))),
    );
    expect(await fetchPublishedStories({})).toEqual(stories);
  });

  it('fails closed to an empty list rather than throwing when the API URL is misconfigured', async () => {
    expect(await fetchPublishedStories({ WITNESS_MARKETING_ENV: 'production' })).toEqual([]);
  });
});
