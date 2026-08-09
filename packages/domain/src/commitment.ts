/**
 * Commitment (BUILD_ROADMAP.md Milestone 7) — something an identified party
 * undertook to do, by when.
 *
 * Lifecycle: `proposed → active`, then `active → fulfilled` /
 * `active → withdrawn` / `active → superseded`. Activation is the
 * accountability moment and carries the same support requirement
 * confirmation does for a decision: an institution that records a
 * commitment nobody can trace to anything has recorded a wish.
 *
 * Ownership is deliberately two-part. `ownerUserId` links to a Witness
 * account when the owner has one; `ownerDescription` names the responsible
 * party in plain language and is always required. Most commitments in a
 * co-design session belong to a team, an agency, or a role — "the housing
 * team", "Council's transport unit" — not to a person with a login, and
 * forcing every owner through a user account would either exclude those
 * commitments or invent fake accounts to hold them. The same reasoning
 * `session-participant.ts` uses for participants who are not registered
 * users.
 *
 * A commitment never records a *participant* as owner. Participants may be
 * anonymous or pseudonymous, and an accountable public undertaking attached
 * to a protected identity would defeat the protection.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import { assertSupported, type OutcomeSupport } from './outcome-support.js';
import type {
  CoDesignSessionId,
  CommitmentId,
  OrganisationId,
  UserId,
  WorkspaceId,
} from './ids.js';

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 5000;
const OWNER_MAX = 300;
const REASON_MAX = 2000;
const NOTE_MAX = 2000;

export const COMMITMENT_STATUSES = [
  'proposed',
  'active',
  'fulfilled',
  'withdrawn',
  'superseded',
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export interface Commitment {
  readonly id: CommitmentId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly title: string;
  readonly description: string;
  readonly status: CommitmentStatus;
  /** Always present — see the file header for why this is not a user id. */
  readonly ownerDescription: string;
  /** Present only when the owner holds a Witness account. */
  readonly ownerUserId: UserId | null;
  readonly dueDate: Date | null;
  readonly proposedBy: Actor;
  readonly proposedAt: Date;
  readonly activatedBy: Actor | null;
  readonly activatedAt: Date | null;
  readonly fulfilledAt: Date | null;
  /** How the commitment was met — recorded at fulfilment, not inferred. */
  readonly fulfilmentNote: string | null;
  readonly supersededByCommitmentId: CommitmentId | null;
  readonly closedAt: Date | null;
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CommitmentOutcome {
  readonly commitment: Commitment;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`A commitment must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A commitment ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertOptionalText(
  value: string | null | undefined,
  max: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `Field exceeds the maximum of ${max} characters, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertDueDate(value: Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value.getTime())) {
    throw new InvariantViolation('A due date must be a valid date.', 'INVALID_DUE_DATE');
  }
  return value;
}

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

export interface ProposeCommitmentInput {
  id: CommitmentId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  title: string;
  description: string;
  ownerDescription: string;
  ownerUserId?: UserId | null | undefined;
  dueDate?: Date | null | undefined;
  proposedBy: Actor;
  at: Date;
}

export function proposeCommitment(
  sessionStatus: SessionStatus,
  input: ProposeCommitmentInput,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  const commitment: Commitment = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    title: assertNonEmpty(input.title, 'title', TITLE_MAX, 'TITLE_REQUIRED'),
    description: assertNonEmpty(
      input.description,
      'description',
      DESCRIPTION_MAX,
      'DESCRIPTION_REQUIRED',
    ),
    status: 'proposed',
    ownerDescription: assertNonEmpty(input.ownerDescription, 'owner', OWNER_MAX, 'OWNER_REQUIRED'),
    ownerUserId: input.ownerUserId ?? null,
    dueDate: assertDueDate(input.dueDate),
    proposedBy: input.proposedBy,
    proposedAt: input.at,
    activatedBy: null,
    activatedAt: null,
    fulfilledAt: null,
    fulfilmentNote: null,
    supersededByCommitmentId: null,
    closedAt: null,
    closeReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    commitment,
    event: {
      action: 'commitment.proposed',
      actor: input.proposedBy,
      metadata: { sessionId: commitment.sessionId, owner: commitment.ownerDescription },
    },
  };
}

export interface UpdateCommitmentInput {
  title?: string | undefined;
  description?: string | undefined;
  ownerDescription?: string | undefined;
  ownerUserId?: UserId | null | undefined;
  dueDate?: Date | null | undefined;
}

/**
 * Edit a commitment. Permitted while `proposed` or `active` — unlike a
 * decision's wording, an active commitment's owner and due date legitimately
 * change as work moves, and forcing a withdraw-and-recreate cycle for a
 * date slip would destroy the commitment's own history. The terminal states
 * are closed to editing.
 */
