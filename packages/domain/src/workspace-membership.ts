/**
 * Workspace membership — "does this user belong to this workspace".
 *
 * A workspace membership cannot be granted to someone with no standing in the
 * workspace's parent organisation — that would let a workspace become a side
 * door around organisation membership entirely. The caller supplies the
 * user's *organisation* membership state (a database read, so an
 * application-layer concern per ADR-0003); this module is what actually
 * enforces the eligibility rule, so the check exists exactly once regardless
 * of how many call sites eventually reach it.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import {
  assertMembershipTransition,
  isInGoodStanding,
  type MembershipState,
} from './membership.js';
import type { UserId, WorkspaceId, WorkspaceMembershipId } from './ids.js';

export interface WorkspaceMembership {
  readonly id: WorkspaceMembershipId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly state: MembershipState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkspaceMembershipOutcome {
  readonly membership: WorkspaceMembership;
  readonly event: PendingAuditEvent;
}

/**
 * Add a user to a workspace.
 *
 * `organisationMembershipState` is the user's *current* membership state in
 * the workspace's parent organisation, or `null` if no such membership
 * exists at all — the caller cannot substitute "a membership somewhere" for
 * "a membership in *this* workspace's organisation", which is what stops a
 * user's standing in Organisation A being used to justify access to a
 * workspace under Organisation B.
 */
export function addWorkspaceMember(input: {
  id: WorkspaceMembershipId;
  workspaceId: WorkspaceId;
  userId: UserId;
  organisationMembershipState: MembershipState | null;
  addedBy: Actor;
  at: Date;
}): WorkspaceMembershipOutcome {
  if (
    input.organisationMembershipState === null ||
    !isInGoodStanding(input.organisationMembershipState)
  ) {
    throw new InvariantViolation(
      'A user cannot be added to a workspace without a valid membership in good standing ' +
        `in the workspace's organisation (found: ${input.organisationMembershipState ?? 'none'}).`,
      'ORGANISATION_MEMBERSHIP_REQUIRED',
    );
  }

  const membership: WorkspaceMembership = {
    id: input.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    state: 'invited',
    createdAt: input.at,
    updatedAt: input.at,
  };

  return {
    membership,
    event: {
      action: 'workspace_membership.created',
      actor: input.addedBy,
      metadata: {
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        to: membership.state,
      },
    },
  };
}

export function transitionWorkspaceMembership(
  membership: WorkspaceMembership,
  to: MembershipState,
  actor: Actor,
  at: Date,
): WorkspaceMembershipOutcome {
  assertMembershipTransition(membership.state, to);

  const next: WorkspaceMembership = { ...membership, state: to, updatedAt: at };

  return {
    membership: next,
    event: {
      action: 'workspace_membership.state_changed',
      actor,
      metadata: { from: membership.state, to },
    },
  };
}
