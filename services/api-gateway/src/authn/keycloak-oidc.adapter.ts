/**
 * Real OIDC integration against Keycloak (ADR-0007).
 *
 * Written against the standard OIDC discovery document
 * (`${issuer}/.well-known/openid-configuration`) rather than hard-coded
 * Keycloak URL shapes, so the same adapter works against any spec-compliant
 * provider — matching ADR-0007's own note that Zitadel/Authentik are kept as
 * "alternative bindings behind `IdentityProviderPort`". It is still named
 * for Keycloak because that is the accepted decision this class implements.
 *
 * JWKS is fetched and cached by `jose`'s `createRemoteJWKSet` (an in-process
 * cache with automatic re-fetch on an unrecognised `kid`) rather than
 * hand-rolled — signature verification is exactly the kind of code a
 * project should not write itself.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import {
  IdentityProviderPort,
  type AuthorizationRequest,
  type VerifiedIdentity,
} from './identity-provider.port.js';

interface DiscoveryDocument {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
}

const DISCOVERY_REQUIRED_FIELDS = ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const;

/**
 * Node's global `fetch` applies no default timeout. `discover()` and
 * `exchangeCode()` both run on the request path for every sign-in, so a
 * Keycloak that accepts the TCP connection and then stalls would otherwise
 * hold those requests open indefinitely rather than failing fast.
 */
const OIDC_HTTP_TIMEOUT_MS = 5_000;

/**
 * How long a successful discovery document is trusted before the next call
 * re-fetches it. Keycloak's own discovery document is effectively static
 * per realm, so this is not about picking up frequent changes — it is
 * bounded refresh so a realm reconfiguration (a rotated endpoint, a moved
 * JWKS URI) is eventually picked up by a long-running process without a
 * restart, rather than being cached forever.
 */
const DISCOVERY_CACHE_TTL_MS = 60 * 60_000;

@Injectable()
export class KeycloakOidcAdapter extends IdentityProviderPort {
  readonly provider = 'keycloak';

  private readonly logger = new Logger(KeycloakOidcAdapter.name);
  // Cache the in-flight *promise*, not the resolved value — assigning only
  // after the fetch resolves would let every concurrent sign-in on a cold
  // adapter issue its own duplicate discovery request.
  private discovery: Promise<DiscoveryDocument> | null = null;
  private discoveryExpiresAt = 0;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly audience: string,
  ) {
    super();

    if (issuer.trim() === '' || clientId.trim() === '') {
      // Mirrors DevelopmentAuthorizationAdapter's fail-at-construction
      // posture: a server that starts and then rejects every sign-in is a
      // worse failure than one that refuses to start and says why. In
      // practice `loadConfig` (ADR-0013) already refuses to start without
      // these outside the development profile, so this is a second,
      // independent guard against this class ever being constructed with
      // an empty issuer.
      throw new Error(
        'KeycloakOidcAdapter requires a non-empty issuer and client id. ' +
          'Set OIDC_ISSUER and KEYCLOAK_CLIENT_ID.',
      );
    }
  }

  private async discover(): Promise<DiscoveryDocument> {
    if (this.discovery !== null && Date.now() < this.discoveryExpiresAt) {
      return this.discovery;
    }

    this.discoveryExpiresAt = Date.now() + DISCOVERY_CACHE_TTL_MS;
    this.discovery = (async () => {
      const response = await fetch(`${this.issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(OIDC_HTTP_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Could not fetch the OIDC discovery document from '${this.issuer}' ` +
            `(HTTP ${response.status}). Is the identity provider reachable and is OIDC_ISSUER correct?`,
        );
      }

      const document = (await response.json()) as Partial<DiscoveryDocument>;
      for (const field of DISCOVERY_REQUIRED_FIELDS) {
        if (typeof document[field] !== 'string' || document[field].trim() === '') {
          throw new Error(
            `OIDC discovery document from '${this.issuer}' is missing required field '${field}'.`,
          );
        }
      }

      return document as DiscoveryDocument;
    })().catch((error: unknown) => {
      // Do not cache a failed discovery — the next call must retry rather
      // than being stuck reusing a rejected promise forever. This never
      // weakens verification: a failed discovery means `getJwks()` and
      // `buildAuthorizationRequest()` fail closed (they throw, sign-in
      // does not proceed), never that issuer/audience/signature/JWKS
      // checks are skipped.
      this.discovery = null;
      throw error;
    });

    return this.discovery;
  }

  private async getJwks(): Promise<JWTVerifyGetKey> {
    if (this.jwks !== null) return this.jwks;
    const discovery = await this.discover();
    this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    return this.jwks;
  }

  async buildAuthorizationRequest(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
    prompt?: 'create';
  }): Promise<AuthorizationRequest> {
    const discovery = await this.discover();

    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (input.prompt !== undefined) url.searchParams.set('prompt', input.prompt);

    return { url: url.toString(), state: input.state };
  }

  async buildPasswordResetUrl(input: { redirectUri: string }): Promise<string> {
    const discovery = await this.discover();
    const endpoint = new URL(discovery.authorization_endpoint);
    endpoint.pathname = endpoint.pathname.replace(/\/auth$/, '/forgot-credentials');
    endpoint.searchParams.set('client_id', this.clientId);
    endpoint.searchParams.set('redirect_uri', input.redirectUri);
    return endpoint.toString();
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ idToken: string }> {
    const discovery = await this.discover();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.clientId,
      code_verifier: input.codeVerifier,
    });

    if (this.clientSecret.trim() !== '') {
      body.set('client_secret', this.clientSecret);
    }

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(OIDC_HTTP_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Never log the response body — it can carry the authorization code
      // or, on some providers, an error description echoing request
      // parameters. The status code is enough to diagnose a misconfigured
      // client from the server logs.
      this.logger.warn(`Token exchange failed with HTTP ${response.status}.`);
      throw new Error('Could not exchange the authorization code for tokens.');
    }

    const payload = (await response.json()) as { id_token?: string };

    if (payload.id_token === undefined) {
      throw new Error('Token response did not include an id_token.');
    }

    return { idToken: payload.id_token };
  }

  async verifyIdToken(idToken: string, expectedNonce: string): Promise<VerifiedIdentity> {
    const jwks = await this.getJwks();

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: this.issuer,
      audience: this.audience,
    });

    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      throw new Error('ID token has no subject claim.');
    }

    if (payload['nonce'] !== expectedNonce) {
      throw new Error('ID token nonce does not match the one issued for this sign-in attempt.');
    }

    return {
      subject: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
      emailVerified: payload['email_verified'] === true,
      name: typeof payload['name'] === 'string' ? payload['name'] : null,
    };
  }
}
