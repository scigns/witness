# ADR-0028: The Organisation → Workspace → Session → Participant model, and external collaboration

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-22 |
| **Deciders** | Principal Architect, Backend Lead, Security Lead, Product Director |
| **Consulted** | Identity, Governance |
| **Informed** | All contributors |
| **Supersedes** | none (ratifies an existing, previously undocumented model) |
| **Related** | ADR-0003, ADR-0007, ADR-0013, ADR-0023, ADR-0025, ADR-0026, ADR-0027 |
| **Principles engaged** | P1, P3, P6 |

## Context

`Organisation`, `Workspace`, `OrganisationMembership`, `WorkspaceMembership`, `RoleAssignment` and
`SessionParticipant` have existed in `packages/domain` since Milestones 1.1–1.2 and 3, and are
exercised by hundreds of passing tests. No ADR has ever stated, in one place, what the model *is*
— what a tenant boundary means here, what belonging means versus authority, or how a person
participates without joining an organisation. A 2026-09-22 productisation audit found the closest
thing to a written data model (`architecture/DATA_MODEL.md`) describes a different, never-built
schema (`tenant`, `subject`, `group`), and found that the real model has one genuine gap: a
workspace role could not be granted to anyone who was not already a member of that workspace's
organisation — which meant Organisation A could not give a facilitator from Organisation B any
standing in a shared programme without first making them an Organisation A member. That blocks the
product's stated multi-organisation co-design use case outright.

This ADR does two things: it ratifies the model that already exists and is already correct, and it
extends exactly one part of it — workspace-scoped authority — to admit an external collaborator
without organisation membership. It does not introduce a parallel ontology; `architecture/
DATA_MODEL.md` is rewritten alongside this ADR to describe this same model, not a different one.

## Decision

> **Organisation is the tenant boundary. Workspace (the product calls it a "programme" or
> "co-design" in the UI) is a scoped working area inside one organisation. Session is one workshop
> or meeting inside a workspace. Identity, affiliation, participation and authority are four
> different concepts, and Witness never infers one from another.**

### The four axes

```text
Identity            — a Witness User (Keycloak-verified), or no account at all
      |
Affiliation         — contextual metadata: "I am here on behalf of Org X / independently /
      |                a community" — never itself a grant of authority, never auto-creates
      |                an Organisation tenant
      |
Participation       — SessionParticipant: is this person on this session's roster, and how
      |                much of who they are is recorded (named / pseudonymous / anonymous)
      |
Authority           — RoleAssignment, backed by a Membership in good standing: what this
                       person may *do*, at exactly one scope (organisation or workspace)
```

Each axis is answered by a different aggregate, on purpose:

| Question | Aggregate | Scope |
|---|---|---|
| Who is this, technically? | `User` (`packages/domain/src/user.ts`) | Global — one row per email, Keycloak-verified |
| What did they say their relationship to this work is? | `affiliationType`/`affiliationLabel` on `WorkspaceMembership` (external collaborators) or the existing free-text `affiliation` on `SessionParticipant` (session roster) — never a new `Organisation` tenant row | Contextual, per grant |
| Are they on this session's roster? | `SessionParticipant` | One session |
| Do they belong to this organisation? | `OrganisationMembership` | One organisation |
| Do they belong to this workspace? | `WorkspaceMembership` | One workspace |
| What may they do here? | `RoleAssignment`, scope `{organisation}` or `{workspace}` | Exactly one organisation or one workspace — never both, never global except the narrow `platform` scope (ADR pre-existing, unrelated to product roles) |

### Answers to the questions this ADR must settle

**What is the tenant boundary?** `Organisation`. Every workspace, session, evidence item, and
knowledge entity traces to exactly one organisation (`organisationId`, a real foreign key,
verified application-side per ADR-0003 — not yet PostgreSQL row-level security; that remains a
tracked, deferred defence-in-depth item, enforced today in the application and repository layers
with adversarial tests covering the boundary).

**What is an organisation member?** Someone holding an `OrganisationMembership` in good standing
(`invited` or `active`). Membership alone grants nothing — see `RoleAssignment` below. An
organisation member is not automatically a workspace member, an admin, or anything else; every one
of those is a separate, explicit grant (`PROJECT_CONTEXT.md` §3, "least privilege").

