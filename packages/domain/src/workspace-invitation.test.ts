/**
 * WorkspaceInvitation lifecycle tests (ADR-0028). Covers the state machine
 * and the security-relevant invariants this feature is asked to guarantee
 * by construction: email-mismatch rejection, expiry rejection, no
 * double-accept, and that accept/decline/revoke/resend never mutate
 * workspaceId or role.
 */

import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import {
  toActorId,
  toUserId,
  toOrganisationId,
  toWorkspaceId,
  toWorkspaceInvitationId,
} from './ids.js';
import {
  acceptWorkspaceInvitation,
  canTransitionWorkspaceInvitation,
  createWorkspaceInvitation,
  declineWorkspaceInvitation,
  markWorkspaceInvitationExpired,
  recordWorkspaceInvitationDelivery,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  WORKSPACE_INVITATION_STATUSES,
} from './workspace-invitation.js';

const HUMAN = createActor({
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A. Facilitator',
});

const ORGANISATION_ID = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE_ID = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const INVITER_ID = toUserId('44444444-4444-4444-8444-444444444444');
const INVITEE_ID = toUserId('55555555-5555-4555-8555-555555555555');
const INVITATION_ID = toWorkspaceInvitationId('66666666-6666-4666-8666-666666666666');
const AT = new Date('2026-09-22T10:00:00Z');
const EXPIRES = new Date('2026-09-29T10:00:00Z');
const TOKEN_HASH = 'a'.repeat(64);

function baseInvitation(overrides: Partial<Parameters<typeof createWorkspaceInvitation>[0]> = {}) {
  return createWorkspaceInvitation({
    id: INVITATION_ID,
    organisationId: ORGANISATION_ID,
    workspaceId: WORKSPACE_ID,
    invitedEmail: 'reviewer@partner.org',
    invitedName: 'C. Reviewer',
    inviterId: INVITER_ID,
    role: 'reviewer',
    affiliationType: 'organisation',
    affiliationLabel: 'Partner Org',
    message: 'Please review evidence for the Teacher Voice programme.',
    tokenHash: TOKEN_HASH,
    expiresAt: EXPIRES,
    invitedBy: HUMAN,
    at: AT,
    ...overrides,
  }).invitation;
}

describe('createWorkspaceInvitation', () => {
  it('creates a pending invitation with the given role, affiliation and expiry', () => {
    const invitation = baseInvitation();

    expect(invitation.status).toBe('pending');
    expect(invitation.role).toBe('reviewer');
    expect(invitation.affiliationType).toBe('organisation');
    expect(invitation.affiliationLabel).toBe('Partner Org');
    expect(invitation.invitedEmail).toBe('reviewer@partner.org');
    expect(invitation.resendCount).toBe(0);
    expect(invitation.deliveryStatus).toBe('pending');
  });

  it('normalises the invited email to lowercase', () => {
    const invitation = baseInvitation({ invitedEmail: 'Reviewer@Partner.ORG' });
    expect(invitation.invitedEmail).toBe('reviewer@partner.org');
  });

  it('rejects a malformed email', () => {
    expect(() => baseInvitation({ invitedEmail: 'not-an-email' })).toThrow(/well-formed email/i);
  });

  it('rejects an unrecognised role', () => {
    expect(() => baseInvitation({ role: 'superuser' })).toThrow(/not a recognised Witness role/i);
  });

  it('rejects an unrecognised affiliation type', () => {
    expect(() => baseInvitation({ affiliationType: 'employee' })).toThrow(
      /not a recognised affiliation type/i,
    );
  });

  it('rejects an expiry that is not in the future', () => {
    expect(() => baseInvitation({ expiresAt: AT })).toThrow(/must expire in the future/i);
  });

  it('rejects an empty token hash', () => {
    expect(() => baseInvitation({ tokenHash: '' })).toThrow(/requires a token hash/i);
  });

  it('produces a workspace_invitation.created audit event naming the role and affiliation', () => {
    const outcome = createWorkspaceInvitation({
      id: INVITATION_ID,
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      invitedEmail: 'steward@community.example',
      inviterId: INVITER_ID,
      role: 'steward',
      affiliationType: 'community',
      affiliationLabel: 'River Valley Community',
      tokenHash: TOKEN_HASH,
      expiresAt: EXPIRES,
      invitedBy: HUMAN,
      at: AT,
    });

    expect(outcome.event.action).toBe('workspace_invitation.created');
    expect(outcome.event.metadata['role']).toBe('steward');
    expect(outcome.event.metadata['affiliationType']).toBe('community');
  });
});

