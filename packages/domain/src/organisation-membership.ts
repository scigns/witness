/**
 * Organisation membership — "does this user belong to this organisation".
 *
 * Deliberately answers only that question. What the user may *do* inside the
 * organisation is a later, separate capability (`BUILD_ROADMAP.md` Milestone
 * 1.2, Roles and Permission Assignment) — conflating the two here would make
 * this module a dependency of a decision it has no authority to make.
 */

import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import { assertMembershipTransition, type MembershipState } from './membership.js';
import type { OrganisationId, OrganisationMembershipId, UserId } from './ids.js';

export interface OrganisationMembership {
  readonly id: OrganisationMembershipId;
  readonly organisationId: OrganisationId;
  readonly userId: UserId;
  readonly state: MembershipState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrganisationMembershipOutcome {
  readonly membership: OrganisationMembership;
  readonly event: PendingAuditEvent;
}

/**
 * Add a user to an organisation.
 *
 * Always starts `invited`, mirroring `User` itself — an administrator adding
 * someone is not the same as that person having active access; it is a record
 * that they are supposed to. Duplicate-membership prevention is an
 * application-layer concern (requires reading existing memberships,
 * ADR-0003) enforced by a database uniqueness constraint on
 * (organisationId, userId).
 */
export function addOrganisationMember(input: {
  id: OrganisationMembershipId;
  organisationId: OrganisationId;
  userId: UserId;
  addedBy: Actor;
  at: Date;
}): OrganisationMembershipOutcome {
  const membership: OrganisationMembership = {
    id: input.id,
    organisationId: input.organisationId,
    userId: input.userId,
    state: 'invited',
    createdAt: input.at,
    updatedAt: input.at,
  };

  return {
    membership,
    event: {
      action: 'organisation_membership.created',
      actor: input.addedBy,
      metadata: {
        organisationId: membership.organisationId,
        userId: membership.userId,
        to: membership.state,
      },
    },
  };
}

export function transitionOrganisationMembership(
  membership: OrganisationMembership,
  to: MembershipState,
  actor: Actor,
  at: Date,
): OrganisationMembershipOutcome {
  assertMembershipTransition(membership.state, to);

  const next: OrganisationMembership = { ...membership, state: to, updatedAt: at };

  return {
    membership: next,
    event: {
      action: 'organisation_membership.state_changed',
      actor,
      metadata: { from: membership.state, to },
    },
  };
}
