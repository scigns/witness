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

@Injectable()
export class KeycloakOidcAdapter extends IdentityProviderPort {
  readonly provider = 'keycloak';

  private readonly logger = new Logger(KeycloakOidcAdapter.name);
  private discovery: DiscoveryDocument | null = null;
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
    if (this.discovery !== null) return this.discovery;

    const response = await fetch(`${this.issuer}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error(
        `Could not fetch the OIDC discovery document from '${this.issuer}' ` +
          `(HTTP ${response.status}). Is the identity provider reachable and is OIDC_ISSUER correct?`,
      );
    }

    this.discovery = (await response.json()) as DiscoveryDocument;
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

    return { url: url.toString(), state: input.state };
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
