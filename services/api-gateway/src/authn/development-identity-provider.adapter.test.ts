/**
 * Tests against the REAL JWT/JWKS verification path — `jwtVerify` runs for
 * real here, against real RSA-signed tokens, exactly as it does against a
 * live Keycloak's tokens in `KeycloakOidcAdapter`. This is what stands in
 * for "valid token", "invalid signature", "wrong issuer", "wrong audience",
 * and "expired identity" test coverage in an environment with no way to run
 * a live Keycloak container (`dockerd` is unreachable here — see the
 * adapter's own header comment).
 */

import { SignJWT, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';

import { DevelopmentIdentityProviderAdapter } from './development-identity-provider.adapter.js';
import {
  codeChallengeFor,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce.helper.js';

const API_ORIGIN = 'http://localhost:3001';
const AUDIENCE = 'witness-api';
const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/callback';

function adapter(): DevelopmentIdentityProviderAdapter {
  return new DevelopmentIdentityProviderAdapter('development', API_ORIGIN, AUDIENCE);
}

async function completeSignIn(
  idp: DevelopmentIdentityProviderAdapter,
  overrides: Partial<{ subject: string; email: string; name: string }> = {},
) {
  const nonce = generateNonce();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFor(codeVerifier);

  const code = idp.registerAuthorizationAttempt({
    nonce,
    codeChallenge,
    redirectUri: REDIRECT_URI,
    subject: overrides.subject ?? 'user-1',
    email: overrides.email ?? 'person@example.com',
    name: overrides.name ?? 'Person',
  });

  const { idToken } = await idp.exchangeCode({ code, codeVerifier, redirectUri: REDIRECT_URI });
  return { idToken, nonce };
}

describe('DevelopmentIdentityProviderAdapter — profile containment', () => {
  it.each(['sovereign', 'hybrid', 'production', ''])(
    'REFUSES to be constructed in the %s profile',
    (profile) => {
      expect(() => new DevelopmentIdentityProviderAdapter(profile, API_ORIGIN, AUDIENCE)).toThrow(
        /cannot be used in the/i,
      );
    },
  );
});

describe('the authorization-code-with-PKCE flow, end to end, against real signed tokens', () => {
  it('issues a session-worthy verified identity for a valid code and verifier', async () => {
    const idp = adapter();
    const { idToken, nonce } = await completeSignIn(idp, {
      subject: 'abc123',
      email: 'a@example.com',
      name: 'A. Person',
    });

    const verified = await idp.verifyIdToken(idToken, nonce);
    expect(verified.subject).toBe('abc123');
    expect(verified.email).toBe('a@example.com');
    expect(verified.emailVerified).toBe(true);
    expect(verified.name).toBe('A. Person');
  });

  it('ATTACK — rejects an ID token with an invalid signature', async () => {
    const idp = adapter();
    const { idToken, nonce } = await completeSignIn(idp);

    // Flip a character deep in the signature segment.
    const parts = idToken.split('.');
    const tamperedSignature = parts[2]!.slice(0, -1) + (parts[2]!.endsWith('A') ? 'B' : 'A');
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    await expect(idp.verifyIdToken(tampered, nonce)).rejects.toThrow();
  });

  it('ATTACK — rejects a token signed by a different key entirely', async () => {
    const idp = adapter();
    const { nonce } = await completeSignIn(idp);
    const { privateKey } = await generateKeyPair('RS256');

    const forged = await new SignJWT({ nonce })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('attacker')
      .setIssuer(`${API_ORIGIN}/api/v1/auth/dev-idp`)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(idp.verifyIdToken(forged, nonce)).rejects.toThrow();
  });

  it('ATTACK — rejects a token with the wrong issuer', async () => {
    // Both adapters share a key pair, so the signature verifies — only the
    // issuer claim can fail. Without the shared key, `jwtVerify` rejects on
    // signature before ever reaching the issuer check, and this test would
    // pass for the wrong reason (as it previously did).
    const keyPair = await generateKeyPair('RS256');
    const idp = new DevelopmentIdentityProviderAdapter(
      'development',
      API_ORIGIN,
      AUDIENCE,
      keyPair,
    );
    const otherIdp = new DevelopmentIdentityProviderAdapter(
      'development',
      'http://localhost:9999',
      AUDIENCE,
      keyPair,
    );

    const { nonce } = await completeSignIn(idp);
    const { idToken } = await completeSignIn(otherIdp, { subject: 'x' });

    await expect(idp.verifyIdToken(idToken, nonce)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      claim: 'iss',
    });
  });

  it('ATTACK — rejects a token with the wrong audience', async () => {
    // Same reasoning as the issuer test — a shared key pair means only the
    // audience claim can be the reason `jwtVerify` rejects.
    const keyPair = await generateKeyPair('RS256');
    const idp = new DevelopmentIdentityProviderAdapter(
      'development',
      API_ORIGIN,
      'witness-api',
      keyPair,
    );
    const otherAudienceIdp = new DevelopmentIdentityProviderAdapter(
      'development',
      API_ORIGIN,
      'some-other-client',
      keyPair,
    );

    const { idToken, nonce } = await completeSignIn(otherAudienceIdp);
    await expect(idp.verifyIdToken(idToken, nonce)).rejects.toMatchObject({
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      claim: 'aud',
    });
  });

  it('ATTACK — rejects an expired token', async () => {
    // Signed with the exact key pair `idp` verifies against, so the
    // signature is valid — only the (already-past) expiration claim can be
    // the reason verification fails. `exchangeCode` always mints a 5-minute
    // token, so there is no way to reach an expired token through the
    // adapter's own public surface; minting one directly with the shared
    // key via jose is the only way to test this claim specifically.
    const keyPair = await generateKeyPair('RS256');
    const idp = new DevelopmentIdentityProviderAdapter(
      'development',
      API_ORIGIN,
      AUDIENCE,
      keyPair,
    );
    const nonce = generateNonce();

    const expired = await new SignJWT({ nonce, email: 'x@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('x')
      .setIssuer(`${API_ORIGIN}/api/v1/auth/dev-idp`)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(keyPair.privateKey);

    await expect(idp.verifyIdToken(expired, nonce)).rejects.toMatchObject({
      code: 'ERR_JWT_EXPIRED',
    });
  });

  it('ATTACK — rejects a token whose nonce does not match the sign-in attempt', async () => {
    const idp = adapter();
    const { idToken } = await completeSignIn(idp);

    await expect(idp.verifyIdToken(idToken, 'a-different-nonce')).rejects.toThrow(/nonce/i);
  });

  it('ATTACK — rejects a code exchange with the wrong PKCE verifier', async () => {
    const idp = adapter();
    const nonce = generateNonce();
    const codeChallenge = codeChallengeFor(generateCodeVerifier());

    const code = idp.registerAuthorizationAttempt({
      nonce,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      subject: 'user-1',
      email: 'a@example.com',
      name: 'A',
    });

    await expect(
      idp.exchangeCode({ code, codeVerifier: 'wrong-verifier', redirectUri: REDIRECT_URI }),
    ).rejects.toThrow(/code_verifier/i);
  });

  it('ATTACK — rejects a code exchange with a mismatched redirect_uri', async () => {
    const idp = adapter();
    const nonce = generateNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeFor(codeVerifier);

    const code = idp.registerAuthorizationAttempt({
      nonce,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      subject: 'user-1',
      email: 'a@example.com',
      name: 'A',
    });

    await expect(
      idp.exchangeCode({
        code,
        codeVerifier,
        redirectUri: 'http://evil.example/callback',
      }),
    ).rejects.toThrow(/redirect_uri/i);
  });

  it('ATTACK — rejects a replayed authorization code', async () => {
    const idp = adapter();
    const nonce = generateNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeFor(codeVerifier);

    const code = idp.registerAuthorizationAttempt({
      nonce,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      subject: 'user-1',
      email: 'a@example.com',
      name: 'A',
    });

    await idp.exchangeCode({ code, codeVerifier, redirectUri: REDIRECT_URI });

    await expect(
      idp.exchangeCode({ code, codeVerifier, redirectUri: REDIRECT_URI }),
    ).rejects.toThrow(/unknown or expired/i);
  });

  it('rejects an unknown authorization code', async () => {
    const idp = adapter();
    await expect(
      idp.exchangeCode({
        code: 'never-issued',
        codeVerifier: generateCodeVerifier(),
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow(/unknown or expired/i);
  });
});

describe('buildAuthorizationRequest', () => {
  it('builds a URL pointing at the dev-idp authorize endpoint with the required parameters', async () => {
    const idp = adapter();
    const state = generateState();
    const nonce = generateNonce();
    const codeChallenge = codeChallengeFor(generateCodeVerifier());

    const request = await idp.buildAuthorizationRequest({
      state,
      nonce,
      codeChallenge,
      redirectUri: REDIRECT_URI,
    });

    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/v1/auth/dev-idp/authorize');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('nonce')).toBe(nonce);
    expect(url.searchParams.get('code_challenge')).toBe(codeChallenge);
    expect(request.state).toBe(state);
  });
});
