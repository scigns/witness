/**
 * PKCE and state/nonce generation for the OIDC authorization-code flow
 * (ADR-0007: "Authentication: OIDC authorization code with PKCE").
 *
 * All three values are high-entropy random strings from `node:crypto`, never
 * `Math.random()` — state and nonce are the only things standing between a
 * legitimate callback and a forged one.
 */

import { createHash, randomBytes } from 'node:crypto';

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateState(): string {
  return randomToken(32);
}

export function generateNonce(): string {
  return randomToken(32);
}

export function generateCodeVerifier(): string {
  // RFC 7636 permits 43-128 characters; 32 random bytes base64url-encode to 43.
  return randomToken(32);
}

/** S256 code challenge, per RFC 7636 §4.2 — never the "plain" method. */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
