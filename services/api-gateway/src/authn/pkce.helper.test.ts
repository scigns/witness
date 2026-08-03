import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  codeChallengeFor,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce.helper.js';

describe('PKCE and state/nonce generation', () => {
  it('generates high-entropy, URL-safe state, nonce, and verifier values', () => {
    const state = generateState();
    const nonce = generateNonce();
    const verifier = generateCodeVerifier();

    for (const value of [state, nonce, verifier]) {
      expect(value.length).toBeGreaterThanOrEqual(32);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('never repeats across calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateState()));
    expect(values.size).toBe(20);
  });

  it('computes the RFC 7636 S256 code challenge', () => {
    const verifier = 'a-fixed-test-verifier-value-for-reproducibility';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(codeChallengeFor(verifier)).toBe(expected);
  });

  it('a wrong verifier produces a different challenge — this is what stops a stolen code from being redeemed', () => {
    const verifier = generateCodeVerifier();
    const wrongVerifier = generateCodeVerifier();
    expect(codeChallengeFor(verifier)).not.toBe(codeChallengeFor(wrongVerifier));
  });
});