describe('WorkspaceInvitation state machine', () => {
  it.each(['accepted', 'declined', 'revoked', 'expired'] as const)(
    'permits pending -> %s',
    (to) => {
      expect(canTransitionWorkspaceInvitation('pending', to)).toBe(true);
    },
  );

  it('permits expired -> pending (resend reopens it)', () => {
    expect(canTransitionWorkspaceInvitation('expired', 'pending')).toBe(true);
  });

  it.each(['accepted', 'declined', 'revoked'] as const)(
    '%s is terminal — no transitions out',
    (from) => {
      for (const to of WORKSPACE_INVITATION_STATUSES) {
        expect(canTransitionWorkspaceInvitation(from, to)).toBe(false);
      }
    },
  );
});

describe('acceptWorkspaceInvitation', () => {
  it('accepts a pending, unexpired invitation when the email matches', () => {
    const invitation = baseInvitation();
    const outcome = acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, AT);

    expect(outcome.invitation.status).toBe('accepted');
    expect(outcome.invitation.acceptedByUserId).toBe(INVITEE_ID);
    expect(outcome.invitation.acceptedAt).toEqual(AT);
    expect(outcome.event.action).toBe('workspace_invitation.accepted');
    // The invitation itself is the sole source of workspaceId/role — nothing
    // about accept() can change what it grants access to.
    expect(outcome.invitation.workspaceId).toBe(WORKSPACE_ID);
    expect(outcome.invitation.role).toBe('reviewer');
  });

  it('rejects acceptance when the signed-in email does not match the invited email', () => {
    const invitation = baseInvitation();
    expect(() => acceptWorkspaceInvitation(invitation, INVITEE_ID, false, HUMAN, AT)).toThrow(
      /does not match/i,
    );
  });

  it('rejects acceptance of an expired invitation, even while status is still pending', () => {
    const invitation = baseInvitation();
    const afterExpiry = new Date(EXPIRES.getTime() + 1000);
    expect(() =>
      acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, afterExpiry),
    ).toThrow(/expired/i);
  });

  it('rejects a second acceptance of an already-accepted invitation — no replay', () => {
    const invitation = baseInvitation();
    const once = acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, AT).invitation;

    expect(() => acceptWorkspaceInvitation(once, INVITEE_ID, true, HUMAN, AT)).toThrow(
      /cannot accept an invitation in status 'accepted'/i,
    );
  });

  it('rejects acceptance of a declined invitation', () => {
    const invitation = baseInvitation();
    const declined = declineWorkspaceInvitation(invitation, HUMAN, AT).invitation;

    expect(() => acceptWorkspaceInvitation(declined, INVITEE_ID, true, HUMAN, AT)).toThrow(
      /cannot (accept|decline|revoke) an invitation in status/i,
    );
  });

  it('rejects acceptance of a revoked invitation', () => {
    const invitation = baseInvitation();
    const revoked = revokeWorkspaceInvitation(invitation, HUMAN, AT).invitation;

    expect(() => acceptWorkspaceInvitation(revoked, INVITEE_ID, true, HUMAN, AT)).toThrow(
      /cannot (accept|decline|revoke) an invitation in status/i,
    );
  });
});

describe('declineWorkspaceInvitation', () => {
  it('declines a pending invitation', () => {
    const invitation = baseInvitation();
    const outcome = declineWorkspaceInvitation(invitation, HUMAN, AT);

    expect(outcome.invitation.status).toBe('declined');
    expect(outcome.invitation.declinedAt).toEqual(AT);
    expect(outcome.event.action).toBe('workspace_invitation.declined');
  });

  it('refuses to decline a non-pending invitation', () => {
    const invitation = baseInvitation();
    const accepted = acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, AT).invitation;
    expect(() => declineWorkspaceInvitation(accepted, HUMAN, AT)).toThrow(
      /cannot (accept|decline|revoke) an invitation in status/i,
    );
  });
});

describe('revokeWorkspaceInvitation', () => {
  it('revokes a pending invitation', () => {
    const invitation = baseInvitation();
    const outcome = revokeWorkspaceInvitation(invitation, HUMAN, AT);

    expect(outcome.invitation.status).toBe('revoked');
    expect(outcome.invitation.revokedAt).toEqual(AT);
  });

  it('refuses to revoke an already-accepted invitation — revoke never touches a granted membership', () => {
    const invitation = baseInvitation();
    const accepted = acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, AT).invitation;
    expect(() => revokeWorkspaceInvitation(accepted, HUMAN, AT)).toThrow(
      /cannot (accept|decline|revoke) an invitation in status/i,
    );
  });
});

