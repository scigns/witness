/**
 * ActionItem (BUILD_ROADMAP.md Milestone 7) — a concrete piece of work with
 * an owner, a due date and a state you can look at and know where it stands.
 *
 * Lifecycle: `open → in_progress → completed`, with `in_progress ↔ blocked`
 * and `cancelled` reachable from any state that is not already terminal.
 * Blocking is a round trip on purpose: work that stalls and resumes is the
 * normal case, and a model that only lets you record the stall would push
 * people to cancel-and-recreate, destroying the item's history.
 *
 * An action carries `progressNote` and `percentComplete` because "how is it
 * going" is asked far more often than "is it done", and an item that can
 * only answer the second is a checkbox rather than a record. `blockedReason`
 * is separate from `progressNote` — why it is stuck and how far it got are
 * different facts, and merging them loses the one you did not write last.
 *
 * Unlike `Decision` and `Commitment`, an action does not require support to
 * start. An action is *how* an institution carries out what it decided, not
 * an institutional claim in its own right; the accountability sits on the
 * decision or commitment it serves. Actions may still be linked to evidence
 * for traceability, and `OutcomeSupport` accepts them.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import type {
  ActionItemId,
  CoDesignSessionId,
  OrganisationId,
  UserId,
  WorkspaceId,
} from './ids.js';

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 5000;
const OWNER_MAX = 200;
const NOTE_MAX = 2000;

export const ACTION_ITEM_STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const ACTION_ITEM_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

/** States from which no further work transition is possible. */
const TERMINAL_STATUSES: ReadonlySet<ActionItemStatus> = new Set(['completed', 'cancelled']);

export interface ActionItem {
  readonly id: ActionItemId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly title: string;
  readonly description: string;
  readonly status: ActionItemStatus;
  readonly priority: ActionItemPriority;
  /** Always present — same two-part ownership reasoning as `Commitment`. */
  readonly ownerDescription: string;
  readonly ownerUserId: UserId | null;
  readonly dueDate: Date | null;
  /** 0–100. Advisory; `status` is what actually says whether it is done. */
  readonly percentComplete: number;
  readonly progressNote: string | null;
  readonly blockedReason: string | null;
  readonly createdBy: Actor;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly closedAt: Date | null;
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ActionItemOutcome {
  readonly actionItem: ActionItem;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`An action must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `An action ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
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

function assertPercent(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isInteger(value)) {
    throw new InvariantViolation(
      'Progress must be a whole percentage.',
      'INVALID_PERCENT_COMPLETE',
    );
  }
  if (value < 0 || value > 100) {
    throw new InvariantViolation(
      `Progress must be between 0 and 100, received ${value}.`,
      'INVALID_PERCENT_COMPLETE',
    );
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

function assertNotTerminal(actionItem: ActionItem, verb: string): void {
  if (TERMINAL_STATUSES.has(actionItem.status)) {
    throw new InvariantViolation(
      `A '${actionItem.status}' action can no longer be ${verb}.`,
      'ACTION_ALREADY_CLOSED',
    );
  }
}

export interface CreateActionItemInput {
  id: ActionItemId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  title: string;
  description: string;
  ownerDescription: string;
  ownerUserId?: UserId | null | undefined;
  priority?: ActionItemPriority | undefined;
  dueDate?: Date | null | undefined;
  createdBy: Actor;
  at: Date;
}

export function createActionItem(
  sessionStatus: SessionStatus,
  input: CreateActionItemInput,
): ActionItemOutcome {
  assertMutable(sessionStatus);

  const actionItem: ActionItem = {
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
    status: 'open',
    priority: input.priority ?? 'medium',
    ownerDescription: assertNonEmpty(input.ownerDescription, 'owner', OWNER_MAX, 'OWNER_REQUIRED'),
    ownerUserId: input.ownerUserId ?? null,
    dueDate: assertDueDate(input.dueDate),
    percentComplete: 0,
    progressNote: null,
    blockedReason: null,
    createdBy: input.createdBy,
    startedAt: null,
    completedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    actionItem,
    event: {
      action: 'action_item.created',
      actor: input.createdBy,
      metadata: { sessionId: actionItem.sessionId, owner: actionItem.ownerDescription },
    },
  };
}

export interface UpdateActionItemInput {
  title?: string | undefined;
  description?: string | undefined;
  ownerDescription?: string | undefined;
  ownerUserId?: UserId | null | undefined;
  priority?: ActionItemPriority | undefined;
  dueDate?: Date | null | undefined;
}

/** Edit an action's details. Permitted in any non-terminal state. */
export function updateActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateActionItemInput,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);
  assertNotTerminal(actionItem, 'edited');

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: ActionItem = {
    ...actionItem,
    title:
      patch.title !== undefined
        ? assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED')
        : actionItem.title,
    description:
      patch.description !== undefined
        ? assertNonEmpty(patch.description, 'description', DESCRIPTION_MAX, 'DESCRIPTION_REQUIRED')
        : actionItem.description,
    ownerDescription:
      patch.ownerDescription !== undefined
        ? assertNonEmpty(patch.ownerDescription, 'owner', OWNER_MAX, 'OWNER_REQUIRED')
        : actionItem.ownerDescription,
    ownerUserId: patch.ownerUserId !== undefined ? patch.ownerUserId : actionItem.ownerUserId,
    priority: patch.priority ?? actionItem.priority,
    dueDate: patch.dueDate !== undefined ? assertDueDate(patch.dueDate) : actionItem.dueDate,
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: {
      action: 'action_item.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/** Begin work. `open → in_progress` only. */
export function startActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);

  if (actionItem.status !== 'open') {
    throw new InvariantViolation(
      `Only an open action can be started — this action is '${actionItem.status}'.`,
      'INVALID_ACTION_TRANSITION',
    );
  }

  const next: ActionItem = {
    ...actionItem,
    status: 'in_progress',
    startedAt: at,
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: { action: 'action_item.started', actor, metadata: { from: actionItem.status } },
  };
}

/**
 * Record progress without changing state. Permitted while `in_progress` or
 * `blocked` — a blocked item can still have its situation updated, and
 * requiring an unblock first would lose the note.
 */
export function recordActionProgress(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  update: { percentComplete?: number | undefined; note?: string | null | undefined },
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);

  if (actionItem.status !== 'in_progress' && actionItem.status !== 'blocked') {
    throw new InvariantViolation(
      `Progress can only be recorded on an action being worked on — this action is '${actionItem.status}'.`,
      'INVALID_ACTION_TRANSITION',
    );
  }

  if (update.percentComplete === undefined && update.note === undefined) {
    throw new InvariantViolation(
      'A progress update must record a percentage or a note.',
      'NO_CHANGES',
    );
  }

  const next: ActionItem = {
    ...actionItem,
    percentComplete:
      update.percentComplete !== undefined
        ? assertPercent(update.percentComplete)
        : actionItem.percentComplete,
    progressNote:
      update.note !== undefined
        ? assertOptionalText(update.note, NOTE_MAX, 'PROGRESS_NOTE')
        : actionItem.progressNote,
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: {
      action: 'action_item.progress_recorded',
      actor,
      metadata: { percentComplete: String(next.percentComplete) },
    },
  };
}

/** Mark work stalled. `in_progress → blocked`, reason required. */
export function blockActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);

  if (actionItem.status !== 'in_progress') {
    throw new InvariantViolation(
      `Only an in-progress action can be blocked — this action is '${actionItem.status}'.`,
      'INVALID_ACTION_TRANSITION',
    );
  }

  const next: ActionItem = {
    ...actionItem,
    status: 'blocked',
    blockedReason: assertNonEmpty(reason, 'blocking reason', NOTE_MAX, 'BLOCKED_REASON_REQUIRED'),
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: {
      action: 'action_item.blocked',
      actor,
      metadata: { reason: next.blockedReason ?? '' },
    },
  };
}