**What is a workspace/programme participant?** This phrase conflates two genuinely different
things, which is exactly why this ADR insists they stay separate:

- A **workspace-scoped collaborator** — anyone holding a `WorkspaceMembership` + `RoleAssignment`
  scoped to that workspace (facilitator, reviewer, steward, contributor, participant, reader,
  admin). This is *authority*: it governs what screens and actions they can reach across the whole
  workspace, every session inside it.
- A **session participant** (`SessionParticipant`) — someone on one session's roster. This is
  *participation*, not authority. It carries no system permissions of its own; a `SessionParticipant`
  row can exist for someone who has never signed in and never will.

A person can be one, the other, or both, and the two are deliberately never merged into a single
row or a single permission check.

**Can someone participate without organisation membership?** Yes, and this was already true before
this ADR: `SessionParticipant.linkedUserId` is optional and independent of `identityMode`
(`packages/domain/src/session-participant.ts`) — a facilitator convening community members who
will never hold an account is the documented, designed-for case.

**Can someone facilitate/review/steward without commissioning-organisation membership?** As of this
ADR, **yes** — this is the change. A `WorkspaceInvitation` (§"What's new", below), once accepted,
creates a `WorkspaceMembership` and workspace-scoped `RoleAssignment` for that person *without* any
`OrganisationMembership` in the commissioning organisation. Their authority exists only inside that
one workspace: they hold no organisation-scoped `RoleAssignment`, so `RoleResolutionService.
tiersForOrganisation` (`services/api-gateway/src/authz/role-resolution.service.ts`) never returns a
tier for them in that organisation — no billing access, no organisation membership administration,
no visibility into any other workspace they were not separately invited to. This is enforced by the
existing `RoleAssignmentScope` type (`{type:'organisation'}` xor `{type:'workspace'}`) and the
existing tier-resolution code, unmodified — the extension is entirely in *how* a workspace
`WorkspaceMembership`/`RoleAssignment` pair may come to exist, not in how either is *read*.

**What does session participation mean?** Exactly what `SessionParticipant` already models:
attendance, identity mode, consent status, and — separately — an `invitationStatus` that tracks
whether *this session's* roster entry was invited/accepted/declined, which is unrelated to (and
predates) the workspace-level `WorkspaceInvitation` this ADR adds. A session has no `RoleAssignment`
scope of its own; "facilitator for this one session only" is expressed as workspace-scoped
authority plus a session-level assignment note in the UI (§Consequences), not a third RBAC scope —
adding one was considered and rejected (see Options).

**What authority exists at organisation scope?** Organisation administration, billing, membership
and role administration, and (new, unrelated to this ADR) domain/SSO administration once built.
Defined in `packages/policy/policy.csv` and `packages/domain/src/role.ts`; unchanged by this ADR.

**What authority exists at workspace scope?** Everything a programme needs day to day: session
management, evidence, review, knowledge stewardship, participant management — the same six
`WitnessRole`s as organisation scope, evaluated independently per workspace. Unchanged by this ADR
except for *how* an external collaborator can come to hold one.

**What authority exists at session scope?** None, structurally — by design, not omission. A
session-scoped RBAC tier was considered (see Options) and rejected: workspace scope is granular
enough for every real access-control need identified so far, and a third scope multiplies the
tier-resolution surface (`RoleResolutionService`) for a distinction (facilitator-for-this-session
only) that a facilitator's own judgement and the existing session-assignment UI already cover
adequately without a new enforcement layer.

**How do anonymous/pseudonymous participants fit?** Unaffected by this ADR. `identityMode` on
`SessionParticipant` is orthogonal to everything above — an anonymous participant never has a
`linkedUserId`, never has a `WorkspaceMembership`, and this ADR's external-collaborator path does
not apply to them at all (they were never blocked by the gap this ADR fixes).

**What is the relationship between identity and authority?** Never direct. Every authority grant
(`RoleAssignment`) requires a `Membership` in good standing at the exact same scope; a `Membership`
never implies a role; a verified identity (`User`, Keycloak) never implies a `Membership`. Three
separate rows, three separate audit trails, three separate things that must each independently be
true — this is the existing pattern (`workspace-membership.ts`'s and `role-assignment.ts`'s own
file headers already say this) and this ADR extends it rather than replacing it.

### What's new: `WorkspaceInvitation` and the external-collaborator grant

