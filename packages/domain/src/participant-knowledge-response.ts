/**
 * ParticipantKnowledgeResponse — a participant's reaction to a piece of
 * confirmed Knowledge exposed back to them during a live workshop (Phase 6,
 * Track E — "close the co-design loop").
 *
 * Deliberately create-only, same shape as `product-feedback.ts`: no function
 * here or anywhere else in this package transitions or edits a response once
 * submitted. This is what makes "many people, many preserved reactions" true
 * structurally — the opposite of `KnowledgeAssertion.perspectiveTags`, which
 * is one shared, curator-set classification per assertion. A response never
 * touches the canonical `KnowledgeAssertion` it reacts to; it is evidence of
 * how the room received it, not an edit to it.
 *
 * The four response types deliberately preserve disagreement rather than
 * collapsing to a score — `sees_differently` and `needs_nuance` are first
 * -class outcomes, not a low rating.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  KnowledgeAssertionId,
  OrganisationId,
  ParticipantKnowledgeResponseId,
  SessionParticipantId,
  WorkspaceId,
} from './ids.js';

export const PARTICIPANT_RESPONSE_TYPES = [
  'reflects',
  'needs_nuance',
  'missing_context',
  'sees_differently',
] as const;
export type ParticipantResponseType = (typeof PARTICIPANT_RESPONSE_TYPES)[number];

const COMMENT_MAX = 1000;

export interface ParticipantKnowledgeResponse {
  readonly id: ParticipantKnowledgeResponseId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly knowledgeAssertionId: KnowledgeAssertionId;
  readonly sourceParticipantId: SessionParticipantId;
  readonly responseType: ParticipantResponseType;
  readonly comment: string | null;
  readonly submittedBy: Actor;
  readonly createdAt: Date;
}

export interface ParticipantKnowledgeResponseOutcome {
  readonly response: ParticipantKnowledgeResponse;
  readonly event: PendingAuditEvent;
}

export interface SubmitParticipantKnowledgeResponseInput {
  id: ParticipantKnowledgeResponseId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  knowledgeAssertionId: KnowledgeAssertionId;
  sourceParticipantId: SessionParticipantId;
  responseType: string;
  comment?: string | null | undefined;
  submittedBy: Actor;
  at: Date;
}

function assertResponseType(value: string): ParticipantResponseType {
  if (!(PARTICIPANT_RESPONSE_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised participant response type.`,
      'INVALID_PARTICIPANT_RESPONSE_TYPE',
    );
  }
  return value as ParticipantResponseType;
}

function assertComment(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > COMMENT_MAX) {
    throw new InvariantViolation(
      `A response comment must be ${COMMENT_MAX} characters or fewer, received ${trimmed.length}.`,
      'PARTICIPANT_RESPONSE_COMMENT_TOO_LONG',
    );
  }
  return trimmed;
}

export function submitParticipantKnowledgeResponse(
  input: SubmitParticipantKnowledgeResponseInput,
): ParticipantKnowledgeResponseOutcome {
  const responseType = assertResponseType(input.responseType);
  const comment = assertComment(input.comment);

  const response: ParticipantKnowledgeResponse = Object.freeze({
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    knowledgeAssertionId: input.knowledgeAssertionId,
    sourceParticipantId: input.sourceParticipantId,
    responseType,
    comment,
    submittedBy: input.submittedBy,
    createdAt: input.at,
  });

  return {
    response,
    event: {
      action: 'participant_knowledge_response.submitted',
      actor: input.submittedBy,
      metadata: {
        responseId: response.id,
        knowledgeAssertionId: response.knowledgeAssertionId,
        responseType: response.responseType,
      },
    },
  };
}