export function updateCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateCommitmentInput,
  at: Date,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  if (commitment.status !== 'proposed' && commitment.status !== 'active') {
    throw new InvariantViolation(
      `A '${commitment.status}' commitment can no longer be edited.`,
      'COMMITMENT_NOT_EDITABLE',
    );
  }

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: Commitment = {
    ...commitment,
    title:
      patch.title !== undefined
        ? assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED')
        : commitment.title,
    description:
      patch.description !== undefined
        ? assertNonEmpty(patch.description, 'description', DESCRIPTION_MAX, 'DESCRIPTION_REQUIRED')
        : commitment.description,
    ownerDescription:
      patch.ownerDescription !== undefined
        ? assertNonEmpty(patch.ownerDescription, 'owner', OWNER_MAX, 'OWNER_REQUIRED')
        : commitment.ownerDescription,
    ownerUserId: patch.ownerUserId !== undefined ? patch.ownerUserId : commitment.ownerUserId,
    dueDate: patch.dueDate !== undefined ? assertDueDate(patch.dueDate) : commitment.dueDate,
    updatedAt: at,
    version: commitment.version + 1,
  };

  return {
    commitment: next,
    event: {
      action: 'commitment.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/**
 * Activate a commitment — it becomes something the institution is
 * accountable for. `proposed → active` only, and only with support behind
 * it, exactly as `confirmDecision` requires.
 */
export function activateCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
  supports: readonly OutcomeSupport[],
  actor: Actor,
  at: Date,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  if (commitment.status !== 'proposed') {
    throw new InvariantViolation(
      `Only a proposed commitment can be activated — this commitment is '${commitment.status}'.`,
      'INVALID_COMMITMENT_TRANSITION',
    );
  }

  assertSupported(supports, commitment.id, 'commitment');

  const next: Commitment = {
    ...commitment,
    status: 'active',
    activatedBy: actor,
    activatedAt: at,
    updatedAt: at,
    version: commitment.version + 1,
  };

  return {
    commitment: next,
    event: {
      action: 'commitment.activated',
      actor,
      metadata: { from: commitment.status, supportCount: String(supports.length) },
    },
  };
}

/** Record that an active commitment was met. `active → fulfilled` only. */
export function fulfilCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
  actor: Actor,
  note: string | null,
  at: Date,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  if (commitment.status !== 'active') {
    throw new InvariantViolation(
      `Only an active commitment can be fulfilled — this commitment is '${commitment.status}'.`,
      'INVALID_COMMITMENT_TRANSITION',
    );
  }

  const next: Commitment = {
    ...commitment,
    status: 'fulfilled',
    fulfilledAt: at,
    fulfilmentNote: assertOptionalText(note, NOTE_MAX, 'FULFILMENT_NOTE'),
    closedAt: at,
    updatedAt: at,
    version: commitment.version + 1,
  };

  return {
    commitment: next,
    event: { action: 'commitment.fulfilled', actor, metadata: { from: commitment.status } },
  };
}

/**
 * Withdraw a commitment the institution is no longer making. Permitted from
 * `proposed` or `active`, and a reason is required — an undertaking
 * withdrawn without explanation is the case accountability exists for.
 */
export function withdrawCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string,
  at: Date,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  if (commitment.status !== 'proposed' && commitment.status !== 'active') {
    throw new InvariantViolation(
      `A '${commitment.status}' commitment can no longer be withdrawn.`,
      'INVALID_COMMITMENT_TRANSITION',
    );
  }

  const next: Commitment = {
    ...commitment,
    status: 'withdrawn',
    closedAt: at,
    closeReason: assertNonEmpty(
      reason,
      'withdrawal reason',
      REASON_MAX,
      'WITHDRAWAL_REASON_REQUIRED',
    ),
    updatedAt: at,
    version: commitment.version + 1,
  };

  return {
    commitment: next,
    event: {
      action: 'commitment.withdrawn',
      actor,
      metadata: { from: commitment.status, reason: next.closeReason ?? '' },
    },
  };
}

/** Replace an active commitment with a later one. */
export function supersedeCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
  supersededByCommitmentId: CommitmentId,
  actor: Actor,
  reason: string | null,
  at: Date,
): CommitmentOutcome {
  assertMutable(sessionStatus);

  if (commitment.status !== 'active') {
    throw new InvariantViolation(
      `Only an active commitment can be superseded — this commitment is '${commitment.status}'.`,
      'INVALID_COMMITMENT_TRANSITION',
    );
  }

  if (supersededByCommitmentId === commitment.id) {
    throw new InvariantViolation(
      'A commitment cannot supersede itself.',
      'COMMITMENT_SUPERSEDES_SELF',
    );
  }

  const next: Commitment = {
    ...commitment,
    status: 'superseded',
    supersededByCommitmentId,
    closedAt: at,
    closeReason: assertOptionalText(reason, REASON_MAX, 'CLOSE_REASON'),
    updatedAt: at,
    version: commitment.version + 1,
  };

  return {
    commitment: next,
    event: {
      action: 'commitment.superseded',
      actor,
      metadata: { supersededBy: supersededByCommitmentId },
    },
  };
}

/** Whether this commitment can still be edited. */
export function canEditCommitment(commitment: Commitment, sessionStatus: SessionStatus): boolean {
  return (
    sessionStatus !== 'archived' &&
    (commitment.status === 'proposed' || commitment.status === 'active')
  );
}

/** Whether this commitment can be activated right now (support aside). */
export function canActivateCommitment(
  commitment: Commitment,
  sessionStatus: SessionStatus,
): boolean {
  return sessionStatus !== 'archived' && commitment.status === 'proposed';
}

/** Whether this commitment is currently something the institution owes. */
export function isOpenCommitment(commitment: Commitment): boolean {
  return commitment.status === 'proposed' || commitment.status === 'active';
}

/** Whether an active commitment has passed its due date at the given moment. */
export function isOverdueCommitment(commitment: Commitment, now: Date): boolean {
  return (
    commitment.status === 'active' &&
    commitment.dueDate !== null &&
    commitment.dueDate.getTime() < now.getTime()
  );
}
