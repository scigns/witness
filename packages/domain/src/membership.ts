/**
 * Membership — shared state machine for "does this user belong here".
 *
 * Organisation membership and workspace membership are structurally identical:
 * both answer belonging, not permission (`BUILD_ROADMAP.md` Milestone 1.1 is
 * explicit that role assignment is a later, separate capability). Sharing one
 * state machine here means the two aggregates cannot drift into inconsistent
 * transition rules, the same reasoning that keeps `review.ts` a single module
 * shared by every record transition.
 */

import { InvariantViolation } from './errors.js';

export const MEMBERSHIP_STATES = ['invited', 'active', 'suspended', 'revoked'] as const;

export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/**
 * Permitted transitions.
 *
 * `revoked` is terminal — re-admitting someone is a new membership, not a
 * reopened one, so that the audit trail never has to explain "revoked, then
 * un-revoked" as a single ambiguous state.
 */
const TRANSITIONS: Readonly<Record<MembershipState, readonly MembershipState[]>> = Object.freeze({
  invited: ['active', 'revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked: [],
});

export function canTransitionMembership(from: MembershipState, to: MembershipState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertMembershipTransition(from: MembershipState, to: MembershipState): void {
  if (!canTransitionMembership(from, to)) {
    throw new InvariantViolation(
      `Cannot move a membership from '${from}' to '${to}'.`,
      'INVALID_MEMBERSHIP_TRANSITION',
    );
  }
}

export function permittedMembershipTransitions(from: MembershipState): readonly MembershipState[] {
  return TRANSITIONS[from];
}

/**
 * Whether a membership currently counts as belonging — the bar a workspace
 * membership checks against its parent organisation membership. `suspended`
 * and `revoked` do not clear it: a suspended organisation member should not be
 * newly admitted to a workspace while their standing is in question.
 */
export function isInGoodStanding(state: MembershipState): boolean {
  return state === 'invited' || state === 'active';
}
