/**
 * ReviewAssignment (BUILD_ROADMAP.md Milestone 6, Evidence Review and
 * Validation) — who is reviewing a specific piece of evidence, and where
 * that review currently stands.
 *
 * A first-class aggregate, not a column on `Evidence`, because an
 * assignment has its own actor (who assigned it, which may differ from who
 * captured or who reviews the evidence), its own lifecycle, and its own
 * audit trail — the same reasoning `EvidenceLink` used in Milestone 5 for
 * being its own aggregate rather than a field.
 *
 * The MVP supports exactly one *active* assignment per evidence record at a
 * time ("one active reviewer" — BUILD_ROADMAP.md Milestone 6). This module
 * cannot enforce that itself: checking whether another active assignment
 * already exists for the same evidence is a database read the domain layer
 * may not perform (ADR-0003). `EvidenceReviewService` checks it before
 * calling `assignReviewer`, and the migration's own partial unique index is
 * the last line of defence if that check is ever bypassed.
 *
 * There is deliberately no multi-reviewer consensus model here — Milestone
 * 6 explicitly scopes that out. Reassignment replaces the active assignment
 * with a new one; it does not add a second concurrent reviewer.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  EvidenceId,
  OrganisationId,
  ReviewAssignmentId,
  UserId,
  WorkspaceId,
} from './ids.js';

const REASON_MAX = 2000;

export const REVIEW_ASSIGNMENT_STATUSES = [
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
  'reassigned',
] as const;
export type ReviewAssignmentStatus = (typeof REVIEW_ASSIGNMENT_STATUSES)[number];

/** Statuses in which an assignment is still the active reviewer of record. */
const ACTIVE_STATUSES: ReadonlySet<ReviewAssignmentStatus> = new Set(['assigned', 'in_progress']);

export interface ReviewAssignment {
  readonly id: ReviewAssignmentId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly evidenceId: EvidenceId;
  readonly reviewerUserId: UserId;
  readonly assignedBy: Actor;
  readonly assignedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly status: ReviewAssignmentStatus;
  /**
   * The prior assignment this one replaces, when created by reassignment —
   * `null` for a first assignment. The prior row itself is never deleted;
   * its own `status` becomes `reassigned` in the same transaction.
   */
  readonly reassignedFromId: ReviewAssignmentId | null;
  /** Why this assignment was cancelled or reassigned away from. */
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface ReviewAssignmentOutcome {
  readonly assignment: ReviewAssignment;
  readonly event: PendingAuditEvent;
}

function assertReason(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > REASON_MAX) {
    throw new InvariantViolation(
      `A reason must be ${REASON_MAX} characters or fewer, received ${trimmed.length}.`,
      'REASON_TOO_LONG',
    );
  }
  return trimmed;
}

export interface AssignReviewerInput {
  id: ReviewAssignmentId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  evidenceId: EvidenceId;
  reviewerUserId: UserId;
  reassignedFromId?: ReviewAssignmentId | null | undefined;
  assignedBy: Actor;
  at: Date;
}

/**
 * Assign a reviewer to a piece of evidence. Starts `assigned` — the
 * reviewer has been notified but has not yet opened it (`startReview`
 * records that separately, so "assigned" and "actually being worked on"
 * stay distinguishable in the history).
 */
export function assignReviewer(input: AssignReviewerInput): ReviewAssignmentOutcome {
  const assignment: ReviewAssignment = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    evidenceId: input.evidenceId,
    reviewerUserId: input.reviewerUserId,
    assignedBy: input.assignedBy,
    assignedAt: input.at,
    startedAt: null,
    completedAt: null,
    status: 'assigned',
    reassignedFromId: input.reassignedFromId ?? null,
    closeReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    assignment,
    event: {
      action: 'review_assignment.assigned',
      actor: input.assignedBy,
      metadata: {
        evidenceId: assignment.evidenceId,
        reviewerUserId: assignment.reviewerUserId,
        reassignedFromId: assignment.reassignedFromId ?? '',
      },
    },
  };
}

