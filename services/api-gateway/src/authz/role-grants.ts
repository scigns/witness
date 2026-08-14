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
    'evidence_review:list',
    'evidence_review:read',
    'transcript:read',
    'summary:read',
    'outcome:read',
    'report:read',
    // A published report is meant to be taken away and used. `policy.csv`
    // grants this to reader too; the two tables must not disagree, because
    // the dev-header path reads this one and the session-backed path reads
    // that one.
    'report:export',
    'agenda_item:read',
    'resource:read',
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
    'workspace:update',
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
    'evidence_review:list',
    'evidence_review:read',
    'evidence_review:respond',
    'evidence_review:correct',
    'transcript:read',
    'transcript:create',
    'transcript:update',
    'summary:read',
    'summary:create',
    'summary:update',
    'outcome:read',
    'outcome:create',
    'outcome:update',
    'outcome:transition',
    'outcome:link_support',
    'report:read',
    'report:create',
    'report:update',
    'report:submit',
    'report:export',
    'agenda_item:read',
    'agenda_item:manage',
    'resource:read',
    'resource:manage',
  ],
  // `evidence_review:*` (BUILD_ROADMAP.md Milestone 6, Evidence Review and
  // Validation) is where `reviewer` first gains write actions of its own —
  // Milestone 5 granted this tier only `evidence:read`/`evidence_link:read`
  // because there was nothing yet for a reviewer to do. `assign`/`reassign`
  // (who reviews what), `start`/`clarify`/`validate`/`reject` (moving the
  // review state machine) and `view_history` (correction/decision history)
  // are reviewer-tier actions; `respond` and `correct` are granted to both
  // reviewer and contributor because a facilitator or the evidence's own
  // capturer — contributor-tier actors — must be able to answer a
  // clarification or correct evidence too, not only the assigned reviewer.
  // `evidence_review:manage_restricted` is admin-only, mirroring
  // `evidence:manage_restricted`'s own restricted-field precedent.
  //
  // Named consequence, accepted rather than overlooked: because `reviewer`
  // holds `assign`/`reassign`, a reviewer can assign themselves to any
  // evidence in the workspace and then validate it. The per-evidence
  // ownership check in `EvidenceReviewService` therefore prevents one
  // reviewer acting on *another's* assignment; it is not a segregation of
  // duties between assigning and deciding. That is deliberate for the MVP —
  // a reviewer picking up unassigned evidence is the normal workflow, and
  // there is no second reviewer tier to assign on their behalf. Every
  // assignment and decision is audited with its actor, so self-assignment is
  // visible after the fact. Splitting assignment onto an admin-only tier is
  // the change to make if an institution needs enforced separation.
  //
  // `outcome:*` (BUILD_ROADMAP.md Milestone 7, Decisions, Commitments and
  // Actions) reuses that same split rather than inventing a new one:
  // contributor proposes decisions, drafts commitments and runs actions
  // through start/progress/block/complete; reviewer confirms and closes,
  // because those are the moments an outcome becomes — or stops being —
  // institutional record. `outcome:link_support` sits on both tiers, since
  // assembling the basis for a proposal and satisfying yourself before
  // confirming it are both legitimate, and the domain refuses inadmissible
  // evidence either way. There is no `outcome:manage_restricted`: an outcome
  // carries no restricted participant identity by construction — see
  // packages/domain/src/commitment.ts on why an owner is plain language and
  // is never a session participant.
  //
  // `report:*` (BUILD_ROADMAP.md Milestone 8, Session Summary, Reporting and
  // Export) splits along the same seam once more. Writing a report —
  // `create`/`update`/`submit` — is contributor work; `approve` and `publish`
  // are reviewer work, because those are the moments the institution takes
  // responsibility for what the report says. Nobody approves their own report
  // by default: a contributor cannot approve at all, and a reviewer cannot
  // create one. That is segregation of duties by grant rather than by
  // per-report ownership check, which is as far as the MVP goes — an
  // organisation needing a named approver distinct from every author should
  // grant `report:approve` to a narrower tier.
  //
  // `report:export` sits on both tiers *and* on reader: a report that has been
  // approved and published is meant to be taken away and used, and requiring
  // reviewer rights to save a copy of an already-published document would make
  // the approval gate meaningless while making the product annoying. The
  // export path still redacts server-side against the reader's own scope.
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
    'evidence_review:list',
    'evidence_review:read',
    'evidence_review:assign',
    'evidence_review:reassign',
    'evidence_review:start',
    'evidence_review:clarify',
    'evidence_review:respond',
    'evidence_review:correct',
    'evidence_review:validate',
    'evidence_review:reject',
    'evidence_review:view_history',
    'transcript:read',
    'summary:read',
    'outcome:read',
    'outcome:confirm',
    'outcome:close',
    'outcome:link_support',
    'report:read',
    'report:approve',
    'report:publish',
    'report:export',
    'agenda_item:read',
    'resource:read',
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
    'organisation:update',
    'workspace:read',
    'workspace:create',
    'workspace:update',
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
    'evidence_review:list',
    'evidence_review:read',
    'evidence_review:assign',
    'evidence_review:reassign',
    'evidence_review:start',
    'evidence_review:clarify',
    'evidence_review:respond',
    'evidence_review:correct',
    'evidence_review:validate',
    'evidence_review:reject',
    'evidence_review:view_history',
    'evidence_review:manage_restricted',
    'transcript:read',
    'transcript:create',
    'transcript:update',
    'summary:read',
    'summary:create',
    'summary:update',
    'outcome:read',
    'outcome:create',
    'outcome:update',
    'outcome:transition',
    'outcome:confirm',
    'outcome:close',
    'outcome:link_support',
    'report:read',
    'report:create',
    'report:update',
    'report:submit',
    'report:approve',
    'report:publish',
    'report:export',
    'agenda_item:read',
    'agenda_item:manage',
    'resource:read',
    'resource:manage',
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
