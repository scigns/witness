/**
 * Workspace — a scoped working area inside an organisation (BUILD_ROADMAP.md,
 * Release 0.2, item 2).
 *
 * Where an organisation is the tenant boundary, a workspace is the unit sessions,
 * participants and records will actually be scoped to (roadmap items 6, 7, 9) —
 * an organisation running Witness across several unrelated programmes should not
 * have every facilitator seeing every other programme's material. This preview
 * only covers creation, same reasoning as `organisation.ts`: no rename, archive
 * or transfer operation exists yet, so none is modelled.
 *
 * A workspace cannot exist without an organisation — `organisationId` is
 * required, not optional, mirroring the domain's existing insistence that a
 * record cannot exist without provenance (P3). The domain trusts the caller that
 * the organisation exists; verifying that is an application-layer concern
 * (ADR-0003) because it requires a database read.
 *
 * `status` (Phase 4F, ADR-0028) names the programme's own lifecycle — draft
 * (being set up), recruiting (open for participants/collaborators before
 * work starts), active (running), review (wrapping up, evaluating
 * outcomes), closed (finished), archived (closed and read-only long-term).
 * This is deliberately a *separate* lifecycle from `CoDesignSession.status`
 * (`co-design-session.ts`): a programme can be `active` across many
 * sessions that individually cycle through draft/open/closed, and closing
 * one session says nothing about whether the programme itself is done.
 * Conflating the two would force every session to share the programme's
 * pace, which co-design programmes with irregular workshop cadences do not.
 */

import { HumanConfirmationRequired, InvariantViolation } from './errors.js';
import { isHuman, type Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { OrganisationId, WorkspaceId } from './ids.js';

/** The maximum length of a workspace name. */
const NAME_MAX = 200;

/** The maximum length of a workspace's descriptive "about" text. */
const DESCRIPTION_MAX = 4000;

export const WORKSPACE_STATUSES = [
  'draft',
  'recruiting',
  'active',
  'review',
  'closed',
  'archived',
] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

/**
 * Permitted lifecycle transitions. `closed -> active` (reopen) requires a
 * human actor and a stated reason via `reopenWorkspace` below — the same
 * "institutional decision reversal" guardrail as
 * `co-design-session.ts`'s `reopenSession` and `record.ts`'s
 * `reopenRecord` — so it is deliberately absent from this table and
 * `transitionWorkspace` rejects it. `archived` is terminal.
 */
const TRANSITIONS: Readonly<Record<WorkspaceStatus, readonly WorkspaceStatus[]>> = Object.freeze({
  draft: ['recruiting', 'active'],
  recruiting: ['active'],
  active: ['review', 'closed'],
  review: ['active', 'closed'],
  closed: ['archived'],
  archived: [],
});

export function canTransitionWorkspace(from: WorkspaceStatus, to: WorkspaceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function permittedWorkspaceTransitions(from: WorkspaceStatus): readonly WorkspaceStatus[] {
  return TRANSITIONS[from];
}

export interface Workspace {
  readonly id: WorkspaceId;
  readonly organisationId: OrganisationId;
  readonly name: string;
  /**
   * The "what is this co-design about, and why" text a participant reads on
   * first arriving. `null` is a distinct, honest state from an empty
   * string — nobody has written it yet, not "deliberately blank" — so a
   * landing page can prompt a facilitator to add it rather than rendering
   * nothing.
   */
  readonly description: string | null;
  readonly status: WorkspaceStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface WorkspaceOutcome {
  readonly workspace: Workspace;
  readonly event: PendingAuditEvent;
}

function assertName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A workspace must have a name. An unnamed workspace cannot be attributed to in provenance.',
      'NAME_REQUIRED',
    );
  }

  if (trimmed.length > NAME_MAX) {
    throw new InvariantViolation(
      `A workspace name must be ${NAME_MAX} characters or fewer, received ${trimmed.length}.`,
      'NAME_TOO_LONG',
    );
  }

  return trimmed;
}

