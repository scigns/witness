/**
 * IdentityProviderPort — the integration boundary named in ADR-0007.
 *
 * ADR-0007's own "Reversal" section names this exact seam: "IdentityProviderPort
 * ... make[s] substitution an adapter change." `KeycloakOidcAdapter` is the real,
 * production-shaped implementation; `DevelopmentIdentityProviderAdapter` is a
 * development-only double that speaks the identical OIDC/JWT contract against a
 * locally-generated signing key rather than a live Keycloak instance, so the
 * authorization-code-with-PKCE flow and the JWT/JWKS verification code run for
 * real in every environment, including one with no way to run a Keycloak
 * container.
 */

export interface AuthorizationRequest {
  readonly url: string;
  readonly state: string;
}

/**
 * Claims verified from a signed ID token — never the raw token itself, and
 * never more than the application needs. `subject` is the one field that
 * must never be treated as optional: it is the OIDC `sub` claim, the stable
 * key `identity-link.ts` keys on.
 */
export interface VerifiedIdentity {
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly name: string | null;
}

export abstract class IdentityProviderPort {
  /** The provider name recorded on an `IdentityLink` — e.g. `'keycloak'`. */
  abstract readonly provider: string;

  /**
   * Build the authorization-code-with-PKCE request. `codeChallenge` is the
   * S256 hash of a verifier the caller keeps (server-side — see
   * `AuthLoginAttempt`); `nonce` is echoed back inside the ID token and
   * checked at verification time to bind the token to this specific
   * authentication attempt.
   */
  abstract buildAuthorizationRequest(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<AuthorizationRequest>;

  /**
   * Exchange an authorization code for tokens. Returns the raw ID token
   * only — an access token, if the provider issues one, is discarded: this
   * application never calls a provider API on the user's behalf, so there
   * is nothing for it to authorize, and holding it would be one more
   * secret to leak.
   */
  abstract exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ idToken: string }>;

  /**
   * Verify an ID token's signature, issuer, audience and expiry, and that
   * its `nonce` claim matches the one issued for this attempt. Returns the
   * verified claims; throws on any failure — there is no partial-trust
   * result.
   */
  abstract verifyIdToken(idToken: string, expectedNonce: string): Promise<VerifiedIdentity>;
}
