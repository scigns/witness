/**
 * `discover()` is private, so these tests exercise it indirectly through
 * `buildAuthorizationRequest` (the cheapest public method that calls it) —
 * this is deliberate: what's under test is the caching/timeout/validation
 * *behaviour* around the fetch, not `discover()` as a unit in isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeycloakOidcAdapter } from './keycloak-oidc.adapter.js';

const ISSUER = 'https://keycloak.example.org/realms/witness';
const CLIENT_ID = 'witness-api';
const AUDIENCE = 'witness-api';

const VALID_DISCOVERY_DOCUMENT = {
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adapter(): KeycloakOidcAdapter {
  return new KeycloakOidcAdapter(ISSUER, CLIENT_ID, '', AUDIENCE);
}

function authorizeCall(idp: KeycloakOidcAdapter) {
  return idp.buildAuthorizationRequest({
    state: 'state-1',
    nonce: 'nonce-1',
    codeChallenge: 'challenge-1',
    redirectUri: 'http://localhost:3001/api/v1/auth/callback',
  });
}

describe('KeycloakOidcAdapter — construction', () => {
  it('refuses an empty issuer', () => {
    expect(() => new KeycloakOidcAdapter('', CLIENT_ID, '', AUDIENCE)).toThrow(/non-empty issuer/i);
  });

  it('refuses an empty client id', () => {
    expect(() => new KeycloakOidcAdapter(ISSUER, '', '', AUDIENCE)).toThrow(/non-empty issuer/i);
  });
});

describe('KeycloakOidcAdapter — discovery', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches the discovery document and builds an authorization URL from it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_DISCOVERY_DOCUMENT));

    const request = await authorizeCall(adapter());

    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(VALID_DISCOVERY_DOCUMENT.authorization_endpoint);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
  });

  it('passes a timeout signal on the discovery fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_DISCOVERY_DOCUMENT));

    await authorizeCall(adapter());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with a clear error when the provider responds non-ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));

    await expect(authorizeCall(adapter())).rejects.toThrow(/HTTP 503/);
  });

  it('rejects when the discovery document is missing a required field', async () => {
    const { authorization_endpoint: _omitted, ...incomplete } = VALID_DISCOVERY_DOCUMENT;
    fetchMock.mockResolvedValueOnce(jsonResponse(incomplete));

    await expect(authorizeCall(adapter())).rejects.toThrow(/authorization_endpoint/);
  });

  it('does not cache a failed discovery — the next call retries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_DISCOVERY_DOCUMENT));

    const idp = adapter();
    await expect(authorizeCall(idp)).rejects.toThrow();
    await expect(authorizeCall(idp)).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent discovery requests into a single fetch', async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const idp = adapter();
    const first = authorizeCall(idp);
    const second = authorizeCall(idp);

    resolveFetch(jsonResponse(VALID_DISCOVERY_DOCUMENT));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a cached discovery document within the TTL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VALID_DISCOVERY_DOCUMENT));

    const idp = adapter();
    await authorizeCall(idp);
    await authorizeCall(idp);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the discovery document after the cache TTL expires', async () => {
    vi.useFakeTimers();
    // A fresh Response per call — a Response body can only be read once,
    // and `mockResolvedValue` would hand out the same instance both times.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(VALID_DISCOVERY_DOCUMENT)));

    const idp = adapter();
    await authorizeCall(idp);

    // Just past the adapter's one-hour discovery cache TTL.
    vi.setSystemTime(Date.now() + 61 * 60_000);

    await authorizeCall(idp);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
