/**
 * Maps between the API's named membership actions (`membershipActionSchema`)
 * and the domain's `MembershipState` — shared by the organisation-membership
 * and workspace-membership services so the two mappings cannot drift apart.
 */

import { permittedMembershipTransitions, type MembershipState } from '@witness/domain';
import type { MembershipAction } from '@witness/contracts';

export const MEMBERSHIP_ACTION_TO_STATE: Record<MembershipAction['action'], MembershipState> = {
  activate: 'active',
  suspend: 'suspended',
  revoke: 'revoked',
};

/** The inverse of `MEMBERSHIP_ACTION_TO_STATE` — `invited` has no action name because nothing transitions *into* it; it is only ever the starting state. */
const STATE_TO_MEMBERSHIP_ACTION: Partial<Record<MembershipState, MembershipAction['action']>> = {
  active: 'activate',
  suspended: 'suspend',
  revoked: 'revoke',
};

/** Named actions a membership in `state` may currently take — for `permittedActions` in an API response. */
export function permittedMembershipActionNames(state: MembershipState): string[] {
  return permittedMembershipTransitions(state)
    .map((next) => STATE_TO_MEMBERSHIP_ACTION[next])
    .filter((action): action is MembershipAction['action'] => action !== undefined);
}