/** The assigned reviewer begins working on it. `assigned → in_progress` only. */
export function startReview(
  assignment: ReviewAssignment,
  actor: Actor,
  at: Date,
): ReviewAssignmentOutcome {
  if (assignment.status !== 'assigned') {
    throw new InvariantViolation(
      `Only an assigned review can be started — this assignment is '${assignment.status}'.`,
      'INVALID_ASSIGNMENT_TRANSITION',
    );
  }

  const next: ReviewAssignment = {
    ...assignment,
    status: 'in_progress',
    startedAt: at,
    updatedAt: at,
    version: assignment.version + 1,
  };

  return {
    assignment: next,
    event: {
      action: 'review_assignment.started',
      actor,
      metadata: { evidenceId: assignment.evidenceId },
    },
  };
}

/**
 * The assignment concludes because a review decision (validate/reject) was
 * made. `in_progress → completed` only — called by `EvidenceReviewService`
 * in the same transaction as `validateEvidence`/`rejectEvidence`.
 */
export function completeAssignment(
  assignment: ReviewAssignment,
  actor: Actor,
  at: Date,
): ReviewAssignmentOutcome {
  if (assignment.status !== 'in_progress') {
    throw new InvariantViolation(
      `Only an in-progress review can be completed — this assignment is '${assignment.status}'.`,
      'INVALID_ASSIGNMENT_TRANSITION',
    );
  }

  const next: ReviewAssignment = {
    ...assignment,
    status: 'completed',
    completedAt: at,
    updatedAt: at,
    version: assignment.version + 1,
  };

  return {
    assignment: next,
    event: {
      action: 'review_assignment.completed',
      actor,
      metadata: { evidenceId: assignment.evidenceId },
    },
  };
}

/** Cancel an active assignment outright — not a reassignment, just a stop. */
export function cancelAssignment(
  assignment: ReviewAssignment,
  actor: Actor,
  reason: string | null,
  at: Date,
): ReviewAssignmentOutcome {
  if (!ACTIVE_STATUSES.has(assignment.status)) {
    throw new InvariantViolation(
      `Only an active assignment can be cancelled — this assignment is '${assignment.status}'.`,
      'INVALID_ASSIGNMENT_TRANSITION',
    );
  }

  const next: ReviewAssignment = {
    ...assignment,
    status: 'cancelled',
    closeReason: assertReason(reason),
    updatedAt: at,
    version: assignment.version + 1,
  };

  return {
    assignment: next,
    event: {
      action: 'review_assignment.cancelled',
      actor,
      metadata:
        next.closeReason === null
          ? { evidenceId: assignment.evidenceId }
          : { evidenceId: assignment.evidenceId, reason: next.closeReason },
    },
  };
}

/**
 * Close this assignment because a replacement is taking over. Pairs with a
 * fresh `assignReviewer` call (`reassignedFromId` pointing back here) in
 * the same service-layer transaction — the prior assignment's history is
 * preserved, never deleted, the same "no destructive deletion" rule every
 * other aggregate in this package follows for real history.
 */
export function reassignFrom(
  assignment: ReviewAssignment,
  actor: Actor,
  reason: string | null,
  at: Date,
): ReviewAssignmentOutcome {
  if (!ACTIVE_STATUSES.has(assignment.status)) {
    throw new InvariantViolation(
      `Only an active assignment can be reassigned — this assignment is '${assignment.status}'.`,
      'INVALID_ASSIGNMENT_TRANSITION',
    );
  }

  const next: ReviewAssignment = {
    ...assignment,
    status: 'reassigned',
    closeReason: assertReason(reason),
    updatedAt: at,
    version: assignment.version + 1,
  };

  return {
    assignment: next,
    event: {
      action: 'review_assignment.reassigned',
      actor,
      metadata:
        next.closeReason === null
          ? { evidenceId: assignment.evidenceId }
          : { evidenceId: assignment.evidenceId, reason: next.closeReason },
    },
  };
}

/** Whether this assignment currently represents the active reviewer of record. */
export function isActiveAssignment(assignment: ReviewAssignment): boolean {
  return ACTIVE_STATUSES.has(assignment.status);
}