describe('markWorkspaceInvitationExpired', () => {
  it('expires a pending invitation once past its expiry time', () => {
    const invitation = baseInvitation();
    const after = new Date(EXPIRES.getTime() + 1);
    const outcome = markWorkspaceInvitationExpired(invitation, HUMAN, after);
    expect(outcome.invitation.status).toBe('expired');
  });

  it('refuses to expire an invitation before its expiry time', () => {
    const invitation = baseInvitation();
    expect(() => markWorkspaceInvitationExpired(invitation, HUMAN, AT)).toThrow(/not reached/i);
  });
});

describe('resendWorkspaceInvitation', () => {
  it('rotates the token and extends expiry on the same invitation id — no second active grant path', () => {
    const invitation = baseInvitation();
    const newExpiry = new Date(EXPIRES.getTime() + 7 * 24 * 60 * 60 * 1000);
    const outcome = resendWorkspaceInvitation(invitation, 'b'.repeat(64), newExpiry, HUMAN, AT);

    expect(outcome.invitation.id).toBe(invitation.id);
    expect(outcome.invitation.tokenHash).toBe('b'.repeat(64));
    expect(outcome.invitation.tokenHash).not.toBe(invitation.tokenHash);
    expect(outcome.invitation.status).toBe('pending');
    expect(outcome.invitation.resendCount).toBe(1);
    expect(outcome.invitation.workspaceId).toBe(WORKSPACE_ID);
    expect(outcome.invitation.role).toBe('reviewer');
  });

  it('reopens an expired invitation to pending', () => {
    const invitation = baseInvitation();
    const expired = markWorkspaceInvitationExpired(
      invitation,
      HUMAN,
      new Date(EXPIRES.getTime() + 1),
    ).invitation;

    const outcome = resendWorkspaceInvitation(
      expired,
      'c'.repeat(64),
      new Date(EXPIRES.getTime() + 7 * 24 * 60 * 60 * 1000),
      HUMAN,
      AT,
    );

    expect(outcome.invitation.status).toBe('pending');
  });

  it('refuses to resend an already-accepted invitation', () => {
    const invitation = baseInvitation();
    const accepted = acceptWorkspaceInvitation(invitation, INVITEE_ID, true, HUMAN, AT).invitation;
    expect(() =>
      resendWorkspaceInvitation(
        accepted,
        'd'.repeat(64),
        new Date(EXPIRES.getTime() + 1000),
        HUMAN,
        AT,
      ),
    ).toThrow(/cannot resend/i);
  });

  it('refuses to resend a revoked invitation', () => {
    const invitation = baseInvitation();
    const revoked = revokeWorkspaceInvitation(invitation, HUMAN, AT).invitation;
    expect(() =>
      resendWorkspaceInvitation(
        revoked,
        'e'.repeat(64),
        new Date(EXPIRES.getTime() + 1000),
        HUMAN,
        AT,
      ),
    ).toThrow(/cannot resend/i);
  });
});

describe('recordWorkspaceInvitationDelivery', () => {
  it('tracks delivery success independently of invitation status', () => {
    const invitation = baseInvitation();
    const outcome = recordWorkspaceInvitationDelivery(invitation, { status: 'sent' }, HUMAN, AT);

    expect(outcome.invitation.deliveryStatus).toBe('sent');
    expect(outcome.invitation.deliveryAttempts).toBe(1);
    expect(outcome.invitation.lastDeliveryError).toBeNull();
    // Business state is untouched by delivery outcome.
    expect(outcome.invitation.status).toBe('pending');
  });

  it('tracks delivery failure with the error, without touching invitation status', () => {
    const invitation = baseInvitation();
    const outcome = recordWorkspaceInvitationDelivery(
      invitation,
      { status: 'failed', error: 'SMTP timeout' },
      HUMAN,
      AT,
    );

    expect(outcome.invitation.deliveryStatus).toBe('failed');
    expect(outcome.invitation.lastDeliveryError).toBe('SMTP timeout');
    expect(outcome.invitation.status).toBe('pending');
    expect(outcome.event.action).toBe('workspace_invitation.delivery_failed');
  });
});
