/**
 * Workspace membership — "does this user belong to this workspace".
 *
 * The *internal* path — `addWorkspaceMember` — cannot grant membership to
 * someone with no standing in the workspace's parent organisation; that
 * would let a workspace become a side door around organisation membership
 * entirely. The caller supplies the user's *organisation* membership state
 * (a database read, so an application-layer concern per ADR-0003); this
 * module is what actually enforces the eligibility rule, so the check
 * exists exactly once regardless of how many call sites eventually reach it.
 *
 * `addExternalWorkspaceCollaborator` (ADR-0028) is a second, additive path:
 * a facilitator, reviewer or Knowledge Steward from another organisation —
 * or from none at all — gains a `WorkspaceMembership` without ever holding
 * an `OrganisationMembership` in this workspace's organisation. It requires
 * a `viaInvitationId` in place of organisation standing: proof that an
 * accepted `WorkspaceInvitation` (`workspace-invitation.ts`), not caller
 * discretion, is what authorised this. The internal path is unchanged by
 * this addition.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import {
  assertMembershipTransition,
  isInGoodStanding,
  type MembershipState,
} from './membership.js';
import type { UserId, WorkspaceId, WorkspaceInvitationId, WorkspaceMembershipId } from './ids.js';
import { AFFILIATION_TYPES, type AffiliationType } from './workspace-invitation.js';

const AFFILIATION_LABEL_MAX = 300;

export interface WorkspaceMembership {
  readonly id: WorkspaceMembershipId;
  readonly workspaceId: WorkspaceId;
  readonly userId: UserId;
  readonly state: MembershipState;
  /**
   * Set only for a member added through `addExternalWorkspaceCollaborator`;
   * `null` for a member added through the internal, organisation-membership
   * -gated `addWorkspaceMember` path. This is the field that distinguishes
   * the two origins — see this file's header and ADR-0028.
   */
  readonly affiliationType: AffiliationType | null;
  readonly affiliationLabel: string | null;
  readonly viaInvitationId: WorkspaceInvitationId | null;
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
    affiliationType: null,
    affiliationLabel: null,
    viaInvitationId: null,
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

function assertAffiliationLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > AFFILIATION_LABEL_MAX) {
    throw new InvariantViolation(
      `An affiliation label must be ${AFFILIATION_LABEL_MAX} characters or fewer, received ${trimmed.length}.`,
      'AFFILIATION_LABEL_TOO_LONG',
    );
  }
  return trimmed;
}

function assertAffiliationType(value: string): asserts value is AffiliationType {
  if (!(AFFILIATION_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised affiliation type. Choose one of: ${AFFILIATION_TYPES.join(', ')}.`,
      'INVALID_AFFILIATION_TYPE',
    );
  }
}

/**
 * Add an external collaborator to a workspace — someone with no standing in
 * this workspace's parent organisation, whose eligibility rests entirely on
 * `viaInvitationId` naming the accepted `WorkspaceInvitation` that authorised
 * this (ADR-0028). The state is `active` immediately, not `invited`: unlike
 * the internal path, the human on the other end has already seen full
 * context and explicitly accepted before this function is ever called — see
 * `workspace-invitation.ts`'s `acceptWorkspaceInvitation`. There is nothing
 * left to confirm.
 */
export function addExternalWorkspaceCollaborator(input: {
  id: WorkspaceMembershipId;
  workspaceId: WorkspaceId;
  userId: UserId;
  affiliationType: string;
  affiliationLabel?: string | null | undefined;
  viaInvitationId: WorkspaceInvitationId;
  addedBy: Actor;
  at: Date;
}): WorkspaceMembershipOutcome {
  assertAffiliationType(input.affiliationType);

  const membership: WorkspaceMembership = {
    id: input.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    state: 'active',
    affiliationType: input.affiliationType,
    affiliationLabel: assertAffiliationLabel(input.affiliationLabel),
    viaInvitationId: input.viaInvitationId,
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
        affiliationType: membership.affiliationType ?? '',
        viaInvitationId: membership.viaInvitationId ?? '',
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
