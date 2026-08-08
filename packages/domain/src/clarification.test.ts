import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toClarificationId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toReviewAssignmentId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  closeClarification,
  isOpenClarification,
  requestClarification,
  respondToClarification,
  withdrawClarification,
  type Clarification,
  type RequestClarificationInput,
} from './clarification.js';

const REVIEWER: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Reviewer',
};
const RESPONDER: Actor = {
  id: toActorId('12121212-1212-4212-8212-121212121212'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const EVIDENCE = toEvidenceId('55555555-5555-4555-8555-555555555555');
const ASSIGNMENT = toReviewAssignmentId('66666666-6666-4666-8666-666666666666');
const CLARIFICATION_ID = toClarificationId('77777777-7777-4777-8777-777777777777');

function baseInput(): RequestClarificationInput {
  return {
    id: CLARIFICATION_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    evidenceId: EVIDENCE,
    reviewAssignmentId: ASSIGNMENT,
    question: 'Which participant raised this concern?',
    requestedBy: REVIEWER,
    at: NOW,
  };
}

function openClarification(): Clarification {
  return requestClarification(baseInput()).clarification;
}

function answeredClarification(): Clarification {
  return respondToClarification(
    openClarification(),
    RESPONDER,
    'It was raised by two attendees.',
    LATER,
  ).clarification;
}

describe('requestClarification', () => {
  it('creates an open clarification', () => {
    const { clarification, event } = requestClarification(baseInput());
    expect(clarification.status).toBe('open');
    expect(clarification.question).toBe('Which participant raised this concern?');
    expect(clarification.version).toBe(1);
    expect(event.action).toBe('clarification.requested');
  });

  it('ATTACK — rejects an empty question', () => {
    expect(() => requestClarification({ ...baseInput(), question: '   ' })).toThrow(
      /must not be empty/i,
    );
  });

  it('ATTACK — rejects an over-length question', () => {
    expect(() => requestClarification({ ...baseInput(), question: 'x'.repeat(2001) })).toThrow(
      /2000 characters or fewer/i,
    );
  });
});

describe('respondToClarification', () => {
  it('answers an open clarification', () => {
    const { clarification, event } = respondToClarification(
      openClarification(),
      RESPONDER,
      'It was raised by two attendees.',
      LATER,
    );
    expect(clarification.status).toBe('answered');
    expect(clarification.response).toBe('It was raised by two attendees.');
    expect(clarification.respondedBy).toEqual(RESPONDER);
    expect(clarification.respondedAt).toEqual(LATER);
    expect(event.action).toBe('clarification.responded');
  });

  it('ATTACK — rejects responding to an already-answered clarification', () => {
    expect(() =>
      respondToClarification(answeredClarification(), RESPONDER, 'again', LATER),
    ).toThrow(/open clarification can be answered/i);
  });

  it('ATTACK — rejects an empty response', () => {
    expect(() => respondToClarification(openClarification(), RESPONDER, '   ', LATER)).toThrow(
      /must not be empty/i,
    );
  });
});

describe('withdrawClarification', () => {
  it('withdraws an open clarification with a reason', () => {
    const { clarification, event } = withdrawClarification(
      openClarification(),
      REVIEWER,
      'Resolved by other means.',
      LATER,
    );
    expect(clarification.status).toBe('withdrawn');
    expect(clarification.closeReason).toBe('Resolved by other means.');
    expect(event.action).toBe('clarification.withdrawn');
  });

  it('ATTACK — rejects withdrawing an answered clarification', () => {
    expect(() => withdrawClarification(answeredClarification(), REVIEWER, null, LATER)).toThrow(
      /open clarification can be withdrawn/i,
    );
  });
});

describe('closeClarification', () => {
  it('closes an answered clarification', () => {
    const { clarification, event } = closeClarification(answeredClarification(), REVIEWER, LATER);
    expect(clarification.status).toBe('closed');
    expect(event.action).toBe('clarification.closed');
  });

  it('ATTACK — rejects closing an open (unanswered) clarification', () => {
    expect(() => closeClarification(openClarification(), REVIEWER, LATER)).toThrow(
      /answered clarification can be closed/i,
    );
  });

  it('ATTACK — rejects closing an already-closed clarification', () => {
    const closed = closeClarification(answeredClarification(), REVIEWER, LATER).clarification;
    expect(() => closeClarification(closed, REVIEWER, LATER)).toThrow(
      /answered clarification can be closed/i,
    );
  });
});

describe('isOpenClarification', () => {
  it('is true only while status is open', () => {
    expect(isOpenClarification(openClarification())).toBe(true);
    expect(isOpenClarification(answeredClarification())).toBe(false);
  });
});
