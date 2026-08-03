/**
 * Role assignment — "what may this member do here" (BUILD_ROADMAP.md
 * Milestone 1.2, Roles and Permission Assignment).
 *
 * Scoped to exactly one organisation or one workspace, and requires the
 * assignee to already hold a membership in good standing in that scope — a
 * role assignment can never substitute for membership, and this module
 * refuses to create one implicitly, mirroring `workspace-membership.ts`'s
 * refusal to let organisation standing in one place justify access in
 * another.
 *
 * One assignment per (user, scope): assigning a role where none exists
 * creates it; assigning where one already exists is a distinct operation
 * (`changeRoleAssignment`) that replaces it. This keeps the model an
 * understandable matrix — one role per member per scope — rather than a
 * stack of grants that would need its own precedence rules.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import { isInGoodStanding, type MembershipState } from './membership.js';
import { isWitnessRole, type WitnessRole } from './role.js';
import type { OrganisationId, RoleAssignmentId, UserId, WorkspaceId } from './ids.js';

export type RoleAssignmentScope =
  | { readonly type: 'organisation'; readonly organisationId: OrganisationId }
  | { readonly type: 'workspace'; readonly workspaceId: WorkspaceId };

export interface RoleAssignment {
  readonly id: RoleAssignmentId;
  readonly userId: UserId;
  readonly role: WitnessRole;
  readonly scope: RoleAssignmentScope;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RoleAssignmentOutcome {
  readonly assignment: RoleAssignment;
  readonly event: PendingAuditEvent;
}

function scopeMetadata(scope: RoleAssignmentScope): Record<string, string> {
  return scope.type === 'organisation'
    ? { scopeType: 'organisation', organisationId: scope.organisationId }
    : { scopeType: 'workspace', workspaceId: scope.workspaceId };
}

function assertValidRole(role: string): asserts role is WitnessRole {
  if (!isWitnessRole(role)) {
    throw new InvariantViolation(`'${role}' is not a recognised Witness role.`, 'INVALID_ROLE');
  }
}

/**
 * `membershipState` is the assignee's membership state *in this exact
 * scope* — organisation membership for an organisation-scoped assignment,
 * workspace membership for a workspace-scoped one.
 *
 * `parentOrganisationMembershipState` applies only to workspace scope: the
 * assignee's membership state in the workspace's *parent* organisation,
 * re-checked here rather than assumed from the workspace membership having
 * once been valid — organisation standing can lapse after a workspace
 * membership was created, and a role assignment should not proceed on
 * standing that no longer holds.
 */
function assertEligible(
  scope: RoleAssignmentScope,
  membershipState: MembershipState | null,
  parentOrganisationMembershipState: MembershipState | null | undefined,
): void {
  if (membershipState === null || !isInGoodStanding(membershipState)) {
    throw new InvariantViolation(
      'A role cannot be assigned to a user without a membership in good standing in this scope ' +
        `(found: ${membershipState ?? 'none'}).`,
      'MEMBERSHIP_REQUIRED',
    );
  }

  if (scope.type === 'workspace') {
    if (
      parentOrganisationMembershipState === null ||
      parentOrganisationMembershipState === undefined ||
      !isInGoodStanding(parentOrganisationMembershipState)
    ) {
      throw new InvariantViolation(
        'A workspace role cannot be assigned to a user without a valid membership in good ' +
          `standing in the workspace's organisation (found: ${parentOrganisationMembershipState ?? 'none'}).`,
        'ORGANISATION_MEMBERSHIP_REQUIRED',
      );
    }
  }
}

export function assignRole(input: {
  id: RoleAssignmentId;
  userId: UserId;
  role: string;
  scope: RoleAssignmentScope;
  membershipState: MembershipState | null;
  parentOrganisationMembershipState?: MembershipState | null;
  assignedBy: Actor;
  at: Date;
}): RoleAssignmentOutcome {
  assertValidRole(input.role);
  assertEligible(input.scope, input.membershipState, input.parentOrganisationMembershipState);

  const assignment: RoleAssignment = {
    id: input.id,
    userId: input.userId,
    role: input.role,
    scope: input.scope,
    createdAt: input.at,
    updatedAt: input.at,
  };

  return {
    assignment,
    event: {
      action: 'role_assignment.created',
      actor: input.assignedBy,
      metadata: {
        userId: assignment.userId,
        role: assignment.role,
        ...scopeMetadata(assignment.scope),
      },
    },
  };
}

export function changeRoleAssignment(
  assignment: RoleAssignment,
  role: string,
  actor: Actor,
  at: Date,
): RoleAssignmentOutcome {
  assertValidRole(role);

  if (role === assignment.role) {
    throw new InvariantViolation(
      `This member already holds the '${role}' role in this scope.`,
      'ROLE_UNCHANGED',
    );
  }

  const next: RoleAssignment = { ...assignment, role, updatedAt: at };

  return {
    assignment: next,
    event: {
      action: 'role_assignment.changed',
      actor,
      metadata: { from: assignment.role, to: role, ...scopeMetadata(assignment.scope) },
    },
  };
}

export function removeRoleAssignment(assignment: RoleAssignment, actor: Actor): PendingAuditEvent {
  return {
    action: 'role_assignment.removed',
    actor,
    metadata: {
      userId: assignment.userId,
      role: assignment.role,
      ...scopeMetadata(assignment.scope),
    },
  };
}
