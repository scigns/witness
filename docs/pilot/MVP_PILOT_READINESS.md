# MVP Pilot Readiness

**Status:** Active
**Owner:** Founder / Product Lead with Engineering and QA

**Date:** 2026-08-09
**Scope:** the human-led MVP — Milestones 1–8, `Sign in → Organisation / Workspace → Session →
Participants → Consent → Evidence → Review → Decisions / Commitments / Actions → Report → Export`
**Verdict:** see the end of this document.

## Why this document exists

Every milestone since Milestone 2 shipped with the same two admissions: the migration was
hand-authored and validated but never applied to a live database, and the screens were built but
never opened. This gate exists to close those, and it did — for the database. What follows
distinguishes carefully between what was *executed* and what was *reasoned about*, because a
readiness document that blurs the two is worse than none.

## Environment actually tested

| Component | Status |
|---|---|
| PostgreSQL | **16.13, live**, initialised empty for this run |
| API gateway | **running**, compiled build, development profile, against that database |
| Web application | **not run** — see Limitations |
| Browser | **not available** in this sandbox |
| Docker | binary present, **daemon not running**; Postgres was run directly instead |
| Keycloak | **not run** — the development identity double was used |
| Neo4j / OpenSearch | **not run** — not required by the MVP |

## Database — verified against live Postgres

- **All 14 migrations apply cleanly from an empty database.** This is the first time that has been
  executed. Result: 29 tables, 93 foreign keys, 46 check constraints, 3 partial unique indexes.
- **Constraints reject what they are supposed to reject.** Directly exercised, each rejected:
  a superseded decision with no replacement; a reversed decision with no reason; an action with
  `percent_complete` outside 0–100; a blocked action with no reason; an `outcome_support` row
  claiming both institutional synthesis and evidence; a report `approved` with no approver; a
  revision 1 claiming to supersede something.
- **The partial unique indexes work.** A second active reviewer assignment on the same evidence was
  refused with `REVIEW_ALREADY_ASSIGNED`; citing the same evidence twice on one outcome was refused
  with `SUPPORT_ALREADY_RECORDED`. Both had been written in earlier milestones and never exercised.
- **Optimistic concurrency works.** A stale `expectedVersion` was refused with `STALE_VERSION` and
  nothing was persisted.
- **Audit chains survive the whole workflow.** Every transition appended to its subject's chain;
  the report's history shows creation, submission, change request, resubmission, approval,
  publication and five separate exports.

## Functional walkthrough — 118 checks, all passing

Driven by `scripts/pilot/walkthrough.mjs` entirely over HTTP, as four different principals. **No
step touches the database.** Every record was created through the same endpoints the web
application calls, which is the evidence that a facilitator does not need SQL, a fixture loader or
a developer for the normal workflow.

| Area | Checks | Result |
|---|---|---|
| Environment | 2 | pass |
| Organisation, workspace, users | 6 | pass |
| Session lifecycle | 3 | pass |
| Participants (named, pseudonymous, anonymous) | 3 | pass |
| Consent (template → configuration → capture → withdrawal) | 10 | pass |
| Evidence capture | 5 | pass |
| Review (assign, begin, validate, reject) | 15 | pass |
| Outcomes (decisions, commitments, actions) | 19 | pass |
| Reporting (draft → review → approve → publish) | 15 | pass |
| Redaction | 10 | pass |
| Export (HTML, Markdown, JSON, CSV) | 21 | pass |
| Isolation and authorisation | 9 | pass |

Reproduce with a live database and a running API:

```bash
node scripts/pilot/walkthrough.mjs http://localhost:3001
```

The script creates its own organisation, workspace, users, participants and consent on each run,
so it is reproducible without a separate seed step and leaves earlier runs untouched.

## Defects found and fixed in this gate

Three, all found only because this was the first live run. All three are fixed on this branch with
the fix in the same commit as its evidence.

1. **Consent has been unusable against real Postgres since Milestone 4.** `audit_event.subject_type`
   was `VARCHAR(24)`. Two subject types exceed it — `session_consent_configuration` (29) and
   `participant_consent_record` (26) — so configuring a session's consent and capturing a
   participant's consent both failed at the audit write, and because the audit event is appended
   inside the same transaction as the record, the entire operation rolled back. No test caught it:
   the service tests use an in-memory Prisma double, which has no column widths. Fixed by widening
   the column to `VARCHAR(64)`.

2. **The API could not start outside a container.** `PolicyEnforcementService` imported
   `AuthorizationPort` — its own Nest injection token — with `import type`, which TypeScript erases.
   The compiled output emitted `Function` for `design:paramtypes`, and Nest could not resolve the
   dependency, so the application failed to boot. The unit tests did not catch it because they
   construct the service directly rather than through the container. Fixed by importing the token
   as a value.

3. **The two authorisation tables disagreed.** `packages/policy/policy.csv` granted `report:export`
   to the reader tier; `role-grants.ts` did not. The dev-header path reads one table and the
   session-backed path reads the other, so the same role would have been allowed to export a
   published report on one path and refused on the other. Fixed by adding the grant to
   `role-grants.ts`.

