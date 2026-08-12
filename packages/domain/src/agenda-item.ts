/**
 * Agenda item — a facilitator-managed entry in a co-design program's
 * timeline (Client-Ready Experience overhaul, Phase 11). Program-scoped
 * (`workspaceId`), not session-scoped: a program's agenda can reasonably
 * span more than one session, and the optional `sessionId` links an item to
 * a specific one when it is.
 *
 * At most one item per workspace may be `current` at a time — that is what
 * "the live view shows what's happening now" means, and a second current
 * item would make that question unanswerable. Enforced here, not by a
 * database constraint, because the application layer already holds every
 * other item's row before deciding — the same reasoning the domain uses for
 * the rest of its state machines.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { AgendaItemId, CoDesignSessionId, UserId, WorkspaceId } from './ids.js';

export const AGENDA_ITEM_STATUSES = ['upcoming', 'current', 'completed'] as const;
export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

const TITLE_MAX = 200;
const TEXT_MAX = 4000;

export interface AgendaItem {
  readonly id: AgendaItemId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId | null;
  readonly title: string;
  readonly description: string | null;
  readonly promptText: string | null;
  readonly facilitatorId: UserId | null;
  readonly status: AgendaItemStatus;
  readonly sortOrder: number;
  readonly startAt: Date | null;
  readonly durationMinutes: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgendaItemOutcome {
  readonly item: AgendaItem;
  readonly event: PendingAuditEvent;
}

function assertTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('An agenda item must have a title.', 'TITLE_REQUIRED');
  }
  if (trimmed.length > TITLE_MAX) {
    throw new InvariantViolation(
      `An agenda item title must be ${TITLE_MAX} characters or fewer.`,
      'TITLE_TOO_LONG',
    );
  }
  return trimmed;
}

function assertOptionalText(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > TEXT_MAX) {
    throw new InvariantViolation(
      `${field} must be ${TEXT_MAX} characters or fewer.`,
      'TEXT_TOO_LONG',
    );
  }
  return trimmed;
}

export function createAgendaItem(input: {
  id: AgendaItemId;
  workspaceId: WorkspaceId;
  sessionId?: CoDesignSessionId | null;
  title: string;
  description?: string | null;
  promptText?: string | null;
  facilitatorId?: UserId | null;
  sortOrder: number;
  startAt?: Date | null;
  durationMinutes?: number | null;
  createdBy: Actor;
  createdAt: Date;
}): AgendaItemOutcome {
  if (
    input.durationMinutes !== undefined &&
    input.durationMinutes !== null &&
    input.durationMinutes <= 0
  ) {
    throw new InvariantViolation(
      'Duration must be a positive number of minutes.',
      'INVALID_DURATION',
    );
  }

  const item: AgendaItem = {
    id: input.id,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    title: assertTitle(input.title),
    description: assertOptionalText(input.description, 'Description'),
    promptText: assertOptionalText(input.promptText, 'The prompt'),
    facilitatorId: input.facilitatorId ?? null,
    status: 'upcoming',
    sortOrder: input.sortOrder,
    startAt: input.startAt ?? null,
    durationMinutes: input.durationMinutes ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  return {
    item,
    event: {
      action: 'agenda_item.created',
      actor: input.createdBy,
      metadata: { workspaceId: item.workspaceId, title: item.title },
    },
  };
}

export function updateAgendaItem(
  item: AgendaItem,
  input: {
    title?: string;
    description?: string | null;
    promptText?: string | null;
    facilitatorId?: UserId | null;
    startAt?: Date | null;
    durationMinutes?: number | null;
  },
  updatedBy: Actor,
  at: Date,
): AgendaItemOutcome {
  if (
    input.durationMinutes !== undefined &&
    input.durationMinutes !== null &&
    input.durationMinutes <= 0
  ) {
    throw new InvariantViolation(
      'Duration must be a positive number of minutes.',
      'INVALID_DURATION',
    );
  }

  const updated: AgendaItem = {
    ...item,
    title: input.title === undefined ? item.title : assertTitle(input.title),
    description:
      input.description === undefined
        ? item.description
        : assertOptionalText(input.description, 'Description'),
    promptText:
      input.promptText === undefined
        ? item.promptText
        : assertOptionalText(input.promptText, 'The prompt'),
    facilitatorId: input.facilitatorId === undefined ? item.facilitatorId : input.facilitatorId,
    startAt: input.startAt === undefined ? item.startAt : input.startAt,
    durationMinutes:
      input.durationMinutes === undefined ? item.durationMinutes : input.durationMinutes,
    updatedAt: at,
  };

  return {
    item: updated,
    event: {
      action: 'agenda_item.updated',
      actor: updatedBy,
      metadata: { workspaceId: item.workspaceId },
    },
  };
}

/**
 * Move an item through upcoming → current → completed, or back to upcoming
 * (a facilitator re-opening something). `otherCurrentItemIds` is every other
 * item in the workspace currently `current` — the caller (application
 * layer, which alone can see the whole table) passes them in so this stays a
 * pure function; the ones the caller must also demote are returned, not
 * mutated here.
 */
export function transitionAgendaItemStatus(
  item: AgendaItem,
  status: AgendaItemStatus,
  transitionedBy: Actor,
  at: Date,
): AgendaItemOutcome {
  const updated: AgendaItem = { ...item, status, updatedAt: at };

  return {
    item: updated,
    event: {
      action: 'agenda_item.status_changed',
      actor: transitionedBy,
      metadata: { workspaceId: item.workspaceId, from: item.status, to: status },
    },
  };
}

export function reorderAgendaItem(
  item: AgendaItem,
  sortOrder: number,
  reorderedBy: Actor,
  at: Date,
): AgendaItemOutcome {
  return {
    item: { ...item, sortOrder, updatedAt: at },
    event: {
      action: 'agenda_item.reordered',
      actor: reorderedBy,
      metadata: { workspaceId: item.workspaceId, sortOrder: String(sortOrder) },
    },
  };
}
