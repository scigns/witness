import { describe, expect, it } from 'vitest';

import { toActorId } from './ids.js';
import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  toCoDesignSessionId,
  toOrganisationId,
  toSessionParticipantId,
  toUserId,
  toWorkspaceId,
} from './ids.js';
import {
  ANONYMOUS_DISPLAY_NAME,
  addParticipant,
  changeLinkedUser,
  restoreParticipant,
  updateAttendanceStatus,
  updateFacilitatorNotes,
  updateIdentityVisibility,
  updateInvitationStatus,
  updateParticipantDetails,
  withdrawParticipant,
  type SessionParticipant,
} from './session-participant.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const LINKED_USER = toUserId('55555555-5555-4555-8555-555555555555');

function baseInput() {
  return {
    id: toSessionParticipantId('66666666-6666-4666-8666-666666666666'),
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    participantType: 'community_representative',
    participationMode: 'in_person' as const,
    identityMode: 'named' as const,
    displayName: 'Aroha Ngata',
    addedBy: HUMAN,
    at: NOW,
  };
}

function namedParticipant(): SessionParticipant {
  return addParticipant('draft', baseInput()).participant;
}

describe('addParticipant', () => {
  it('creates a named participant with the supplied display name', () => {
    const { participant, event } = addParticipant('draft', baseInput());
    expect(participant.displayName).toBe('Aroha Ngata');
    expect(participant.identityMode).toBe('named');
    expect(participant.invitationStatus).toBe('not_invited');
    expect(participant.attendanceStatus).toBe('expected');
    expect(participant.consentStatusSummary).toBe('not_configured');
    expect(participant.version).toBe(1);
    expect(event.action).toBe('session_participant.added');
  });

  it('creates a pseudonymous participant and retains an internal linked-user record', () => {
    const { participant } = addParticipant('draft', {
      ...baseInput(),
      identityMode: 'pseudonymous',
      displayName: 'River',
      linkedUserId: LINKED_USER,
    });
    expect(participant.displayName).toBe('River');
    expect(participant.identityMode).toBe('pseudonymous');
    expect(participant.linkedUserId).toBe(LINKED_USER);
  });

  it('creates an anonymous participant with a forced generic display name and no identifying fields', () => {
    const { participant } = addParticipant('draft', {
      ...baseInput(),
      identityMode: 'anonymous',
      displayName: 'Should be ignored',
      preferredName: 'Should be ignored',
      pronouns: 'they/them',
      affiliation: 'Some org',
    });
    expect(participant.displayName).toBe(ANONYMOUS_DISPLAY_NAME);
    expect(participant.preferredName).toBeNull();
    expect(participant.pronouns).toBeNull();
    expect(participant.affiliation).toBeNull();
    expect(participant.linkedUserId).toBeNull();
  });

  it('ATTACK — rejects linking a registered user to an anonymous participant', () => {
    expect(() =>
      addParticipant('draft', {
        ...baseInput(),
        identityMode: 'anonymous',
        linkedUserId: LINKED_USER,
      }),
    ).toThrow(/cannot be linked/i);
  });

  it('creates a non-registered participant (no linkedUserId)', () => {
    const { participant } = addParticipant('draft', baseInput());
    expect(participant.linkedUserId).toBeNull();
  });

  it('creates a registered participant linked to a Witness user', () => {
    const { participant } = addParticipant('draft', { ...baseInput(), linkedUserId: LINKED_USER });
    expect(participant.linkedUserId).toBe(LINKED_USER);
  });

  it('rejects a named participant with no display name', () => {
    expect(() => addParticipant('draft', { ...baseInput(), displayName: '' })).toThrow(
      InvariantViolation,
    );
  });

  it('defaults identityVisibility to facilitators_only', () => {
    const { participant } = addParticipant('draft', baseInput());
    expect(participant.identityVisibility).toBe('facilitators_only');
  });

  it.each(['draft', 'scheduled', 'open'] as const)(
    'permits adding a participant while the session is %s',
    (status) => {
      expect(() => addParticipant(status, baseInput())).not.toThrow();
    },
  );

  it.each(['closed', 'archived'] as const)(
    'ATTACK — rejects adding a participant while the session is %s',
    (status) => {
      expect(() => addParticipant(status, baseInput())).toThrow(/cannot add or update/i);
    },
  );
});