function assertDescription(description: string | null): string | null {
  if (description === null) return null;
  const trimmed = description.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.length > DESCRIPTION_MAX) {
    throw new InvariantViolation(
      `A workspace description must be ${DESCRIPTION_MAX} characters or fewer, received ${trimmed.length}.`,
      'DESCRIPTION_TOO_LONG',
    );
  }

  return trimmed;
}

/**
 * Create a new workspace within an organisation.
 *
 * Least privilege (Constitution, Authority and Access): the application layer is
 * expected to gate this behind a `workspace:create` authorisation check, the
 * same way `organisation:create` gates `createOrganisation`.
 */
export function createWorkspace(input: {
  id: WorkspaceId;
  organisationId: OrganisationId;
  name: string;
  description?: string | null;
  createdBy: Actor;
  createdAt: Date;
}): WorkspaceOutcome {
  const workspace: Workspace = {
    id: input.id,
    organisationId: input.organisationId,
    name: assertName(input.name),
    description: assertDescription(input.description ?? null),
    status: 'draft',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 1,
  };

  return {
    workspace,
    event: {
      action: 'workspace.created',
      actor: input.createdBy,
      metadata: { name: workspace.name, organisationId: workspace.organisationId },
    },
  };
}

/**
 * Update a workspace's descriptive "about" text — the only mutable field
 * this preview models (see this file's header: no rename, archive or
 * transfer operation exists yet either). Kept separate from `createWorkspace`
 * because it is a distinct capability with its own audit action, not a
 * variant of creation.
 */
export function updateWorkspaceDetails(
  workspace: Workspace,
  input: { description?: string | null },
  updatedBy: Actor,
  at: Date,
): WorkspaceOutcome {
  const description =
    input.description === undefined ? workspace.description : assertDescription(input.description);

  const updated: Workspace = {
    ...workspace,
    description,
    updatedAt: at,
    version: workspace.version + 1,
  };

  return {
    workspace: updated,
    event: {
      action: 'workspace.details_updated',
      actor: updatedBy,
      metadata: { description: updated.description ?? '' },
    },
  };
}

/**
 * Move a programme forward (or one step back) through its lifecycle —
 * every edge in `TRANSITIONS` except `closed -> active`, which
 * `reopenWorkspace` below handles under a stricter guard.
 */
export function transitionWorkspace(
  workspace: Workspace,
  actor: Actor,
  to: WorkspaceStatus,
  at: Date,
): WorkspaceOutcome {
  if (workspace.status === 'closed' && to === 'active') {
    throw new InvariantViolation(
      'Reopening a closed programme requires a stated reason — use reopenWorkspace.',
      'INVALID_WORKSPACE_TRANSITION',
    );
  }

  if (!canTransitionWorkspace(workspace.status, to)) {
    throw new InvariantViolation(
      `Cannot move a programme from '${workspace.status}' to '${to}'.`,
      'INVALID_WORKSPACE_TRANSITION',
    );
  }

  const next: Workspace = {
    ...workspace,
    status: to,
    updatedAt: at,
    version: workspace.version + 1,
  };

  return {
    workspace: next,
    event: {
      action: 'workspace.status_changed',
      actor,
      metadata: { from: workspace.status, to },
    },
  };
}

/**
 * Reopen a closed programme. Requires a human actor and a stated reason —
 * this reverses "the programme is finished," an institutional decision
 * exactly like `co-design-session.ts`'s `reopenSession`.
 */
export function reopenWorkspace(
  workspace: Workspace,
  actor: Actor,
  reason: string,
  at: Date,
): WorkspaceOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  if (workspace.status !== 'closed') {
    throw new InvariantViolation(
      `Cannot reopen a programme from '${workspace.status}'.`,
      'INVALID_WORKSPACE_TRANSITION',
    );
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new InvariantViolation(
      'Reopening a closed programme must state a reason — this reverses that the programme had ended.',
      'REOPEN_REASON_REQUIRED',
    );
  }

  const next: Workspace = {
    ...workspace,
    status: 'active',
    updatedAt: at,
    version: workspace.version + 1,
  };

  return {
    workspace: next,
    event: {
      action: 'workspace.status_changed',
      actor,
      metadata: { from: 'closed', to: 'active', reason: trimmedReason },
    },
  };
}
