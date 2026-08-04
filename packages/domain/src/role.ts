/**
 * Roles — the canonical answer to "what may a member do here".
 *
 * Deliberately separate from `membership.ts`: membership answers "does this
 * user belong to this organisation or workspace", role answers "what are
 * they permitted to do once they do" (BUILD_ROADMAP.md Milestone 1.2). The
 * two are enforced by different rules and change for different reasons, so
 * conflating them into one state machine would make neither rule legible.
 *
 * Role identifiers are preserved from the existing
 * `DevelopmentAuthorizationAdapter` grants (`reader`, `contributor`,
 * `reviewer`, `admin`) rather than renamed to the Constitution's prose
 * ("read-only user", "organisation administrator") — the task that
 * introduced this module was explicit that existing canonical names should
 * be kept unless a rename is necessary and documented; here it is not
 * necessary. `facilitator` and `participant` are new: neither exists yet in
 * the dev-header role grants, because those grants answer "who may call the
 * Witness API at all" (a request-level concern), not "what may this member
 * do in this organisation or workspace" (this module's concern) — the two
 * are intentionally different axes that happen to share some names.
 */

export const WITNESS_ROLES = [
  'admin',
  'facilitator',
  'contributor',
  'reviewer',
  'participant',
  'reader',
] as const;

export type WitnessRole = (typeof WITNESS_ROLES)[number];

export function isWitnessRole(value: string): value is WitnessRole {
  return (WITNESS_ROLES as readonly string[]).includes(value);
}

/**
 * What a role permits, in the vocabulary of the one capability that exists
 * today (institutional records). This is deliberately not the same type as
 * `AuthorizationPort.Action` in the API service: that type gates *this
 * specific request*, while this one describes what a role conceptually
 * grants a member within a scope, independent of how any given request is
 * authenticated. The two vocabularies overlap where they describe the same
 * underlying capability (`record:read` means the same thing either way) —
 * see `RoleAssignmentView.permittedActions` for where they meet.
 */
export const ROLE_PERMISSIONS = [
  'record:read',
  'record:create',
  'record:review',
  'membership:manage',
  'role_assignment:manage',
  'session:read',
  'session:create',
  'session:manage',
] as const;

export type RolePermission = (typeof ROLE_PERMISSIONS)[number];

/**
 * Role → permitted actions, least privilege by construction: a role grants
 * exactly the actions listed, nothing implied by name or hierarchy.
 *
 * `facilitator` and `contributor` diverge as of Milestone 2 (Co-design
 * Session Management): both still hold the same record actions (both
 * generate evidence, neither holds review authority), and both now also
 * hold `session:read`/`session:create`/`session:manage` — Casbin resolves
 * the two onto the same request-time tier
 * (`services/api-gateway/src/authz/role-resolution.ts`'s `ROLE_TO_TIER`),
 * so a plain `contributor` can create and manage sessions too, not only a
 * `facilitator`. That is a deliberate, named simplification for this
 * milestone (see `packages/policy/policy.csv`'s header comment), not the
 * two roles actually being identical — a future milestone that needs to
 * split them onto their own tiers can do so without this table changing
 * shape.
 *
 * `participant` grants `record:read` and `session:read` only:
 * session-level participant management (Milestone 3) is not built yet, so a
 * participant role assignment today can only honestly promise what the
 * current product surface can enforce.
 *
 * `admin` is scope-relative here — an `admin` `RoleAssignment` on
 * Organisation X means "administers Organisation X", not the global
 * dev-header `admin` role used to bootstrap organisations and workspaces
 * (`services/api-gateway/src/authz/development.adapter.ts`). The two are
 * unrelated mechanisms that happen to share a name; see `role-assignment.ts`
 * for how this PR keeps them from being conflated.
 */
export const ROLE_PERMISSIONS_BY_ROLE: Readonly<Record<WitnessRole, readonly RolePermission[]>> =
  Object.freeze({
    reader: ['record:read', 'session:read'],
    participant: ['record:read', 'session:read'],
    contributor: [
      'record:read',
      'record:create',
      'session:read',
      'session:create',
      'session:manage',
    ],
    facilitator: [
      'record:read',
      'record:create',
      'session:read',
      'session:create',
      'session:manage',
    ],
    reviewer: ['record:read', 'record:create', 'record:review', 'session:read'],
    admin: [
      'record:read',
      'record:create',
      'record:review',
      'membership:manage',
      'role_assignment:manage',
      'session:read',
      'session:create',
      'session:manage',
    ],
  });

export function permittedActionsForRole(role: WitnessRole): readonly RolePermission[] {
  return ROLE_PERMISSIONS_BY_ROLE[role];
}
