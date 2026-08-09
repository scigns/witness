/**
 * Decision (BUILD_ROADMAP.md Milestone 7, Decisions, Commitments and
 * Actions) — something a session decided, and what it rests on.
 *
 * Lifecycle: `proposed → confirmed`, then either `confirmed → superseded`
 * (a later decision replaces this one) or `confirmed → reversed` (the
 * institution changed its mind and says so). Both terminal states are
 * reached by their own mutator and neither deletes anything: a superseded
 * decision keeps pointing at what replaced it, and a reversed one keeps its
 * reversal reason. "What did we decide, and did we stick to it" is not
 * answerable from a table that forgets.
 *
 * `superseded` and `reversed` are deliberately distinct, for the same
 * reason `review.ts` keeps `confirmed` and `corrected` apart. Superseding
 * means the decision was right and has moved on; reversing means it was
 * wrong. Collapsing them would destroy the only signal that tells an
 * institution its decisions are unstable.
 *
 * Confirmation requires support (`outcome-support.ts`) — validated evidence
 * or a stated institutional synthesis. The check is passed in rather than
 * read here, because counting a decision's support records is a database
 * read the domain may not perform (ADR-0003); `DecisionService` loads them
 * and hands them over.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import { assertSupported, type OutcomeSupport } from './outcome-support.js';
import type { CoDesignSessionId, DecisionId, OrganisationId, WorkspaceId } from './ids.js';

const TITLE_MAX = 300;
const STATEMENT_MAX = 5000;
const REASON_MAX = 2000;

export const DECISION_STATUSES = ['proposed', 'confirmed', 'superseded', 'reversed'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface Decision {
  readonly id: DecisionId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly title: string;
  /** What was actually decided, in the institution's own words. */
  readonly statement: string;
  readonly status: DecisionStatus;
  readonly proposedBy: Actor;
  readonly proposedAt: Date;
  readonly confirmedBy: Actor | null;
  readonly confirmedAt: Date | null;
  /** The decision that replaced this one; `null` unless `superseded`. */
  readonly supersededByDecisionId: DecisionId | null;
  readonly supersededAt: Date | null;
  readonly reversedAt: Date | null;
  /** Why this was superseded or reversed — required for a reversal. */
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface DecisionOutcome {
  readonly decision: Decision;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`A decision must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A decision ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertOptionalReason(value: string | null | undefined): string | null {
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

/**
 * Outcomes can be recorded while a session is open or closed — a
 * facilitator writing up decisions after the room empties is the normal
 * case, not an exception. Archived sessions are read-only, the same rule
 * `co-design-session.ts` enforces everywhere else.
 */
function assertMutable(sessionStatus: SessionStatus): void {
  if (sessionStatus === 'archived') {
    throw new InvariantViolation('An archived session is read-only.', 'SESSION_ARCHIVED');
  }
  if (sessionStatus === 'draft' || sessionStatus === 'scheduled') {
    throw new InvariantViolation(
      `Outcomes can only be recorded once a session has opened — this session is '${sessionStatus}'.`,
      'SESSION_NOT_STARTED',
    );
  }
}

export interface ProposeDecisionInput {
  id: DecisionId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  title: string;
  statement: string;
  proposedBy: Actor;
  at: Date;
}

/** Propose a decision. Always starts `proposed` — never confirmed on creation. */
export function proposeDecision(
  sessionStatus: SessionStatus,
  input: ProposeDecisionInput,
): DecisionOutcome {
  assertMutable(sessionStatus);

  const decision: Decision = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    title: assertNonEmpty(input.title, 'title', TITLE_MAX, 'TITLE_REQUIRED'),
    statement: assertNonEmpty(input.statement, 'statement', STATEMENT_MAX, 'STATEMENT_REQUIRED'),
    status: 'proposed',
    proposedBy: input.proposedBy,
    proposedAt: input.at,
    confirmedBy: null,
    confirmedAt: null,
    supersededByDecisionId: null,
    supersededAt: null,
    reversedAt: null,
    closeReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    decision,
    event: {
      action: 'decision.proposed',
      actor: input.proposedBy,
      metadata: { sessionId: decision.sessionId, title: decision.title },
    },
  };
}

export interface UpdateDecisionInput {
  title?: string | undefined;
  statement?: string | undefined;
}

/**
 * Edit a decision's wording. `proposed` only — once confirmed, the text is
 * what the institution committed to, and changing it would rewrite the
 * record rather than amend it. Correcting a confirmed decision means
 * superseding it with a new one.
 */
export function updateDecision(
  decision: Decision,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateDecisionInput,
  at: Date,
): DecisionOutcome {
  assertMutable(sessionStatus);

  if (decision.status !== 'proposed') {
    throw new InvariantViolation(
      `Only a proposed decision can be edited — this decision is '${decision.status}'.`,
      'DECISION_NOT_EDITABLE',
    );
  }

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: Decision = {
    ...decision,
    title:
      patch.title !== undefined
        ? assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED')
        : decision.title,
    statement:
      patch.statement !== undefined
        ? assertNonEmpty(patch.statement, 'statement', STATEMENT_MAX, 'STATEMENT_REQUIRED')
        : decision.statement,
    updatedAt: at,
    version: decision.version + 1,
  };

  return {
    decision: next,
    event: {
      action: 'decision.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/**
 * Confirm a decision — the point at which it becomes institutional record.
 * `proposed → confirmed` only, and only with admissible support behind it.
 */
export function confirmDecision(
  decision: Decision,
  sessionStatus: SessionStatus,
  supports: readonly OutcomeSupport[],
  actor: Actor,
  at: Date,
): DecisionOutcome {
  assertMutable(sessionStatus);

  if (decision.status !== 'proposed') {
    throw new InvariantViolation(
      `Only a proposed decision can be confirmed — this decision is '${decision.status}'.`,
      'INVALID_DECISION_TRANSITION',
    );
  }

  assertSupported(supports, decision.id, 'decision');

  const next: Decision = {
    ...decision,
    status: 'confirmed',
    confirmedBy: actor,
    confirmedAt: at,
    updatedAt: at,
    version: decision.version + 1,
  };

  return {
    decision: next,
    event: {
      action: 'decision.confirmed',
      actor,
      metadata: { from: decision.status, supportCount: String(supports.length) },
    },
  };
}

/**
 * Replace a confirmed decision with a later one. The replacement's id is
 * required — "superseded by nothing" is how a decision quietly disappears.
 */
export function supersedeDecision(
  decision: Decision,
  sessionStatus: SessionStatus,
  supersededByDecisionId: DecisionId,
  actor: Actor,
  reason: string | null,
  at: Date,
): DecisionOutcome {
  assertMutable(sessionStatus);

  if (decision.status !== 'confirmed') {
    throw new InvariantViolation(
      `Only a confirmed decision can be superseded — this decision is '${decision.status}'.`,
      'INVALID_DECISION_TRANSITION',
    );
  }

  if (supersededByDecisionId === decision.id) {
    throw new InvariantViolation('A decision cannot supersede itself.', 'DECISION_SUPERSEDES_SELF');
  }

  const next: Decision = {
    ...decision,
    status: 'superseded',
    supersededByDecisionId,
    supersededAt: at,
    closeReason: assertOptionalReason(reason),
    updatedAt: at,
    version: decision.version + 1,
  };

  return {
    decision: next,
    event: {
      action: 'decision.superseded',
      actor,
      metadata: { supersededBy: supersededByDecisionId },
    },
  };
}

/**
 * Reverse a confirmed decision — the institution changed its mind. A reason
 * is required: a reversal without one is indistinguishable from an error,
 * and the difference is exactly what a reader needs.
 */
export function reverseDecision(
  decision: Decision,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string,
  at: Date,
): DecisionOutcome {
  assertMutable(sessionStatus);

  if (decision.status !== 'confirmed') {
    throw new InvariantViolation(
      `Only a confirmed decision can be reversed — this decision is '${decision.status}'.`,
      'INVALID_DECISION_TRANSITION',
    );
  }

  const next: Decision = {
    ...decision,
    status: 'reversed',
    reversedAt: at,
    closeReason: assertNonEmpty(reason, 'reversal reason', REASON_MAX, 'REVERSAL_REASON_REQUIRED'),
    updatedAt: at,
    version: decision.version + 1,
  };

  return {
    decision: next,
    event: {
      action: 'decision.reversed',
      actor,
      metadata: { reason: next.closeReason ?? '' },
    },
  };
}

/** Whether this decision's wording can still be edited. */
export function canEditDecision(decision: Decision, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && decision.status === 'proposed';
}

/** Whether this decision can be confirmed right now (support aside). */
export function canConfirmDecision(decision: Decision, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && decision.status === 'proposed';
}

/** Whether this decision can still be superseded or reversed. */
export function canCloseDecision(decision: Decision, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && decision.status === 'confirmed';
}