## Security and privacy — verified live

- **Cross-workspace access is refused.** A session, a piece of evidence and a report were each
  requested through a *different* workspace belonging to a *different* organisation. All returned
  404 — not 403, so the response does not confirm the record exists.
- **Reader tier cannot mutate.** Capturing evidence, proposing a decision, creating a report and
  approving a report were each attempted as a reader. All 403.
- **Unauthenticated requests are refused** — 401.
- **Contributor cannot approve their own work.** Confirming a decision and approving a report were
  each attempted as a contributor. Both 403; both succeeded as a reviewer. Segregation of duties
  holds on the live authorisation path, not just in the policy file.
- **Anonymous identity does not leak.** The anonymous participant's stored display name appears in
  none of the four export formats, nor in the rendered report, nor in the participant summary.
- **Evidence cannot be laundered through outcomes.** Citing draft evidence and citing rejected
  evidence as the basis for a decision were both refused with `EVIDENCE_NOT_VALIDATED`. Confirming
  a decision with no basis at all was refused with `OUTCOME_NOT_SUPPORTED`.
- **An authoritative outcome cannot be quietly emptied.** Removing the last basis from a confirmed
  decision was refused with `OUTCOME_SUPPORT_REQUIRED`.
- **Consent governs the report, per audience.** The pseudonymous participant consented to internal
  use but refused publication. Their evidence appears in the internal report and is *absent* from
  the public one, which reports a withheld count rather than pretending to be complete.
- **Quotation is a separate permission from appearance.** The anonymous participant consented to
  participate but not to be quoted. Their finding is listed with no content, and the `content` field
  is structurally absent rather than empty.
- **Withdrawal reaches an already-published report.** A participant withdrew consent *after* the
  report was approved and published. The next render omitted their evidence. Consent is evaluated
  at render time, and this confirms it end to end.
- **Exports are server-authoritative.** All four formats were produced by a reader, all served as
  attachments, none containing withheld content, and every one recorded in the report's audit
  history with its format.

## Accessibility and usability

**Not verified in a browser.** No browser is available in this sandbox, so the following is a code
review rather than an observation, and should be treated as such:

- Every form control has an associated `<label>`; required fields carry both a visual asterisk and
  a screen-reader-only `(required)`.
- Status is never colour-only — every badge carries text.
- Lifecycle controls are rendered from server-computed `permittedActions`, so a user is not offered
  an action the server will refuse, and controls requiring a reason stay disabled until it is
  supplied.
- Errors are surfaced in `ErrorNotice` regions with the server's own message rather than a generic
  failure.
- Withheld content is stated in words rather than left as a gap.

**This is the largest remaining gap and it is a real one.** Keyboard traversal, focus order, screen
reader output and colour contrast have not been observed.

## Limitations

1. **No browser walkthrough.** The web application was not started and no screen was opened. The
   API surface beneath every screen is verified; the screens themselves are not.
2. **No accessibility verification.** As above.
3. **No real authentication.** The development identity double was used. Keycloak (ADR-0007) is
   Phase 2 and was not exercised. The `X-Witness-Dev-User` header is unverified by design and the
   application refuses to enable that path outside the development profile.
4. **Docker was not used.** The daemon is unavailable in this sandbox, so Postgres was run directly.
   The compose stack itself is therefore still unverified.
5. **PDF export does not exist.** Deliberate: HTML prints.
6. **No per-session facilitator ownership check.** Any contributor in a workspace may act on any
   session there. Named in every milestone since Milestone 2; unchanged.
7. **Reviewer self-assignment is possible.** A reviewer can assign themselves and then validate.
   Audited, and named in Milestone 6; unchanged.
8. **Single-node only.** No load, failover or backup testing.

## Known external integrations not verified

Keycloak, Neo4j, OpenSearch, object storage, and any outbound egress. None is required by the
human-led MVP; all are Phase 2 or later.

## Recommendation

The workflow this MVP exists to support has now been executed end to end against a real database,
including the refusals that make it trustworthy. The three defects that live execution exposed were
each capable of stopping a pilot — one of them had silently broken consent capture for four
milestones — and each is fixed and re-verified.

What is not verified is the browser: the screens, the keyboard, the screen reader. That is enough
to hold back an external pilot with members of the public, where an inaccessible form is a barrier
to the very people the product exists to hear. It is not enough to hold back an internal pilot with
staff who can report a broken screen and whose consent can be re-taken.

**READY FOR CONTROLLED INTERNAL PILOT**

Before an external pilot, in this order:

1. A browser walkthrough of the full flow, including keyboard-only traversal and a screen reader.
2. Keycloak wired up, replacing the development identity double.
3. The compose stack verified with a working Docker daemon.
4. A decision on per-session facilitator ownership and on reviewer self-assignment — both are
   accepted gaps for internal use and both are harder to accept once the public is in the room.