A new domain aggregate, `WorkspaceInvitation` (`packages/domain/src/workspace-invitation.ts`) —
named to match the existing `WorkspaceMembership`/`RoleAssignment` convention, *not* called
`ProgrammeInvitation`: "Workspace" stays the internal domain name throughout; "programme" and
"co-design" are UI-facing language only, applied at the presentation layer, per this project's
standing instruction not to rename an established domain concept for vocabulary purity alone.

- Statuses: `pending → accepted | declined | revoked`, and `pending ⇄ expired` (an expired
  invitation can be resent, which reopens it to `pending` with a fresh token — matching
  `SessionParticipant`'s own precedent that `declined`/`cancelled` can be re-invited, unlike the
  terminal `revoked` a `Membership` uses).
- A cryptographically random token (32 bytes, base64url), hashed (SHA-256) before storage — the
  domain layer receives only the hash, generated by the application layer, per ADR-0003 ("the
  domain must not import `node:crypto`"). This is a *new* mechanism, deliberately distinct from
  ADR-0025's organisation-invitation model, which explicitly avoids a bearer token ("email
  possession is not sufficient for authorisation"). The two are not in tension: a
  `WorkspaceInvitation` token identifies *which* invitation a link refers to; it is never, on its
  own, sufficient to accept one. Acceptance still requires the signed-in principal's Keycloak-
  verified email to exactly match `invitedEmail` — the same "verified identity, not email
  possession" principle ADR-0025 states, applied at a second layer.
- No `WorkspaceMembership` or `RoleAssignment` exists until the invitation is *accepted* — unlike
  the existing organisation-invitation flow (`OrganisationInvitationsService.invite`), which
  provisions membership and role at send time. This is a deliberate, more conservative choice for
  external collaborators specifically: nothing about their standing in someone else's workspace
  exists until they have seen the full context (who invited them, which organisation, which
  programme, what role) and explicitly agreed. A bare, `accountState: 'invited'` `User` row is
  still provisioned at send time when the invitee has no existing account — this is a pure identity
  placeholder (it lets Keycloak's existing first-sign-in matching, `AuthenticationService.
  resolveOrLinkIdentity`, work unmodified) and grants no membership or role anywhere.
- Acceptance reads `workspaceId` and `role` *only* from the server-side invitation row, never from
  client input — this is what makes "token for Workspace A cannot access Workspace B" and
  "requested role cannot be tampered with" true by construction, not by an additional check that
  could be forgotten.
- `affiliationType` (`organisation | independent | community | undisclosed`) and an optional free-
  text `affiliationLabel` travel with the invitation and land on the resulting `WorkspaceMembership`
  — contextual metadata only, never resolved against, or used to create, a real `Organisation`
  tenant. "I am participating from the Fiji Teachers Association" stays a label; it never becomes
  "give me administrative authority over an FTA tenant," because no such tenant is ever created or
  looked up from it.

Two new domain functions extend, rather than replace, the existing eligibility rules:
`addExternalWorkspaceCollaborator` (parallels `addWorkspaceMember`, skips the parent-organisation-
membership check, requires a `viaInvitationId` instead) and `assignExternalWorkspaceRole` (parallels
`assignRole`, skips `parentOrganisationMembershipState`, same requirement). The *existing*
`addWorkspaceMember`/`assignRole` functions are unchanged — an organisation admin adding one of
their own colleagues to a workspace still goes through the original, organisation-membership-gated
path exactly as before. `RoleResolutionService`'s read-side tier resolution required no change at
all: it already only checks "does a `WorkspaceMembership` in good standing and a matching
`RoleAssignment` exist for this workspace," never how they came to exist.

## Options considered

**A. Weaken `addWorkspaceMember`/`assignRole` to make the organisation-membership check optional
everywhere.** Rejected — this would silently change behaviour for the internal path too, and make
"can this workspace role imply organisation authority" a runtime flag instead of a structural
impossibility. The two new, additive functions keep the internal path's invariant exactly as strict
as it always was.

**B. Give the external collaborator a synthetic `OrganisationMembership` in the commissioning
organisation, scoped somehow to "read-only, this workspace only."** Rejected — `OrganisationMembership`
has no such scoping concept, and inventing one would make "is this person a member of Organisation
A" — a question billing, SSO, and organisation-admin screens all ask — start returning `true` for
someone who should never appear in an organisation member list. This is exactly the outcome
Principle 4 ("organisation membership does not equal organisation administration," extended here to
"organisation membership does not equal *any* form of organisation standing for a non-member")
forbids.

**C. A third, session-scoped RBAC tier.** Considered for "facilitator for this one workshop only."
Rejected for this phase — no current requirement needs finer granularity than one role per
workspace, and adding a third scope to `RoleAssignmentScope`/`RoleResolutionService` is real,
ongoing complexity for a distinction the UI's existing session-assignment metadata already
communicates without an enforcement change. Revisit if a real customer need for per-session
authority (not just per-session *assignment*, which already exists) is identified.

## Consequences

### Positive

- Organisation A can now genuinely run a multi-organisation co-design programme: a facilitator,
  reviewer, or Knowledge Steward from Organisation B, C, or D holds real, workspace-scoped
  authority without ever appearing as an Organisation A member, on any Organisation A member list,
  or in Organisation A's billing/SSO/audit screens beyond the one workspace they were invited to.
- No parallel ontology: `WorkspaceInvitation` is additive, reuses `MembershipState`-adjacent
  conventions, and the read-side authorization code (`RoleResolutionService`) needed zero changes.
- The four-axis distinction (identity/affiliation/participation/authority) is now written down
  once, ending the risk of a future contributor conflating any two of them.

### Negative

- Two new domain functions (`addExternalWorkspaceCollaborator`, `assignExternalWorkspaceRole`) are
  a second, parallel code path into `WorkspaceMembership`/`RoleAssignment` creation, alongside the
  existing internal one — a maintainer must know both exist. Mitigated by keeping them in the same
  files, with doc comments cross-referencing each other and this ADR.
- `WorkspaceInvitation`'s token mechanism is genuinely new infrastructure (SHA-256 hashing, a
  second invitation delivery email) that ADR-0025 explicitly chose not to build for the
  organisation case — a maintainer needs to understand *why* the two differ (see "What's new"
  above), not assume one is simply outdated.

### Risks accepted

- An external collaborator's affiliation label is free text, not validated against any registry —
  "Fiji Teachers Association" and "FTA" are two different labels for the same real organisation,
  with no deduplication. Accepted deliberately (Option in PART 4 of the originating request:
  "avoid creating duplicate organisation records from spelling variants" is satisfied by *never
  creating a record at all*, which also means never reconciling one).
- Tenant isolation (organisation and workspace boundaries) remains application/repository-layer
  enforced, not PostgreSQL row-level security. Unchanged, pre-existing, tracked risk — this ADR
  does not add to it, since every new query this phase adds is scoped exactly the way existing
  workspace-scoped queries already are.

## Compliance and enforcement

- Existing `role-grants-parity.test.ts` continues to guarantee `ROLE_GRANTS` and `policy.csv` agree
  for every action either declares — unaffected by this ADR, since no new action vocabulary was
  introduced.
- New adversarial coverage (this phase, `*.adversarial.test.ts` and `workspace-invitation.*.test.ts`)
  proves: an accepted external role never resolves an organisation-scoped tier; a token minted for
  one workspace is structurally incapable of granting access to another (the row itself, not a
  runtime check, determines the workspace); resend rotates the token without creating a second
  active grant path; concurrent acceptance of the same token is idempotent, not double-granting.

## Reversal

Stop issuing `WorkspaceInvitation`s (a single feature flag or removing the create endpoint) without
touching any existing grant — every `WorkspaceMembership`/`RoleAssignment` created through this path
is an ordinary row indistinguishable in shape from one created through the internal path, so nothing
downstream needs to change to stop the flow. Already-granted external authority is unaffected by
reversal and would need explicit removal, exactly like removing an internal member's access — an
intentional symmetry, not an oversight.

## References

- [`architecture/DATA_MODEL.md`](../DATA_MODEL.md) (rewritten alongside this ADR to describe this
  same model)
- [ADR-0003](ADR-0003-hexagonal-ddd-clean-architecture.md) ·
  [ADR-0013](ADR-0013-tenancy-and-deployment-topology.md) ·
  [ADR-0025](ADR-0025-controlled-invitation-notifications.md) ·
  [ADR-0026](ADR-0026-evidence-knowledge-graph-implementation.md)
- 2026-09-22 Witness Productisation Readiness Assessment (this phase's originating audit)
