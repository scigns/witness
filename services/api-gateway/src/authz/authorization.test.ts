/**
 * Authorisation boundary tests.
 *
 * The guarantee under test is not "the dev adapter works". It is that the dev
 * adapter **cannot reach a non-development profile**, because it performs no
 * authentication at all. If this file stops passing, the preview's permissive
 * behaviour has become reachable in production.
 */

import { describe, expect, it } from 'vitest';

import { DevelopmentAuthorizationAdapter } from './development.adapter.js';

const adapter = () => new DevelopmentAuthorizationAdapter('development');

describe('DevelopmentAuthorizationAdapter — profile containment', () => {
  it.each(['sovereign', 'hybrid', 'production', ''])(
    'REFUSES to be constructed in the %s profile',
    (profile) => {
      expect(() => new DevelopmentAuthorizationAdapter(profile)).toThrow(/cannot be used in the/i);
    },
  );

  it('constructs in the development profile', () => {
    expect(() => adapter()).not.toThrow();
  });
});

describe('authenticate', () => {
  it('returns null for an absent header — anonymous access is not granted', async () => {
    expect(await adapter().authenticate(undefined)).toBeNull();
  });

  it('returns null for an empty header', async () => {
    expect(await adapter().authenticate('   ')).toBeNull();
  });

  it('parses name and role', async () => {
    const principal = await adapter().authenticate('A. Reviewer|reviewer');
    expect(principal?.displayName).toBe('A. Reviewer');
    expect(principal?.roles).toEqual(['reviewer']);
  });

  it('does not upgrade an unknown role to a default — it grants nothing', async () => {
    const principal = await adapter().authenticate('Someone|superadmin');
    expect(principal?.roles).toEqual([]);
  });

  it('defaults a missing role to reader, the least privileged', async () => {
    const principal = await adapter().authenticate('Someone');
    expect(principal?.roles).toEqual(['reader']);
  });
});

describe('decide — deny by default', () => {
  it('denies every action to a principal with no roles', async () => {
    const subject = { subject: 'dev:x', displayName: 'x', kind: 'human' as const, roles: [] };

    for (const action of ['record:read', 'record:create', 'record:review'] as const) {
      const decision = await adapter().decide(subject, action);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/denied by default/);
    }
  });

  it('grants a reader reads but not writes', async () => {
    const reader = {
      subject: 'dev:r',
      displayName: 'r',
      kind: 'human' as const,
      roles: ['reader'],
    };

    expect((await adapter().decide(reader, 'record:read')).allowed).toBe(true);
    expect((await adapter().decide(reader, 'record:create')).allowed).toBe(false);
    expect((await adapter().decide(reader, 'record:review')).allowed).toBe(false);
  });

  it('grants a contributor creation but NOT review — P4 separation of duties', async () => {
    const contributor = {
      subject: 'dev:c',
      displayName: 'c',
      kind: 'human' as const,
      roles: ['contributor'],
    };

    expect((await adapter().decide(contributor, 'record:create')).allowed).toBe(true);
    expect((await adapter().decide(contributor, 'record:review')).allowed).toBe(false);
  });

  it('grants a reviewer everything in this build', async () => {
    const reviewer = {
      subject: 'dev:v',
      displayName: 'v',
      kind: 'human' as const,
      roles: ['reviewer'],
    };

    for (const action of ['record:read', 'record:create', 'record:review'] as const) {
      expect((await adapter().decide(reviewer, action)).allowed).toBe(true);
    }
  });

  it('explains every denial — an opaque denial is unfixable', async () => {
    const decision = await adapter().decide(
      { subject: 'dev:r', displayName: 'r', kind: 'human', roles: ['reader'] },
      'record:review',
    );
    expect(decision.reason).toContain('reader');
    expect(decision.reason).toContain('record:review');
  });
});