describe('updateParticipantDetails', () => {
  it('updates descriptive fields and bumps the version', () => {
    const participant = namedParticipant();
    const { participant: next, event } = updateParticipantDetails(
      participant,
      'open',
      HUMAN,
      { affiliation: 'Community council' },
      LATER,
    );
    expect(next.affiliation).toBe('Community council');
    expect(next.version).toBe(2);
    expect(event.metadata['changedFields']).toBe('affiliation');
  });

  it('rejects an update with no changed fields', () => {
    const participant = namedParticipant();
    expect(() => updateParticipantDetails(participant, 'open', HUMAN, {}, LATER)).toThrow(
      /at least one field/i,
    );
  });

  it('ATTACK — rejects setting a display name on an anonymous participant', () => {
    const { participant } = addParticipant('draft', { ...baseInput(), identityMode: 'anonymous' });
    expect(() =>
      updateParticipantDetails(participant, 'open', HUMAN, { displayName: 'New name' }, LATER),
    ).toThrow(/does not have an editable display name/i);
  });

  it.each(['closed', 'archived'] as const)(
    'ATTACK — rejects updating a participant while the session is %s',
    (status) => {
      const participant = namedParticipant();
      expect(() =>
        updateParticipantDetails(participant, status, HUMAN, { affiliation: 'X' }, LATER),
      ).toThrow(/cannot add or update/i);
    },
  );
});

describe('changeLinkedUser', () => {
  it('links a registered user to a named participant', () => {
    const participant = namedParticipant();
    const { participant: next } = changeLinkedUser(participant, 'open', HUMAN, LINKED_USER, LATER);
    expect(next.linkedUserId).toBe(LINKED_USER);
  });

  it('unlinks a registered user', () => {
    const { participant } = addParticipant('draft', { ...baseInput(), linkedUserId: LINKED_USER });
    const { participant: next } = changeLinkedUser(participant, 'open', HUMAN, null, LATER);
    expect(next.linkedUserId).toBeNull();
  });

  it('rejects a no-op link change', () => {
    const participant = namedParticipant();
    expect(() => changeLinkedUser(participant, 'open', HUMAN, null, LATER)).toThrow(/must differ/i);
  });

  it('ATTACK — rejects linking an anonymous participant', () => {
    const { participant } = addParticipant('draft', { ...baseInput(), identityMode: 'anonymous' });
    expect(() => changeLinkedUser(participant, 'open', HUMAN, LINKED_USER, LATER)).toThrow(
      /cannot be linked/i,
    );
  });
});

describe('updateIdentityVisibility', () => {
  it('changes visibility and audits the transition', () => {
    const participant = namedParticipant();
    const { participant: next, event } = updateIdentityVisibility(
      participant,
      'open',
      HUMAN,
      'visible_to_all_participants',
      LATER,
    );
    expect(next.identityVisibility).toBe('visible_to_all_participants');
    expect(event.metadata['to']).toBe('visible_to_all_participants');
  });

  it('rejects a no-op visibility change', () => {
    const participant = namedParticipant();
    expect(() =>
      updateIdentityVisibility(participant, 'open', HUMAN, participant.identityVisibility, LATER),
    ).toThrow(/must differ/i);
  });
});

describe('updateInvitationStatus', () => {
  it('walks not_invited -> invited -> accepted', () => {
    let participant = namedParticipant();
    participant = updateInvitationStatus(participant, 'draft', HUMAN, 'invited', LATER).participant;
    expect(participant.invitationStatus).toBe('invited');
    participant = updateInvitationStatus(
      participant,
      'draft',
      HUMAN,
      'accepted',
      LATER,
    ).participant;
    expect(participant.invitationStatus).toBe('accepted');
  });

  it('allows re-inviting after a decline', () => {
    let participant = namedParticipant();
    participant = updateInvitationStatus(participant, 'draft', HUMAN, 'invited', LATER).participant;
    participant = updateInvitationStatus(
      participant,
      'draft',
      HUMAN,
      'declined',
      LATER,
    ).participant;
    participant = updateInvitationStatus(participant, 'draft', HUMAN, 'invited', LATER).participant;
    expect(participant.invitationStatus).toBe('invited');
  });

  it('ATTACK — rejects an invalid invitation transition', () => {
    const participant = namedParticipant();
    expect(() => updateInvitationStatus(participant, 'draft', HUMAN, 'accepted', LATER)).toThrow(
      /invalid_invitation_transition|cannot move/i,
    );
  });

  it.each(['closed', 'archived'] as const)(
    'ATTACK — rejects an invitation change while the session is %s',
    (status) => {
      const participant = namedParticipant();
      expect(() => updateInvitationStatus(participant, status, HUMAN, 'invited', LATER)).toThrow(
        /cannot add or update/i,
      );
    },
  );
});

