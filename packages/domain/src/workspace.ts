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

export interface Workspace {
  readonly id: WorkspaceId;
  readonly organisationId: OrganisationId;
  readonly name: string;
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
  createdBy: Actor;
  createdAt: Date;
}): WorkspaceOutcome {
  const workspace: Workspace = {
    id: input.id,
    organisationId: input.organisationId,
    name: assertName(input.name),
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
