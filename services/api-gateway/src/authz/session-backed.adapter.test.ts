/**
 * The guarantee under test: outside the development profile, the unverified
 * `X-Witness-Dev-User` header path is unreachable through
 * `SessionBackedAuthorizationAdapter` no matter what the header says — the
 * class never even constructs a `DevelopmentAuthorizationAdapter` to ask.
 */

import { describe, expect, it } from 'vitest';

import { SessionBackedAuthorizationAdapter } from './session-backed.adapter.js';

describe('SessionBackedAuthorizationAdapter — development bypass containment', () => {
  it.each(['sovereign', 'hybrid', 'production', ''])(
    "authenticate() returns null for any header in the '%s' profile",
    async (profile) => {
      const adapter = new SessionBackedAuthorizationAdapter(profile);
      expect(await adapter.authenticate('Forged Admin|admin')).toBeNull();
      expect(await adapter.authenticate(undefined)).toBeNull();
    },
  );

  it('authenticate() delegates to the dev adapter in the development profile', async () => {
    const adapter = new SessionBackedAuthorizationAdapter('development');
    const principal = await adapter.authenticate('A Developer|reviewer');
    expect(principal?.displayName).toBe('A Developer');
    expect(principal?.roles).toEqual(['reviewer']);
  });

  it('decide() applies the shared role-grants table regardless of profile', async () => {
    const adapter = new SessionBackedAuthorizationAdapter('sovereign');
    const decision = await adapter.decide(
      { subject: 'user:1', displayName: 'Someone', kind: 'human', roles: ['reader'] },
      'record:read',
    );
    expect(decision.allowed).toBe(true);
  });
});
