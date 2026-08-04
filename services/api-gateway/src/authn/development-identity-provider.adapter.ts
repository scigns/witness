/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT ONLY — NOT A REAL IDENTITY PROVIDER                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Exists so the full authorization-code-with-PKCE flow and real JWT/JWKS
 * verification (`KeycloakOidcAdapter`'s exact code path — this class extends
 * the same `IdentityProviderPort` and is verified by the same
 * `jwtVerify` call) can be exercised end to end without a live Keycloak
 * container. That matters here specifically: this environment cannot run
 * Docker (`dockerd` is unreachable — confirmed, not assumed), so a live
 * Keycloak instance is not available to develop or verify against.
 *
 * What it does: signs ID tokens with an RSA key pair generated once at
 * construction, using the same `jose` verification path Keycloak's real
 * tokens go through. What it is NOT: it performs no check that the caller is
 * who they claim — `chooseIdentity` accepts any subject/email/name the
 * caller supplies. This is exactly as unverified as the
 * `X-Witness-Dev-User` header it exists alongside, dressed in a real
 * protocol so the *rest* of the authentication code — session issuance,
 * user mapping, principal construction — is exercised for real.
 *
 * The constructor throws outside the development profile, identical to
 * `DevelopmentAuthorizationAdapter`. There is no configuration in which this
 * reaches production.
 */

import { Injectable, Logger } from '@nestjs/common';
import { generateKeyPair, SignJWT, jwtVerify, type CryptoKey } from 'jose';
import { randomUUID } from 'node:crypto';

import {
  IdentityProviderPort,
  type AuthorizationRequest,
  type VerifiedIdentity,
} from './identity-provider.port.js';

interface PendingAuthorization {
  readonly subject: string;
  readonly email: string;
  readonly name: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly expiresAt: number;
}

const ATTEMPT_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DevelopmentIdentityProviderAdapter extends IdentityProviderPort {
  readonly provider = 'keycloak';

  private readonly logger = new Logger(DevelopmentIdentityProviderAdapter.name);
  private readonly pending = new Map<string, PendingAuthorization>();
  private keysReady: Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }>;

  readonly issuer: string;
  private readonly audience: string;

  /**
   * `keyPair` exists for tests only. Production code always omits it, so a
   * fresh key is generated per instance — the whole point of the double is
   * that it holds a key nothing else has. Tests that need to prove
   * `verifyIdToken` actually checks issuer, audience, or expiry (rather than
   * failing on signature mismatch before those checks ever run) construct
   * two adapters that *share* a key pair, so a token signed by one verifies
   * its signature successfully against the other and the claim under test
   * is what fails.
   */
  constructor(
    profile: string,
    apiOrigin: string,
    audience: string,
    keyPair?: { publicKey: CryptoKey; privateKey: CryptoKey },
  ) {
    super();

    if (profile !== 'development') {
      throw new Error(
        `DevelopmentIdentityProviderAdapter cannot be used in the '${profile}' profile. ` +
          'It performs no identity verification. Configure OIDC_ISSUER for the real ' +
          'KeycloakOidcAdapter instead.',
      );
    }

    this.issuer = `${apiOrigin}/api/v1/auth/dev-idp`;
    this.audience = audience.trim() !== '' ? audience : 'witness-api';
    this.keysReady = keyPair !== undefined ? Promise.resolve(keyPair) : generateKeyPair('RS256');

    this.logger.warn(
      'Using the DEVELOPMENT identity provider double. Tokens are signed locally and prove ' +
        'nothing about who the caller actually is. Never expose this beyond localhost.',
    );
  }

  /**
   * Called by the dev-idp "authorize" endpoint — see
   * `authentication.controller.ts`. Returns the authorization `code` the
   * endpoint redirects back to Witness with; `exchangeCode` looks the
   * attempt up by that code, exactly mirroring how a real IdP's code and
   * state are two distinct values.
   */
  registerAuthorizationAttempt(input: {
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
    subject: string;
    email: string;
    name: string;
  }): string {
    const code = randomUUID();
    this.pending.set(code, {
      subject: input.subject,
      email: input.email,
      name: input.name,
      nonce: input.nonce,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      expiresAt: Date.now() + ATTEMPT_TTL_MS,
    });
    return code;
  }

  buildAuthorizationRequest(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<AuthorizationRequest> {
    const url = new URL(`${this.issuer}/authorize`);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('redirect_uri', input.redirectUri);

    return Promise.resolve({ url: url.toString(), state: input.state });
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ idToken: string }> {
    const attempt = this.pending.get(input.code);
    this.pending.delete(input.code);

    if (attempt === undefined || attempt.expiresAt < Date.now()) {
      throw new Error('Unknown or expired development sign-in attempt.');
    }

    if (attempt.redirectUri !== input.redirectUri) {
      throw new Error('redirect_uri does not match the one used to start this attempt.');
    }

    const { createHash } = await import('node:crypto');
    const expectedChallenge = createHash('sha256').update(input.codeVerifier).digest('base64url');
    if (expectedChallenge !== attempt.codeChallenge) {
      throw new Error('PKCE code_verifier does not match the code_challenge for this attempt.');
    }

    const { privateKey } = await this.keysReady;

    const idToken = await new SignJWT({
      email: attempt.email,
      email_verified: true,
      name: attempt.name,
      nonce: attempt.nonce,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(attempt.subject)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti(randomUUID())
      .sign(privateKey);

    return { idToken };
  }

  async verifyIdToken(idToken: string, expectedNonce: string): Promise<VerifiedIdentity> {
    const { publicKey } = await this.keysReady;

    const { payload } = await jwtVerify(idToken, publicKey, {
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