describe('updateAttendanceStatus', () => {
  it('records attendance while the session is open', () => {
    const participant = namedParticipant();
    const { participant: next } = updateAttendanceStatus(
      participant,
      'open',
      HUMAN,
      'present',
      LATER,
    );
    expect(next.attendanceStatus).toBe('present');
  });

  it('corrects a mistaken attendance mark after the session closes', () => {
    const participant = namedParticipant();
    const present = updateAttendanceStatus(
      participant,
      'open',
      HUMAN,
      'present',
      LATER,
    ).participant;
    const corrected = updateAttendanceStatus(present, 'closed', HUMAN, 'absent', LATER).participant;
    expect(corrected.attendanceStatus).toBe('absent');
  });

  it('ATTACK — rejects recording attendance while the session is still a draft', () => {
    const participant = namedParticipant();
    expect(() => updateAttendanceStatus(participant, 'draft', HUMAN, 'present', LATER)).toThrow(
      /cannot record attendance/i,
    );
  });

  it('ATTACK — rejects recording attendance on an archived session', () => {
    const participant = namedParticipant();
    expect(() => updateAttendanceStatus(participant, 'archived', HUMAN, 'present', LATER)).toThrow(
      /cannot record attendance/i,
    );
  });
});

describe('updateFacilitatorNotes', () => {
  it('sets restricted facilitator notes', () => {
    const participant = namedParticipant();
    const { participant: next, event } = updateFacilitatorNotes(
      participant,
      'open',
      HUMAN,
      'Prefers written follow-up.',
      LATER,
    );
    expect(next.facilitatorNotes).toBe('Prefers written follow-up.');
    expect(event.action).toBe('session_participant.notes_changed');
  });

  it('clears notes when given null', () => {
    const participant = namedParticipant();
    const withNotes = updateFacilitatorNotes(participant, 'open', HUMAN, 'note', LATER).participant;
    const cleared = updateFacilitatorNotes(withNotes, 'open', HUMAN, null, LATER).participant;
    expect(cleared.facilitatorNotes).toBeNull();
  });
});

describe('withdrawParticipant / restoreParticipant', () => {
  it('withdraws a participant with a reason', () => {
    const participant = namedParticipant();
    const { participant: next, event } = withdrawParticipant(
      participant,
      'open',
      HUMAN,
      'Requested by participant',
      LATER,
    );
    expect(next.withdrawnAt).toEqual(LATER);
    expect(event.metadata['reason']).toBe('Requested by participant');
  });

  it('withdraws a participant from a closed session', () => {
    const participant = namedParticipant();
    expect(() => withdrawParticipant(participant, 'closed', HUMAN, null, LATER)).not.toThrow();
  });

  it('ATTACK — rejects withdrawing an already-withdrawn participant', () => {
    const participant = namedParticipant();
    const withdrawn = withdrawParticipant(participant, 'open', HUMAN, null, LATER).participant;
    expect(() => withdrawParticipant(withdrawn, 'open', HUMAN, null, LATER)).toThrow(
      /already been withdrawn/i,
    );
  });

  it('ATTACK — rejects withdrawing a participant from an archived session', () => {
    const participant = namedParticipant();
    expect(() => withdrawParticipant(participant, 'archived', HUMAN, null, LATER)).toThrow(
      /read-only/i,
    );
  });

  it('restores a withdrawn participant', () => {
    const participant = namedParticipant();
    const withdrawn = withdrawParticipant(participant, 'open', HUMAN, null, LATER).participant;
    const { participant: restored, event } = restoreParticipant(withdrawn, 'open', HUMAN, LATER);
    expect(restored.withdrawnAt).toBeNull();
    expect(event.action).toBe('session_participant.restored');
  });

  it('ATTACK — rejects restoring a participant that was never withdrawn', () => {
    const participant = namedParticipant();
    expect(() => restoreParticipant(participant, 'open', HUMAN, LATER)).toThrow(
      /has not been withdrawn/i,
    );
  });
});
