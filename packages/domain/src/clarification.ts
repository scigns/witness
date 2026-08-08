/**
 * Clarification (BUILD_ROADMAP.md Milestone 6, Evidence Review and
 * Validation) — a reviewer's question about a specific piece of evidence,
 * and the answer (if any) that resolves it.
 *
 * A first-class aggregate rather than a comment thread bolted onto
 * `Evidence`, for the same reason `ReviewAssignment` is first-class: a
 * clarification has its own actor pair (who asked, who answered — which may
 * be the facilitator who captured it, the participant it is attributed to,
 * or someone else authorised to speak for the evidence), its own lifecycle,
 * and its own audit trail. Who is *allowed* to respond is an authorisation
 * and consent question the domain cannot answer on its own — the service
 * layer resolves that (facilitator / evidence-capturer / attributed
 * participant where the identity-visibility and consent state permit it)
 * before calling `respondToClarification`.
 *
 * A clarification's own state never touches `Evidence.reviewStatus`
 * directly — `EvidenceReviewService` is expected to call
 * `markNeedsClarification` on the evidence in the same transaction as
 * `requestClarification`, and `resumeReviewAfterClarification` alongside
 * `closeClarification`, so the two aggregates' states move together without
 * either one reaching into the other.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  ClarificationId,
  CoDesignSessionId,
  EvidenceId,
  OrganisationId,
  ReviewAssignmentId,
  WorkspaceId,
} from './ids.js';

const QUESTION_MAX = 2000;
const RESPONSE_MAX = 4000;
const CLOSE_REASON_MAX = 2000;

export const CLARIFICATION_STATUSES = ['open', 'answered', 'withdrawn', 'closed'] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];

export interface Clarification {
  readonly id: ClarificationId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly evidenceId: EvidenceId;
  readonly reviewAssignmentId: ReviewAssignmentId;
  readonly question: string;
  readonly requestedBy: Actor;
  readonly requestedAt: Date;
  readonly response: string | null;
  readonly respondedBy: Actor | null;
  readonly respondedAt: Date | null;
  readonly status: ClarificationStatus;
  /** Why this was withdrawn or closed without an answer, when applicable. */
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface ClarificationOutcome {
  readonly clarification: Clarification;
  readonly event: PendingAuditEvent;
}

function assertQuestion(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A clarification question must not be empty.',
      'QUESTION_REQUIRED',
    );
  }
  if (trimmed.length > QUESTION_MAX) {
    throw new InvariantViolation(
      `A clarification question must be ${QUESTION_MAX} characters or fewer, received ${trimmed.length}.`,
      'QUESTION_TOO_LONG',
    );
  }
  return trimmed;
}

function assertResponse(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A clarification response must not be empty.',
      'RESPONSE_REQUIRED',
    );
  }
  if (trimmed.length > RESPONSE_MAX) {
    throw new InvariantViolation(
      `A clarification response must be ${RESPONSE_MAX} characters or fewer, received ${trimmed.length}.`,
      'RESPONSE_TOO_LONG',
    );
  }
  return trimmed;
}

function assertCloseReason(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CLOSE_REASON_MAX) {
    throw new InvariantViolation(
      `A close reason must be ${CLOSE_REASON_MAX} characters or fewer, received ${trimmed.length}.`,
      'CLOSE_REASON_TOO_LONG',
    );
  }
  return trimmed;
}

export interface RequestClarificationInput {
  id: ClarificationId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  evidenceId: EvidenceId;
  reviewAssignmentId: ReviewAssignmentId;
  question: string;
  requestedBy: Actor;
  at: Date;
}

/** A reviewer asks a question about a piece of evidence. Starts `open`. */
export function requestClarification(input: RequestClarificationInput): ClarificationOutcome {
  const clarification: Clarification = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    evidenceId: input.evidenceId,
    reviewAssignmentId: input.reviewAssignmentId,
    question: assertQuestion(input.question),
    requestedBy: input.requestedBy,
    requestedAt: input.at,
    response: null,
    respondedBy: null,
    respondedAt: null,
    status: 'open',
    closeReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    clarification,
    event: {
      action: 'clarification.requested',
      actor: input.requestedBy,
      metadata: { evidenceId: clarification.evidenceId },
    },
  };
}

/**
 * The authorised responder answers. `open → answered` only. Who is
 * authorised to call this is a service-layer decision — see module doc.
 */
export function respondToClarification(
  clarification: Clarification,
  actor: Actor,
  response: string,
  at: Date,
): ClarificationOutcome {
  if (clarification.status !== 'open') {
    throw new InvariantViolation(
      `Only an open clarification can be answered — this clarification is '${clarification.status}'.`,
      'INVALID_CLARIFICATION_TRANSITION',
    );
  }

  const next: Clarification = {
    ...clarification,
    response: assertResponse(response),
    respondedBy: actor,
    respondedAt: at,
    status: 'answered',
    updatedAt: at,
    version: clarification.version + 1,
  };

  return {
    clarification: next,
    event: {
      action: 'clarification.responded',
      actor,
      metadata: { evidenceId: clarification.evidenceId },
    },
  };
}

/**
 * The requester withdraws an unanswered question — e.g. it was resolved by
 * other means, or asked in error. `open → withdrawn` only; an answered
 * clarification is part of the record and cannot be withdrawn.
 */
export function withdrawClarification(
  clarification: Clarification,
  actor: Actor,
  reason: string | null,
  at: Date,
): ClarificationOutcome {
  if (clarification.status !== 'open') {
    throw new InvariantViolation(
      `Only an open clarification can be withdrawn — this clarification is '${clarification.status}'.`,
      'INVALID_CLARIFICATION_TRANSITION',
    );
  }

  const next: Clarification = {
    ...clarification,
    status: 'withdrawn',
    closeReason: assertCloseReason(reason),
    updatedAt: at,
    version: clarification.version + 1,
  };

  return {
    clarification: next,
    event: {
      action: 'clarification.withdrawn',
      actor,
      metadata:
        next.closeReason === null
          ? { evidenceId: clarification.evidenceId }
          : { evidenceId: clarification.evidenceId, reason: next.closeReason },
    },
  };
}

/**
 * The reviewer closes out an answered clarification, acknowledging the
 * response and resuming review. `answered → closed` only — pairs with
 * `resumeReviewAfterClarification` on the evidence in the same transaction.
 */
export function closeClarification(
  clarification: Clarification,
  actor: Actor,
  at: Date,
): ClarificationOutcome {
  if (clarification.status !== 'answered') {
    throw new InvariantViolation(
      `Only an answered clarification can be closed — this clarification is '${clarification.status}'.`,
      'INVALID_CLARIFICATION_TRANSITION',
    );
  }

  const next: Clarification = {
    ...clarification,
    status: 'closed',
    updatedAt: at,
    version: clarification.version + 1,
  };

  return {
    clarification: next,
    event: {
      action: 'clarification.closed',
      actor,
      metadata: { evidenceId: clarification.evidenceId },
    },
  };
}

/** Whether this clarification is still awaiting a response. */
export function isOpenClarification(clarification: Clarification): boolean {
  return clarification.status === 'open';
}
