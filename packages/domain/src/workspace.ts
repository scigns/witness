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
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { OrganisationId, WorkspaceId } from './ids.js';

/** The maximum length of a workspace name. */
const NAME_MAX = 200;

/** The maximum length of a workspace's descriptive "about" text. */
const DESCRIPTION_MAX = 4000;

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
  readonly createdAt: Date;
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
    createdAt: input.createdAt,
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
): WorkspaceOutcome {
  const description =
    input.description === undefined ? workspace.description : assertDescription(input.description);

  const updated: Workspace = { ...workspace, description };

  return {
    workspace: updated,
    event: {
      action: 'workspace.details_updated',
      actor: updatedBy,
      metadata: { description: updated.description ?? '' },
    },
  };
}
