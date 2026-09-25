/**
 * ProductFeedback — a private micro-survey response captured at a natural
 * completion moment (Phase 6, Track B).
 *
 * Deliberately create-only: no function in this file, or anywhere else in
 * this package, transitions a `ProductFeedback` once it exists. This is what
 * makes "the original feedback is never altered by anything downstream" true
 * structurally rather than by convention — the same shape of guarantee
 * `candidate-assertion.ts` gives evidence provenance (a candidate can only
 * ever cite evidence, never rewrite it).
 *
 * `moment` and `productArea` are a fixed 1:1 pair (`MOMENT_PRODUCT_AREA`),
 * enforced here rather than trusted from the caller — a client cannot tag a
 * reviewer-queue completion with the `reporting` area.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  OrganisationId,
  ProductFeedbackId,
  SessionParticipantId,
  WorkspaceId,
} from './ids.js';

export const PRODUCT_AREAS = ['evidence_capture', 'facilitation', 'review', 'reporting'] as const;
export type ProductArea = (typeof PRODUCT_AREAS)[number];

export const FEEDBACK_MOMENTS = [
  'participant_capture_success',
  'facilitator_recap',
  'reviewer_queue_cleared',
  'report_export_success',
] as const;
export type FeedbackMoment = (typeof FEEDBACK_MOMENTS)[number];

/** The only valid moment -> area pairing. A client cannot mislabel which area a moment belongs to. */
export const MOMENT_PRODUCT_AREA: Readonly<Record<FeedbackMoment, ProductArea>> = {
  participant_capture_success: 'evidence_capture',
  facilitator_recap: 'facilitation',
  reviewer_queue_cleared: 'review',
  report_export_success: 'reporting',
};

const POSITIVE_FEEDBACK_THRESHOLD = 4;

export interface ProductFeedback {
  readonly id: ProductFeedbackId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  /** Null for moments that are not tied to a single session (e.g. a cleared review queue). */
  readonly sessionId: CoDesignSessionId | null;
  /** Set only when submitted by an unauthenticated capture-token participant. */
  readonly sourceParticipantId: SessionParticipantId | null;
  readonly productArea: ProductArea;
  readonly moment: FeedbackMoment;
  readonly rating: number;
  readonly comment: string | null;
  readonly submittedBy: Actor;
  readonly createdAt: Date;
}

export interface ProductFeedbackOutcome {
  readonly feedback: ProductFeedback;
  readonly event: PendingAuditEvent;
}

export interface SubmitProductFeedbackInput {
  id: ProductFeedbackId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId?: CoDesignSessionId | null | undefined;
  sourceParticipantId?: SessionParticipantId | null | undefined;
  productArea: string;
  moment: string;
  rating: number;
  comment?: string | null | undefined;
  submittedBy: Actor;
  at: Date;
}

function assertMoment(value: string): FeedbackMoment {
  if (!(FEEDBACK_MOMENTS as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised feedback moment.`,
      'INVALID_FEEDBACK_MOMENT',
    );
  }
  return value as FeedbackMoment;
}

function assertProductArea(value: string, moment: FeedbackMoment): ProductArea {
  if (!(PRODUCT_AREAS as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised product area.`,
      'INVALID_PRODUCT_AREA',
    );
  }
  if (MOMENT_PRODUCT_AREA[moment] !== value) {
    throw new InvariantViolation(
      `Feedback moment '${moment}' must be tagged with product area '${MOMENT_PRODUCT_AREA[moment]}', not '${value}'.`,
      'MOMENT_PRODUCT_AREA_MISMATCH',
    );
  }
  return value as ProductArea;
}

function assertRating(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new InvariantViolation('Rating must be an integer between 1 and 5.', 'INVALID_RATING');
  }
  return value;
}

function assertSafeComment(value: string): string {
  const trimmed = value.trim();
  const hasControlCharacter = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint < 32 && codePoint !== 10) || codePoint === 127;
  });
  if (trimmed.length > 2000 || hasControlCharacter) {
    throw new InvariantViolation(
      'Feedback comment must be at most 2000 characters and contain no control characters other than newlines.',
      'FEEDBACK_COMMENT_INVALID',
    );
  }
  return trimmed;
}

function cloneComment(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const comment = assertSafeComment(value);
  return comment.length === 0 ? null : comment;
}

export function submitProductFeedback(input: SubmitProductFeedbackInput): ProductFeedbackOutcome {
  const moment = assertMoment(input.moment);
  const productArea = assertProductArea(input.productArea, moment);
  const rating = assertRating(input.rating);
  const comment = cloneComment(input.comment);

  const feedback: ProductFeedback = Object.freeze({
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    sourceParticipantId: input.sourceParticipantId ?? null,
    productArea,
    moment,
    rating,
    comment,
    submittedBy: input.submittedBy,
    createdAt: input.at,
  });

  return {
    feedback,
    event: {
      action: 'product_feedback.submitted',
      actor: input.submittedBy,
      metadata: {
        feedbackId: feedback.id,
        productArea: feedback.productArea,
        moment: feedback.moment,
        rating: String(feedback.rating),
      },
    },
  };
}

/** Whether this feedback is positive enough to justify offering a testimonial follow-up. */
export function isPositiveFeedback(feedback: ProductFeedback): boolean {
  return feedback.rating >= POSITIVE_FEEDBACK_THRESHOLD;
}
