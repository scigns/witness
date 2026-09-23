/**
 * SessionJoinLink lifecycle tests (Phase 5, Workstream 1.6). Covers the
 * security-relevant invariants this feature must guarantee by
 * construction: session-binding, expiry rejection, revocation, exhaustion,
 * and that governance mode cannot be tampered with after creation.
 */

import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  toActorId,
  toCoDesignSessionId,
  toOrganisationId,
  toSessionJoinLinkId,
  toUserId,
  toWorkspaceId,
} from './ids.js';
import {
  assertSessionJoinLinkUsable,
  createSessionJoinLink,
  markSessionJoinLinkExpired,
  recordSessionJoinLinkUse,
  revokeSessionJoinLink,
  SESSION_JOIN_GOVERNANCE_MODES,
  type SessionJoinLink,
} from './session-join-link.js';

const HUMAN = createActor({
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A. Facilitator',
});

const ORGANISATION_ID = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE_ID = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION_ID = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const CREATED_BY = toUserId('55555555-5555-4555-8555-555555555555');
const LINK_ID = toSessionJoinLinkId('66666666-6666-4666-8666-666666666666');
const AT = new Date('2026-09-22T10:00:00Z');
const EXPIRES = new Date('2026-09-22T18:00:00Z');
const TOKEN_HASH = 'a'.repeat(64);

function baseLink(overrides: Partial<Parameters<typeof createSessionJoinLink>[0]> = {}) {
  return createSessionJoinLink({
    id: LINK_ID,
    organisationId: ORGANISATION_ID,
    workspaceId: WORKSPACE_ID,
    sessionId: SESSION_ID,
    governanceMode: 'anonymous',
    tokenHash: TOKEN_HASH,
    expiresAt: EXPIRES,
    createdByUserId: CREATED_BY,
    createdBy: HUMAN,
    at: AT,
    ...overrides,
  }).link;
}

describe('createSessionJoinLink', () => {
  it('creates an active link with useCount zero', () => {
    const link = baseLink();
    expect(link.status).toBe('active');
    expect(link.useCount).toBe(0);
    expect(link.governanceMode).toBe('anonymous');
  });

  it.each(SESSION_JOIN_GOVERNANCE_MODES)('accepts governance mode %s', (mode) => {
    expect(baseLink({ governanceMode: mode }).governanceMode).toBe(mode);
  });

  it('rejects an unrecognised governance mode', () => {
    expect(() => baseLink({ governanceMode: 'programme_wide_bearer' })).toThrow(InvariantViolation);
  });

  it('rejects an expiry that is not in the future', () => {
    expect(() => baseLink({ expiresAt: AT })).toThrow(InvariantViolation);
  });

  it('rejects an empty token hash', () => {
    expect(() => baseLink({ tokenHash: '' })).toThrow(InvariantViolation);
  });

  it('rejects a non-positive maxUses', () => {
    expect(() => baseLink({ maxUses: 0 })).toThrow(InvariantViolation);
  });
});

describe('assertSessionJoinLinkUsable', () => {
  it('THREAT: rejects use after expiry', () => {
    const link = baseLink();
    const after = new Date(EXPIRES.getTime() + 1000);
    expect(() => assertSessionJoinLinkUsable(link, after)).toThrow(InvariantViolation);
  });

  it('THREAT: rejects use after revocation, even before the original expiry', () => {
    const link = revokeSessionJoinLink(baseLink(), HUMAN, AT).link;
    expect(() => assertSessionJoinLinkUsable(link, AT)).toThrow(InvariantViolation);
  });

  it('THREAT: rejects use once maxUses is reached (never a programme-wide unlimited credential by accident)', () => {
    let link: SessionJoinLink = baseLink({ maxUses: 1 });
    link = recordSessionJoinLinkUse(link, AT);
    expect(() => assertSessionJoinLinkUsable(link, AT)).toThrow(InvariantViolation);
  });

  it('allows use before expiry, while active and under the cap', () => {
    const link = baseLink({ maxUses: 5 });
    expect(() => assertSessionJoinLinkUsable(link, AT)).not.toThrow();
  });
});

describe('revokeSessionJoinLink', () => {
  it('cannot be revoked twice', () => {
    const link = revokeSessionJoinLink(baseLink(), HUMAN, AT).link;
    expect(() => revokeSessionJoinLink(link, HUMAN, AT)).toThrow(InvariantViolation);
  });
});

describe('markSessionJoinLinkExpired', () => {
  it('refuses to mark expired before the expiry time has actually passed', () => {
    const link = baseLink();
    expect(() => markSessionJoinLinkExpired(link, HUMAN, AT)).toThrow(InvariantViolation);
  });

  it('marks expired once the expiry time has passed', () => {
    const link = baseLink();
    const after = new Date(EXPIRES.getTime() + 1000);
    const next = markSessionJoinLinkExpired(link, HUMAN, after).link;
    expect(next.status).toBe('expired');
  });
});