/** Resume stalled work. `blocked → in_progress`, clearing the reason. */
export function unblockActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);

  if (actionItem.status !== 'blocked') {
    throw new InvariantViolation(
      `Only a blocked action can be unblocked — this action is '${actionItem.status}'.`,
      'INVALID_ACTION_TRANSITION',
    );
  }

  const next: ActionItem = {
    ...actionItem,
    status: 'in_progress',
    blockedReason: null,
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: { action: 'action_item.unblocked', actor, metadata: { from: actionItem.status } },
  };
}

/**
 * Complete an action. Reachable from `open`, `in_progress` or `blocked` —
 * small actions get done without anyone touching "start", and refusing to
 * record that would only teach people to lie to the workflow. Sets
 * `percentComplete` to 100: a completed action at 60% is a contradiction.
 */
export function completeActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  note: string | null,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);
  assertNotTerminal(actionItem, 'completed');

  const next: ActionItem = {
    ...actionItem,
    status: 'completed',
    percentComplete: 100,
    progressNote: assertOptionalText(note, NOTE_MAX, 'PROGRESS_NOTE') ?? actionItem.progressNote,
    blockedReason: null,
    completedAt: at,
    closedAt: at,
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: { action: 'action_item.completed', actor, metadata: { from: actionItem.status } },
  };
}

/** Cancel an action that will not be done. Reason required. */
export function cancelActionItem(
  actionItem: ActionItem,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string,
  at: Date,
): ActionItemOutcome {
  assertMutable(sessionStatus);
  assertNotTerminal(actionItem, 'cancelled');

  const next: ActionItem = {
    ...actionItem,
    status: 'cancelled',
    closedAt: at,
    closeReason: assertNonEmpty(
      reason,
      'cancellation reason',
      NOTE_MAX,
      'CANCELLATION_REASON_REQUIRED',
    ),
    updatedAt: at,
    version: actionItem.version + 1,
  };

  return {
    actionItem: next,
    event: {
      action: 'action_item.cancelled',
      actor,
      metadata: { from: actionItem.status, reason: next.closeReason ?? '' },
    },
  };
}

/** Whether this action's details can still be edited. */
export function canEditActionItem(actionItem: ActionItem, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && !TERMINAL_STATUSES.has(actionItem.status);
}

/** Whether this action is still live work. */
export function isOpenActionItem(actionItem: ActionItem): boolean {
  return !TERMINAL_STATUSES.has(actionItem.status);
}

/** Whether an open action has passed its due date at the given moment. */
export function isOverdueActionItem(actionItem: ActionItem, now: Date): boolean {
  return (
    isOpenActionItem(actionItem) &&
    actionItem.dueDate !== null &&
    actionItem.dueDate.getTime() < now.getTime()
  );
}
