import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toReviewAssignmentId,
  toUserId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  assignReviewer,
  cancelAssignment,
  completeAssignment,
  isActiveAssignment,
  reassignFrom,
  startReview,
  type AssignReviewerInput,
  type ReviewAssignment,
} from './review-assignment.js';

const FACILITATOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const EVIDENCE = toEvidenceId('55555555-5555-4555-8555-555555555555');
const ASSIGNMENT_ID = toReviewAssignmentId('66666666-6666-4666-8666-666666666666');
const ASSIGNMENT_ID_2 = toReviewAssignmentId('69999999-9999-4999-8999-999999999999');
const REVIEWER_USER = toUserId('77777777-7777-4777-8777-777777777777');

function baseInput(): AssignReviewerInput {
  return {
    id: ASSIGNMENT_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    evidenceId: EVIDENCE,
    reviewerUserId: REVIEWER_USER,
    assignedBy: FACILITATOR,
    at: NOW,
  };
}

function assignedAssignment(): ReviewAssignment {
  return assignReviewer(baseInput()).assignment;
}

function inProgressAssignment(): ReviewAssignment {
  return startReview(assignedAssignment(), FACILITATOR, NOW).assignment;
}

describe('assignReviewer', () => {
  it('creates an assignment in the assigned status', () => {
    const { assignment, event } = assignReviewer(baseInput());
    expect(assignment.status).toBe('assigned');
    expect(assignment.reassignedFromId).toBeNull();
    expect(assignment.version).toBe(1);
    expect(event.action).toBe('review_assignment.assigned');
  });

  it('records reassignedFromId when provided', () => {
    const { assignment } = assignReviewer({
      ...baseInput(),
      id: ASSIGNMENT_ID_2,
      reassignedFromId: ASSIGNMENT_ID,
    });
    expect(assignment.reassignedFromId).toBe(ASSIGNMENT_ID);
  });
});

describe('startReview', () => {
  it('moves an assigned assignment to in_progress', () => {
    const { assignment, event } = startReview(assignedAssignment(), FACILITATOR, LATER);
    expect(assignment.status).toBe('in_progress');
    expect(assignment.startedAt).toEqual(LATER);
    expect(event.action).toBe('review_assignment.started');
  });

  it('ATTACK — rejects starting an already in-progress assignment', () => {
    expect(() => startReview(inProgressAssignment(), FACILITATOR, LATER)).toThrow(
      /assigned review can be started/i,
    );
  });

  it('ATTACK — rejects starting a completed assignment', () => {
    const completed = completeAssignment(inProgressAssignment(), FACILITATOR, NOW).assignment;
    expect(() => startReview(completed, FACILITATOR, LATER)).toThrow(
      /assigned review can be started/i,
    );
  });
});

describe('completeAssignment', () => {
  it('moves an in-progress assignment to completed', () => {
    const { assignment, event } = completeAssignment(inProgressAssignment(), FACILITATOR, LATER);
    expect(assignment.status).toBe('completed');
    expect(assignment.completedAt).toEqual(LATER);
    expect(event.action).toBe('review_assignment.completed');
  });

  it('ATTACK — rejects completing an assignment that has not started', () => {
    expect(() => completeAssignment(assignedAssignment(), FACILITATOR, LATER)).toThrow(
      /in-progress review can be completed/i,
    );
  });

  it('ATTACK — rejects completing an already-completed assignment', () => {
    const completed = completeAssignment(inProgressAssignment(), FACILITATOR, NOW).assignment;
    expect(() => completeAssignment(completed, FACILITATOR, LATER)).toThrow(
      /in-progress review can be completed/i,
    );
  });
});

describe('cancelAssignment', () => {
  it('cancels an active assignment, preserving a reason', () => {
    const { assignment, event } = cancelAssignment(
      assignedAssignment(),
      FACILITATOR,
      'Reviewer unavailable.',
      LATER,
    );
    expect(assignment.status).toBe('cancelled');
    expect(assignment.closeReason).toBe('Reviewer unavailable.');
    expect(event.metadata['reason']).toBe('Reviewer unavailable.');
  });

  it('ATTACK — rejects cancelling a completed assignment', () => {
    const completed = completeAssignment(inProgressAssignment(), FACILITATOR, NOW).assignment;
    expect(() => cancelAssignment(completed, FACILITATOR, null, LATER)).toThrow(
      /active assignment can be cancelled/i,
    );
  });
});

describe('reassignFrom', () => {
  it('closes the prior assignment without deleting it', () => {
    const original = assignedAssignment();
    const { assignment, event } = reassignFrom(original, FACILITATOR, 'Wrong reviewer.', LATER);
    expect(assignment.status).toBe('reassigned');
    expect(assignment.id).toBe(original.id);
    expect(assignment.closeReason).toBe('Wrong reviewer.');
    expect(event.action).toBe('review_assignment.reassigned');
  });

  it('ATTACK — rejects reassigning a completed assignment', () => {
    const completed = completeAssignment(inProgressAssignment(), FACILITATOR, NOW).assignment;
    expect(() => reassignFrom(completed, FACILITATOR, null, LATER)).toThrow(
      /active assignment can be reassigned/i,
    );
  });

  it('composes with assignReviewer to produce a linked replacement', () => {
    const original = assignedAssignment();
    const closed = reassignFrom(original, FACILITATOR, 'Reassigning.', LATER).assignment;
    const { assignment: replacement } = assignReviewer({
      ...baseInput(),
      id: ASSIGNMENT_ID_2,
      reassignedFromId: closed.id,
      at: LATER,
    });
    expect(replacement.reassignedFromId).toBe(closed.id);
    expect(isActiveAssignment(closed)).toBe(false);
    expect(isActiveAssignment(replacement)).toBe(true);
  });
});

describe('isActiveAssignment', () => {
  it('is true for assigned and in_progress, false otherwise', () => {
    expect(isActiveAssignment(assignedAssignment())).toBe(true);
    expect(isActiveAssignment(inProgressAssignment())).toBe(true);
    expect(
      isActiveAssignment(completeAssignment(inProgressAssignment(), FACILITATOR, NOW).assignment),
    ).toBe(false);
    expect(
      isActiveAssignment(cancelAssignment(assignedAssignment(), FACILITATOR, null, NOW).assignment),
    ).toBe(false);
    expect(
      isActiveAssignment(reassignFrom(assignedAssignment(), FACILITATOR, null, NOW).assignment),
    ).toBe(false);
  });
});
