/**
 * KnowledgeReviewDecision — a reviewer's decision on a `CandidateAssertion`.
 *
 * Mirrors `review-assignment.ts`/`clarification.ts`'s existing evidence
 * review pattern rather than inventing a new one: a named human actor, a
 * decision, a rationale, an audited transition. `reviewDurationMs` exists
 * because ADR-0012 names "rubber-stamping" as the most serious residual risk
 * of the human gate and requires review duration to be recorded so
 * anomalously fast decisions can be surfaced — this module records the
 * number; surfacing it to the Governance Lead is a reporting concern outside
 * this package.
 */

import { isHuman } from './actor.js';
import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import type { PendingAuditEvent } from './audit.js';
import type { CandidateAssertionId, KnowledgeReviewDecisionId } from './ids.js';

export const KNOWLEDGE_REVIEW_DECISIONS = [
  'approved',
  'rejected',
  'qualified',
  'returned_for_community_review',
] as const;
export type KnowledgeReviewDecisionType = (typeof KNOWLEDGE_REVIEW_DECISIONS)[number];

export interface KnowledgeReviewDecision {
  readonly id: KnowledgeReviewDecisionId;
  readonly candidateId: CandidateAssertionId;
  readonly reviewer: Actor;
  readonly decision: KnowledgeReviewDecisionType;
  readonly correctedPayload: Readonly<Record<string, unknown>> | null;
  readonly rationale: string | null;
  readonly decidedAt: Date;
  readonly reviewDurationMs: number;
}

export interface KnowledgeReviewDecisionOutcome {
  readonly reviewDecision: KnowledgeReviewDecision;
  readonly event: PendingAuditEvent;
}

/**
 * Below this, a decision is flagged as implausibly fast in the audit
 * metadata (never blocked — ADR-0012 explicitly rejects blocking as the
 * mitigation, since a genuine two-second "reject, obviously wrong" call is
 * legitimate). Surfacing the flag to a dashboard is out of this package's
 * scope.
 */
const IMPLAUSIBLY_FAST_MS = 1500;

export interface RecordKnowledgeReviewDecisionInput {
  id: KnowledgeReviewDecisionId;
  candidateId: CandidateAssertionId;
  reviewer: Actor;
  decision: string;
  correctedPayload?: Readonly<Record<string, unknown>> | null | undefined;
  rationale?: string | null | undefined;
  decidedAt: Date;
  reviewStartedAt: Date;
}

function assertDecision(value: string): KnowledgeReviewDecisionType {
  if (!(KNOWLEDGE_REVIEW_DECISIONS as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised review decision.`,
      'INVALID_REVIEW_DECISION',
    );
  }
  return value as KnowledgeReviewDecisionType;
}

export function recordKnowledgeReviewDecision(
  input: RecordKnowledgeReviewDecisionInput,
): KnowledgeReviewDecisionOutcome {
  // Never modify primary evidence — this function only ever touches the
  // review-decision record and (via the service layer) the candidate's own
  // status. It has no access to, and makes no claim about, `Evidence` rows.
  if (!isHuman(input.reviewer)) {
    throw new InvariantViolation(
      'A knowledge review decision must be made by a human reviewer.',
      'REVIEW_REQUIRES_HUMAN',
    );
  }
  const decision = assertDecision(input.decision);
  if (decision === 'rejected' && (!input.rationale || input.rationale.trim().length === 0)) {
    throw new InvariantViolation(
      'Rejecting a candidate requires a rationale.',
      'REJECT_RATIONALE_REQUIRED',
    );
  }
  const reviewDurationMs = input.decidedAt.getTime() - input.reviewStartedAt.getTime();
  if (reviewDurationMs < 0) {
    throw new InvariantViolation(
      'A review cannot be decided before it started.',
      'REVIEW_DECIDED_BEFORE_STARTED',
    );
  }

  const reviewDecision: KnowledgeReviewDecision = {
    id: input.id,
    candidateId: input.candidateId,
    reviewer: input.reviewer,
    decision,
    correctedPayload: input.correctedPayload ?? null,
    rationale: input.rationale?.trim() || null,
    decidedAt: input.decidedAt,
    reviewDurationMs,
  };

  return {
    reviewDecision,
    event: {
      action: 'knowledge_review.decided',
      actor: input.reviewer,
      metadata: {
        candidateId: reviewDecision.candidateId,
        decision: reviewDecision.decision,
        reviewDurationMs: String(reviewDecision.reviewDurationMs),
        implausiblyFast: String(reviewDurationMs < IMPLAUSIBLY_FAST_MS),
      },
    },
  };
}
