import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  toActorId,
  toCoDesignSessionId,
  toKnowledgeAssertionId,
  toOrganisationId,
  toParticipantKnowledgeResponseId,
  toSessionParticipantId,
  toWorkspaceId,
} from './ids.js';
import {
  submitParticipantKnowledgeResponse,
  type SubmitParticipantKnowledgeResponseInput,
} from './participant-knowledge-response.js';

const organisationId = toOrganisationId('11111111-1111-4111-8111-111111111111');
const workspaceId = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const sessionId = toCoDesignSessionId('33333333-3333-4333-8333-333333333333');
const knowledgeAssertionId = toKnowledgeAssertionId('44444444-4444-4444-8444-444444444444');
const sourceParticipantId = toSessionParticipantId('55555555-5555-4555-8555-555555555555');
const responseId = toParticipantKnowledgeResponseId('66666666-6666-4666-8666-666666666666');
const at = new Date('2026-09-26T00:00:00.000Z');

const submittedBy = createActor({
  id: toActorId('77777777-7777-4777-8777-777777777777'),
  kind: 'human',
  displayName: 'Anonymous participant',
});

function submit(overrides: Partial<SubmitParticipantKnowledgeResponseInput> = {}) {
  return submitParticipantKnowledgeResponse({
    id: responseId,
    organisationId,
    workspaceId,
    sessionId,
    knowledgeAssertionId,
    sourceParticipantId,
    responseType: 'reflects',
    submittedBy,
    at,
    ...overrides,
  });
}

describe('submitParticipantKnowledgeResponse', () => {
  it('creates a response with the given type', () => {
    const { response } = submit();
    expect(response.responseType).toBe('reflects');
    expect(response.knowledgeAssertionId).toBe(knowledgeAssertionId);
    expect(response.sourceParticipantId).toBe(sourceParticipantId);
    expect(response.comment).toBeNull();
  });

  it('emits a participant_knowledge_response.submitted audit event', () => {
    const { event } = submit();
    expect(event.action).toBe('participant_knowledge_response.submitted');
    expect(event.actor).toBe(submittedBy);
  });

  it.each(['reflects', 'needs_nuance', 'missing_context', 'sees_differently'])(
    'accepts response type %s',
    (responseType) => {
      expect(() => submit({ responseType })).not.toThrow();
    },
  );

  it('rejects an unrecognised response type — never collapses to a boolean/score', () => {
    expect(() => submit({ responseType: 'agree' })).toThrow(InvariantViolation);
    expect(() => submit({ responseType: 'upvote' })).toThrow(InvariantViolation);
  });

  it('accepts an optional comment', () => {
    const { response } = submit({ comment: 'This matches what I said earlier.' });
    expect(response.comment).toBe('This matches what I said earlier.');
  });

  it('rejects a comment over 1000 characters', () => {
    expect(() => submit({ comment: 'x'.repeat(1001) })).toThrow(InvariantViolation);
  });

  it('trims whitespace-only comments to null', () => {
    const { response } = submit({ comment: '   ' });
    expect(response.comment).toBeNull();
  });

  it('never mutates or references the underlying assertion beyond its id — structurally read-only', () => {
    const { response } = submit({ responseType: 'sees_differently' });
    // The response carries only the assertion's id, never its content —
    // there is no field here that could be used to overwrite the canonical
    // KnowledgeAssertion this reacts to.
    expect(Object.keys(response)).not.toContain('statement');
    expect(Object.keys(response)).not.toContain('perspectiveTags');
  });
});
