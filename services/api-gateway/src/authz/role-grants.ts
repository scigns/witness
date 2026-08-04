/**
 * Role → permitted actions, shared by `DevelopmentAuthorizationAdapter` (the
 * unverified dev-header path) and `SessionBackedAuthorizationAdapter` (the
 * real, session-backed path introduced in Milestone 1.3). One table, so the
 * two paths cannot grant different things for the same role name — see
 * `session-authenticator.ts` for how a signed-in principal's roles are
 * computed before reaching this table.
 */

import type { Action, AuthorizationDecision, Principal } from './authorization.port.js';

/** Role → permitted actions. Anything not listed is denied. */
export const ROLE_GRANTS: Readonly<Record<string, readonly Action[]>> = Object.freeze({
  // `role:read` (the static role/permission catalog) is granted broadly:
  // it is reference data, not per-user information, and understanding what
  // a role permits is useful to everyone who might be assigned one — unlike
  // membership and role-*assignment* management, which stay admin-only
  // below for the same "administrative by definition" reasoning as ever.
  reader: [
    'record:read',
    'organisation:read',
    'workspace:read',
    'role:read',
    'session:read',
    'participant:read',
    'consent_template:read',
    'session_consent:read',
    'participant_consent:read',
    'evidence:read',
    'evidence_link:read',
  ],
  // `session:update`/`session:transition` are workspace-wide, not
  // per-session: any contributor in a workspace's scope may rename, close,
  // reopen, or archive any session there, not only ones they facilitate.
  // There is no "assigned facilitator" ownership check in Milestone 2 — see
  // packages/policy/policy.csv's header comment for the full reasoning. The
  // same reasoning applies to `participant:*` (Milestone 3): any contributor
  // in scope may manage any session's participants, and
  // `participant:manage_restricted` (facilitator notes, and a pseudonymous
  // participant's linked-user identity) is granted at the same tier, not a
  // narrower one — Milestone 3 does not introduce a fifth tier just for
  // restricted participant data.
  // `session_consent:*`/`participant_consent:*` (Milestone 4, Consent
  // Management) follow `session:*`/`participant:*`'s exact precedent: any
  // contributor in scope may configure a session's consent and capture,
  // amend or withdraw a participant's consent — there is no per-session
  // "assigned facilitator" ownership check here either, and
  // `participant_consent:manage_restricted` (withdrawal reasons, detailed
  // category-decision views) is granted at this same tier rather than a
  // narrower one, mirroring `participant:manage_restricted`. Consent
  // capture is facilitator-mediated, not participant self-service (Milestone
  // 3 already established most participants cannot sign in to Witness at
  // all), so there is no separate participant-facing grant here.
  //
  // `consent_template:manage` is deliberately admin-only, NOT contributor —
  // unlike a session or its participants, a template is an organisation-wide
  // (or workspace-wide) governance artifact that every session in scope may
  // end up bound to, the same "administrative by definition" reasoning that
  // keeps membership and role-assignment management admin-only above.
  // `consent_template:read` stays broad, like `role:read`/`session:read` —
  // understanding what a template asks for is useful to anyone who might
  // configure or capture consent against it.
  //
  // `evidence:*`/`evidence_link:*` (BUILD_ROADMAP.md Milestone 5, Structured
  // Live Evidence Capture) follow the exact same precedent again: any
  // contributor in scope may capture, edit, submit, or withdraw evidence and
  // link it to other evidence, no per-session "assigned facilitator"
  // ownership check. `evidence:manage_restricted` (withdrawal reasons,
  // consent-basis provenance) is granted at this same tier, mirroring
  // `participant:manage_restricted`/`participant_consent:manage_restricted`.
  contributor: [
    'record:read',
    'record:create',
    'organisation:read',
    'workspace:read',
    'role:read',
    'session:read',
    'session:create',
    'session:update',
    'session:transition',
    'participant:read',
    'participant:create',
    'participant:update',
    'participant:manage_restricted',
    'consent_template:read',
    'session_consent:read',
    'session_consent:manage',
    'participant_consent:read',
    'participant_consent:manage',
    'participant_consent:manage_restricted',
    'evidence:read',
    'evidence:create',
    'evidence:update',
    'evidence:transition',
    'evidence:manage_restricted',
    'evidence_link:read',
    'evidence_link:manage',
  ],
  reviewer: [
    'record:read',
    'record:create',
    'record:review',
    'organisation:read',
    'workspace:read',
    'role:read',
    'session:read',
    'participant:read',
    'consent_template:read',
    'session_consent:read',
    'participant_consent:read',
    'evidence:read',
    'evidence_link:read',
  ],
  // Least privilege (Constitution, Authority and Access): organisation and
  // workspace creation are the privileged actions in this slice, so they are the
  // only grants `admin` adds on top of what `reviewer` already has — not a
  // blanket superuser role. User, membership, and role-assignment management
  // is administrative by definition (BUILD_ROADMAP.md Milestone 1.1: "an
  // organisation administrator needs to...") — reader/contributor/reviewer
  // get none of it, not even read, until a further Authorisation capability
  // decides otherwise.
  //
  // A signed-in session principal (Milestone 1.3) NEVER carries 'admin' in
  // `roles` — see `session-authenticator.ts` — so every action listed only here is,
  // for now, unreachable via real authentication. That is a deliberate,
  // fail-closed gap: Authorisation hardening (the next capability) must
  // define how a real identity legitimately becomes a platform
  // administrator, and this table must not guess at that in the meantime.
  admin: [
    'record:read',
    'record:create',
    'record:review',
    'organisation:read',
    'organisation:create',
    'workspace:read',
    'workspace:create',
    'user:read',
    'user:create',
    'organisation_membership:read',
    'organisation_membership:create',
    'organisation_membership:update',
    'workspace_membership:read',
    'workspace_membership:create',
    'workspace_membership:update',
    'role:read',
    'role_assignment:read',
    'role_assignment:write',
    'role_assignment:delete',
    'session:read',
    'session:create',
    'session:update',
    'session:transition',
    'participant:read',
    'participant:create',
    'participant:update',
    'participant:manage_restricted',
    'consent_template:read',
    'consent_template:manage',
    'session_consent:read',
    'session_consent:manage',
    'participant_consent:read',
    'participant_consent:manage',
    'participant_consent:manage_restricted',
    'evidence:read',
    'evidence:create',
    'evidence:update',
    'evidence:transition',
    'evidence:manage_restricted',
    'evidence_link:read',
    'evidence_link:manage',
  ],
});

export function decideByRoleGrants(principal: Principal, action: Action): AuthorizationDecision {
  for (const role of principal.roles) {
    if ((ROLE_GRANTS[role] ?? []).includes(action)) {
      return { allowed: true, reason: `role '${role}' grants '${action}'` };
    }
  }

  return {
    allowed: false,
    reason:
      principal.roles.length === 0
        ? `principal has no recognised role, so '${action}' is denied by default`
        : `no role in [${principal.roles.join(', ')}] grants '${action}'`,
  };
}
