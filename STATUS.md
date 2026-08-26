# Status

**Last updated:** 2026-08-26 (Commercial Foundation C2)
**Updated by:** Engineering
**Update rule:** every pull request that changes the state of a workstream updates this file.
Staleness here is a defect — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Executive summary

Witness has moved beyond the original Developer Preview and is now operating
as a **controlled institutional-pilot product**.

The currently deployed build on `main` provides the human-led institutional
memory workflow end to end:

organisation → program → session → participants → consent → evidence →
human review → decisions/commitments/actions → summary → reports/exports →
audit/provenance.

Production is authenticated through Keycloak, organisation/program scoped,
consent-aware, backed by PostgreSQL and Cloudflare R2-compatible object
storage, and uses local transcription/inference paths with external inference
disabled in the current production profile.

The current product focus is no longer proving that the workflow can be
built. It is learning whether institutions can configure, facilitate and
repeat useful pilots with limited developer intervention.

**Overall health:** 🟢 Controlled pilot release candidate
**Current platform release:** 0.3.0 preparation
**Production main:** deployed from merge commit `8534751`
**Primary company objective:** first paid institutional customer.
**Second company objective:** first renewing institutional customer.

Important boundaries remain explicit:

- Fijian/iTaukei machine transcription is not authoritative.
- Sensitive institutional attachments require a deployment-specific
  readiness decision and storage-protection/recovery controls.
- Database-level row-level security remains future defence-in-depth;
  organisation/program isolation is currently enforced in the application
  and repository layers.
- Knowledge-graph projection, speaker diarisation and hybrid/vector search
  remain future capabilities.
- Witness does not claim to provide an institution's legal basis or legal
  compliance merely by selecting an institutional profile.

---

## Delivery status

The original Phase 1–8 roadmap remains the long-term architecture sequence.
Implementation has intentionally delivered a controlled human-led MVP ahead
of several formal roadmap phase exits. Therefore a phase not marked complete
does **not** mean that every capability described within it is absent.

| Area                                      | Current state                              |
| ----------------------------------------- | ------------------------------------------ |
| Engineering organisation                  | 🟢 Established                             |
| Human-led institutional-memory workflow   | 🟢 Delivered                               |
| Authentication and role-aware access      | 🟢 Delivered for controlled pilot          |
| Organisation/program isolation            | 🟢 Application/repository enforced         |
| Consent lifecycle and evidence gates      | 🟢 Delivered for supported pilot workflows |
| Evidence review and provenance            | 🟢 Delivered                               |
| Decisions, commitments and actions        | 🟢 Delivered                               |
| Session summary, reports and exports      | 🟢 Delivered                               |
| Browser audio/document capture            | 🟢 Delivered                               |
| Local transcription and local AI drafting | 🟢 Delivered with stated limitations       |
| Client-ready web experience               | 🟢 Delivered                               |
| Repeatable institutional pilot operations | 🟢 Delivered in 0.3.0                      |
| Knowledge graph projection                | ⚪ Deferred                                |
| Hybrid/vector search                      | ⚪ Deferred                                |
| Speaker diarisation                       | ⚪ Deferred                                |
| Database-level RLS defence-in-depth       | ⚪ Deferred                                |
| General-availability / v1.0 hardening     | ⚪ Not complete                            |
| Commercial domain foundation (C1)         | 🟢 Implemented and validated               |
| Pricing and self-service upgrade UX (C2)  | 🟢 Implemented and validated               |

---

## Commercial foundation

Milestone C1 is implemented. Witness now owns a provider-independent commercial catalogue and
customer subscription state in PostgreSQL. The additive migration seeds FREE, TEAM, ORGANISATION,
and INSTITUTIONAL plans with AUD monthly/yearly prices where applicable, 16 typed entitlement
definitions, plan grants, billing accounts, subscriptions, and subscription entitlement overrides.

Every existing organisation is backfilled with a FREE subscription by migration. Both new
organisation provisioning paths create a billing account and FREE subscription atomically; normal
application provisioning also records `subscription.created` in the existing hash-chained audit log.
The application loads organisation-scoped commercial state and delegates override precedence and
fail-closed entitlement evaluation to the pure domain layer. No payment provider or SDK is present.

Validation completed on 2026-08-25:

- `pnpm verify`: format, lint, typecheck, 1,102 package tests, API/web production builds passed;
- invariant suite: 20 passed; adversarial suite: 30 passed;
- documentation lint: 215 files, zero issues;
- Prisma schema validation/client generation passed;
- all 27 migrations applied to a fresh temporary PostgreSQL 17 database; four plans and 16
  entitlement definitions verified.

The documentation link checker is expected to pass once the new linked files are Git-tracked. This
workspace exposes `.git` read-only, so its precondition could not be satisfied here; direct file/link
inspection found both targets present. The execution environment used Node 24.1.0 while the project
declares Node 22, so release CI must repeat validation on the supported runtime.

Milestone C2 adds a public catalogue-backed pricing route and an organisation-admin billing overview
with current commercial state, resolved entitlements, operational usage, and explicit plan,
frequency, and payment-method choices. Upgrade, downgrade, and cancellation submissions are stored
as audited, idempotent pending intent and never activate paid access or imply settlement.

C2 validation completed on 2026-08-26: formatting, lint, typecheck, 1,120 package tests, API/web
production builds, documentation lint/link checks, Prisma schema validation, and diff integrity all
passed. Validation ran under Node 24.1.0 while the repository declares Node 22; release CI must repeat
the gates on the supported runtime.

The Board has approved the commercialisation programme with two explicit revenue gates. Revenue Gate
A permits an externally administered controlled pilot before C3: approved supplier, legal/tax and
procurement processes remain outside Witness, and the product makes no invoice, processing,
reconciliation or automatic-activation claim. Revenue Gate B requires C3's Witness-native
invoice-to-entitlement lifecycle with exactly-once and security evidence. The programme pack,
governance and 90-day dashboard are indexed at [`docs/commercial/README.md`](docs/commercial/README.md).
C3 remains the immediate engineering priority; C4 provider implementation is demand-gated by real
customer evidence.

---

## Workstream status

| Workstream      | Owner                | State | Current position                                                                                            |
| --------------- | -------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| Architecture    | Principal Architect  | 🟡    | Long-term phase architecture remains active; production boundaries are documented                           |
| Research        | Research Lead        | 🟡    | Language/ASR validation and pilot evidence remain active                                                    |
| Documentation   | Documentation Lead   | 🟢    | Pilot readiness, launch and facilitator material now operational                                            |
| Product         | Product Director     | 🟢    | Human-led MVP and repeatable pilot productisation delivered                                                 |
| UX design       | UX Lead              | 🟡    | Client-ready workflow delivered; field usability evidence still required                                    |
| Governance      | Governance Lead      | 🟡    | Consent controls implemented; external Indigenous/legal governance review remains required where applicable |
| Security        | Security Lead        | 🟡    | Keycloak, deny-by-default authorisation and adversarial checks active; further hardening remains            |
| Infrastructure  | Infrastructure Lead  | 🟡    | Production deployment, backup and object storage operational; broader HA/DR remains future work             |
| Backend         | Backend Lead         | 🟢    | Human-led MVP services and pilot metrics delivered                                                          |
| Knowledge graph | Knowledge Graph Lead | ⚪    | Projection remains deferred                                                                                 |
| AI platform     | AI Lead              | 🟡    | Local transcription/AI drafting available; evaluation and diarisation remain incomplete                     |
| Frontend        | Frontend Lead        | 🟢    | Client-ready program/session experience deployed                                                            |
| Testing         | QA Lead              | 🟢    | Unit, contract, invariant, adversarial and CI gates active                                                  |
| Release         | Release Manager      | 🟢    | 0.3.0 release preparation underway                                                                          |

---

## What changed recently

### 2026-08-09 — Session Summary, Reporting and Export delivered (Milestone 8), PR open

- **The last capability of the human-led MVP.** A session now becomes a report an authorised person
  can write, submit, have reviewed, approve, publish and take away — with every claim traceable and
  every copy redacted by the server.
- **A report references; it does not copy.** The narrative sections are the author's own words and
  live on the aggregate. Everything else — evidence, decisions, commitments, actions — is cited
  through `ReportSource` and composed at render time. That is a privacy decision before an
  architectural one: a second copy of participant-derived content would sit outside the consent and
  redaction boundaries Milestones 4 and 5 built, and a later withdrawal of consent would have to
  chase it. Referencing means there is only ever one copy to redact.
- **Traceability freezes, redaction does not.** `ReportSource` records the version each cited record
  held at inclusion, so a reader can be told the evidence behind a paragraph has been corrected since
  the report cited it. Consent, by contrast, is evaluated at _render_ time — a participant who
  withdraws after a report is approved disappears from the next copy of it, which a rule frozen at
  approval would not achieve.
- **`report-composition.ts` is the redaction rule, and it is pure.** Every export format goes through
  the same call, so HTML, Markdown, JSON and CSV cannot disagree about what a participant agreed to.
  Appearing, being quoted and being named are three separate permissions: withdrawn or
  audience-refused consent removes a record entirely; refused quotation keeps the finding and
  withholds the content, _structurally absent_ rather than blanked, so a template cannot render a
  redaction as though it were silence; attributed evidence without attributed-quotation consent falls
  back to anonymous rather than vanishing, because losing the finding would distort the record in the
  other direction.
- **Participants are summarised by count and never listed.** In a session of six, a list of five
  names plus a total of six identifies the sixth. Withdrawn participants stay in the total for the
  same reason — a count that dropped by one between revisions would say who left.
- **What a report may draw on is a domain rule, not a query filter.** Only validated evidence,
  confirmed or superseded decisions, and active or fulfilled commitments are admissible; actions are
  admissible in every state, because an honest account of what an institution did includes what it
  stopped. Cross-session, cross-workspace and cross-organisation records are refused by name.
- **An approved report is never edited.** Revising produces a new report at the next revision,
  carrying its citations forward and pointing back at what it supersedes, so a reader who saw
  revision 1 can still find exactly what they saw.
- **Authorisation splits along the same seam once more.** Contributors write and submit; reviewers
  approve and publish; the two sets do not overlap, so a contributor cannot approve their own report
  and a reviewer cannot write the one they approve. `report:read` and `report:export` reach reader
  tier — a published report is meant to be taken away, and export redaction is server-side either
  way.
- **Exports are hostile-input aware.** CSV prefixes fields beginning `=`, `+`, `-` or `@`, because a
  participant quotation starting with a dash would otherwise be executed by a spreadsheet rather than
  displayed; HTML escapes; and every export is served as an attachment rather than rendered inline in
  the application's own origin.
- **Same standing constraint.** The migration is hand-authored and validated with `prisma validate`
  and `prisma generate` only — no Postgres or Docker in this sandbox — and no browser walkthrough was
  performed. Closing both gaps is the MVP pilot-readiness gate's first job.

### 2026-08-08 — Decisions, Commitments and Actions delivered (BUILD_ROADMAP.md Milestone 7), PR open

- **Sixth capability in the "WITNESS — COMPLETE THE HUMAN-LED MVP" sequence.** Milestone 6 made
  evidence validated; this milestone is what validation is _for_. A session now produces three
  registers — decisions, commitments and actions — and each of the first two has to answer "on what
  basis?" before it counts as institutional record.
- **`outcome-support.ts` is the load-bearing module.** There are exactly two admissible bases, and
  the distinction is the point: `validated_evidence` (something a reviewer examined and validated)
  or `institutional_synthesis` (the institution's own judgement, with a _mandatory_ rationale —
  an outcome with neither evidence nor stated reasoning is indistinguishable from one somebody made
  up). Everything else is refused by name rather than by a catch-all: evidence that is `draft`,
  `submitted`, `under_review`, `needs_clarification`, `rejected` or `withdrawn` has not been
  validated by anyone; evidence marked `disputed` was examined and doubted; cross-workspace and
  cross-organisation evidence is refused for the same reason `evidence-link.ts` refuses it.
- **The evidence link freezes what was relied on.** `OutcomeSupport` records the evidence id, the
  _version_ that was validated, and the verification status at link time. A later correction bumps
  the evidence's own version and leaves the support record alone, so "what did we actually rely on"
  survives the correction rather than being silently rewritten by it.
- **"Confirmed with nothing behind it" is not representable.** `confirmDecision` and
  `activateCommitment` call `assertSupported` before they will return a confirmed aggregate, and the
  service loads the support records **inside the transaction that writes the confirmation** — an
  outcome is unauthoritative right up until that moment, so its basis may legitimately be removed
  concurrently, and a count read earlier would leave a window. `OutcomeSupportService.remove` closes
  the other side of the same window by refusing to detach the last basis from an outcome that is
  already authoritative.
- **Three new domain aggregates** (`packages/domain/src`): `Decision`
  (`proposed`/`confirmed`/`superseded`/`reversed` — `superseded` and `reversed` stay distinct
  because superseding means the decision was right and has moved on while reversing means it was
  wrong, and collapsing them would destroy the only signal telling an institution its decisions are
  unstable), `Commitment` (`proposed`/`active`/`fulfilled`/`withdrawn`/`superseded`) and
  `ActionItem` (`open`/`in_progress`/`blocked`/`completed`/`cancelled`, with a priority and an
  advisory percentage). One mutator per legal transition throughout, the same structural approach
  Milestones 5 and 6 used.
- **`ActionItem` deliberately does not require support.** An action is _how_ an institution carries
  out a decision, not an institutional claim in its own right. Requiring a basis for "book the
  surveyor" would make the requirement ceremonial, and a ceremonial requirement is one people learn
  to satisfy without meaning it.
- **Ownership is two-part and never a participant.** `ownerDescription` is required plain language,
  because the owner of a commitment is usually a team, a service or a named post rather than a
  Witness account holder; `ownerUserId` is optional and, when given, must be a member in good
  standing of the outcome's own organisation — the same org-scoped check
  `SessionsService.requireFacilitator` applies. Recording a session _participant_ as an owner would
  defeat Milestone 4's anonymity guarantees, so no field allows it.
- **Authorisation reuses Milestone 6's institutional split rather than inventing one.** Seven new
  `outcome:*` actions: `read`/`create`/`update`/`transition`/`link_support` are contributor-tier
  (proposing decisions, drafting commitments, running actions through start/progress/block/complete
  — the ordinary work of writing up what a session produced), while `confirm` (confirming a
  decision, activating a commitment) and `close` (superseding, reversing, withdrawing) are
  reviewer-tier, because those are the moments an outcome becomes — or stops being — institutional
  record. There is no `outcome:manage_restricted`: an outcome carries no restricted participant
  identity by construction.
- **Database.** `decision`, `commitment`, `action_item` and `outcome_support` tables with real
  foreign keys, org/workspace/session scope columns, and CHECK constraints mirroring each domain
  rule — including that a superseded decision must name its replacement, a reversal must state its
  reason, a blocked action must say what is blocking it, and each support basis carries its own
  obligations. A partial unique index stops one outcome counting the same evidence twice; synthesis
  rows are exempt, since an outcome may rest on more than one line of reasoning. `outcome_support`
  references evidence with `RESTRICT`, not `CASCADE` — evidence is withdrawn rather than deleted
  precisely so that what an outcome relied on stays readable.
- **Frontend.** One outcomes screen carrying all three registers, because they are read as one
  question, and one detail page serving all three. Lifecycle buttons come from the server's
  `permittedActions`, so the client never reimplements the state machine. The evidence picker lists
  only validated evidence: the API refuses the rest by name, but a picker that offers rejected
  evidence and then fails on submit teaches people the rule is arbitrary rather than meaningful.
  Support counts appear on every row _including zero_ — an outcome resting on nothing is exactly
  what a reader scanning a register needs to notice.
- **Audit.** Twenty-two new actions on the existing hash-chained trail, and four new subject types
  (`decision`, `commitment`, `action_item`, `outcome_support`), each getting its own chain.
- **Same standing constraint.** The migration is hand-authored and validated with `prisma validate`
  and `prisma generate` only — no Postgres or Docker in this sandbox, so it has not been applied to
  a live database, and no browser walkthrough was performed.

### 2026-08-06 — Evidence Review and Validation delivered (BUILD_ROADMAP.md Milestone 6), PR open

- **Fifth capability in the "WITNESS — COMPLETE THE HUMAN-LED MVP" sequence.** With Structured Live
  Evidence Capture merged (PR #29), evidence captured during a session now goes through a
  human-controlled review before it counts as validated institutional knowledge. The distinction
  this milestone exists to preserve: what a participant said, what a facilitator recorded, what a
  reviewer validated, rejected, or still needs clarified — none of those collapse into each other.
- **Extends, does not replace, Milestone 5's `Evidence` aggregate.** `EVIDENCE_REVIEW_STATUSES` and
  `EVIDENCE_VERIFICATION_STATUSES` already declared their full seven/three-state vocabularies in
  Milestone 5; this milestone adds the mutators that make `under_review`/`needs_clarification`/
  `validated`/`rejected` and `verified`/`disputed` reachable — `beginReview`,
  `markNeedsClarification`, `resumeReviewAfterClarification`, `validateEvidence`, `rejectEvidence`,
  each gating on one specific starting `reviewStatus` so every explicitly-forbidden transition
  (Draft→Validated, Submitted→Validated, Draft→Under-Review without submission, Rejected→Validated,
  Withdrawn→any active review state) is structurally unreachable — no function accepts it as a
  starting state, not a runtime check preventing it.
- **Two new domain aggregates** (`packages/domain/src`): `ReviewAssignment` (who is reviewing a
  piece of evidence and where that review stands — `assigned`/`in_progress`/`completed`/
  `cancelled`/`reassigned`; the MVP supports exactly one _active_ assignment per evidence, enforced
  by the service layer plus a partial unique database index as the last line of defence, since the
  domain layer cannot read the database to check it itself) and `Clarification` (a reviewer's
  question and its answer — `open`/`answered`/`withdrawn`/`closed` — never exposing a restricted
  participant identity, since it only ever carries `Actor`s, never a `SessionParticipant`).
  Reassignment and cancellation both close the existing row (`status` changes) rather than deleting
  it — the same non-destructive-history philosophy every prior aggregate's withdrawal/supersession
  pattern already established.
- **Correction is structurally distinct from a review decision.** `correctEvidence` — a clerical
  fix, an incorporated clarification, a facilitator's interpretive gloss, or a substantive content
  change, each labelled by `correctionType` and always requiring a `reason` — is permitted only for
  `submitted`/`under_review`/`needs_clarification` evidence and never writes to `reviewStatus` at
  all: the field is simply absent from its output-object overrides, so "a correction cannot silently
  validate evidence" is enforced by the absence of a code path, not a guard. Attribution-changing
  corrections rerun the same domain-level compatibility check `updateEvidenceDraft` uses; the
  consent half of that check is the service layer's job, matching every other consent-adjacent
  mutation in this package.
- **Verification status is the "claim about truth" axis; review status is the "workflow position"
  axis — kept genuinely separate.** `validateEvidence` is the only function that ever sets
  `verificationStatus: 'verified'`; `rejectEvidence` is the only one that ever sets `'disputed'`.
  Validation reason is optional; rejection reason is required — an unexplained rejection gives
  whoever captured the evidence nothing to act on.
- **Two authorisation layers on every review-lifecycle write, not one.** The Casbin scope-tier
  boundary (new `evidence_review:list/read/assign/reassign/start/clarify/respond/correct/validate/
reject/view_history/manage_restricted` actions, `reader`/`contributor`/`reviewer`/`admin` tiers)
  answers "does this role hold the action at all, in this workspace"; `EvidenceReviewService`
  additionally checks the caller is the specific reviewer holding the active `ReviewAssignment` for
  _this_ evidence before `begin_review`/`validate`/`reject`/clarification actions succeed — a role
  grant alone is not enough, since the milestone's authorisation matrix explicitly rejects
  "validation by an unauthorised reviewer" even when that reviewer's role would otherwise permit the
  Casbin action generally. A caller holding `evidence_review:manage_restricted` (admin tier)
  overrides the per-reviewer check, the same "restricted tier can override" precedent
  `evidence:manage_restricted` already established.
- **Clarification requests and closures are atomic cross-aggregate transactions.** Requesting a
  clarification moves `Evidence` to `needs_clarification` and creates the `Clarification` row in one
  transaction; closing an answered clarification moves `Evidence` back to `under_review` and closes
  the `Clarification` row in the other — the same `SessionConsentConfigurationService.configure`
  precedent (new row + related-aggregate-state-update, one transaction) used again here for a second
  pairing.
- **API**: nested under the existing `/evidence/:evidenceId` path —
  `review/assignment` (get/assign/reassign/cancel), `review/actions` (begin_review/resume_review/
  validate/reject), `review/correction`, and `review/clarifications` (list/request/respond/withdraw/
  close). `EvidenceDetail` gained `permittedReviewActions` (server-computed, state-derived — the
  frontend never reimplements the review state machine), `canCorrect`, and `reviewDecisionReason`.
- **Frontend**: the evidence detail page gained a Review section — reviewer assignment/reassignment,
  begin/validate/reject controls (rendered only from server-computed `permittedReviewActions`),
  a correction editor, and a clarification thread (ask/respond/withdraw/close) — all reusing the
  existing `EvidenceReviewStatusBadge` (already visually distinguishing all seven states since
  Milestone 5) rather than inventing a second status indicator. The evidence list's status filter
  gained the four review states the filter previously had no options for.
- **Known limitations, named rather than hidden:** no live Postgres or Docker was available in this
  sandbox, so the migration is hand-authored SQL (validated via `prisma validate`/`generate`, not
  applied against a live database) and the full workflow could not be walked through in a browser —
  same constraint every prior milestone was built under. There is no per-session "assigned
  facilitator" ownership check, the same named gap every prior milestone carries. The frontend's
  review section loads and fails silently on `403` (no `evidence_review:read`) rather than showing a
  distinct forbidden state for that specific section — a caller without evidence access at all still
  sees the page's own top-level forbidden state, this only affects the finer-grained case. Decisions,
  Commitments, and Actions (Milestone 7) and Session Summary, Reporting, and Export (Milestone 8) do
  not exist yet.
- **Verification:** `pnpm verify` (format, lint, typecheck, 701 tests across all packages — 321
  domain (up from 266 — includes new `evidence-review.test.ts`, `review-assignment.test.ts`,
  `clarification.test.ts`), 343 API-gateway (up from 321 — includes 19 new `EvidenceReviewService`
  tests), 12 contracts, 25 config — build) all green. `scripts/ci/check-domain-purity.sh` and
  `docs:lint` pass. No live Postgres/browser in this sandbox — manual verification is reproducible
  steps only, not an executed walkthrough.

### 2026-08-04 — Structured Live Evidence Capture delivered (BUILD_ROADMAP.md Milestone 5), PR open

- **Fourth capability in the "WITNESS — COMPLETE THE REMAINING HUMAN-LED MVP" sequence.** With
  Consent Management merged (PR #28), authorised facilitators, note-takers and configured
  participants can now capture structured evidence — observations, quotes, ideas, concerns, needs,
  barriers, and fourteen other suggested types — during an open co-design session. This is
  human-led capture only: no transcription, no summarisation, no semantic search, no generative AI.
  Those are explicit non-goals for this milestone, not gaps.
- **Two domain aggregates** (`packages/domain/src`): `Evidence` (structured content plus the
  privacy-critical `attributionMode` — `attributed`/`pseudonymous`/`anonymous`/
  `facilitator_observation`/`institutional_source`/`unattributed` — and a `consentBasis` snapshot of
  which consent categories were checked and allowed at capture time) and `EvidenceLink` (typed
  relationships — `supports`/`contradicts`/`clarifies`/`duplicates`/`follows_from`/`related_to` —
  between two pieces of evidence in the same session; the one aggregate in this milestone with a
  genuine delete, since a mistaken link is noise, not history, unlike evidence content itself).
  `Evidence` stores the full seven-state review vocabulary from the start
  (`draft`/`submitted`/`under_review`/`needs_clarification`/`validated`/`rejected`/`withdrawn`) but
  this milestone's mutators only reach three of them — `under_review`/`needs_clarification`/
  `validated`/`rejected` are unreachable from this module by construction, not by a runtime guard,
  the same "declare the vocabulary, withhold the mutator" pattern Milestone 4 used for
  `ConsentTemplate` immutability.
- **First real consumer of `ConsentPolicyService`.** Every participant-backed capture calls the
  existing consent decision boundary (built, but unused, in Milestone 4) rather than duplicating its
  logic: `mayParticipate` gates every participant-backed capture, and quotation evidence
  additionally needs `mayAttributeQuotation`/`mayQuoteAnonymously` depending on attribution mode. A
  refused or missing consent answer fails closed with `403 CONSENT_NOT_GRANTED` before the domain
  layer is ever called — a consent failure is a request that should never have reached the domain,
  not a stored invariant violation.
- **Attribution compatibility is enforced twice, deliberately.** The domain layer
  (`assertAttributionCompatibility`) enforces everything knowable without a database read: a
  sourceless mode can never carry a participant reference and vice versa, an anonymous participant's
  evidence can only be anonymous, a pseudonymous participant's evidence can never be attributed to
  their real identity, and a `facilitator_note` can never be participant-backed at all. The service
  layer's consent check above is the other half — neither substitutes for the other.
- **Session lifecycle rules**: capture requires the session to be `open`; submitting a draft is
  permitted while `open` or `closed` (a facilitator routinely files the last drafts after the room
  empties); withdrawal is permitted in every status except `archived`. Withdrawal is a controlled
  retraction, never destructive deletion — the row and its history remain, mirroring
  `ParticipantConsentRecord`'s own withdrawal asymmetry, including the deliberate absence of a
  restore function.
- **Privacy projection**: `sourceParticipantId` is present on the wire only when `attributionMode` is
  `attributed` — structurally absent, not merely redacted, for `pseudonymous`/`anonymous` evidence,
  the same "absent means absent" convention every prior milestone's restricted fields use.
  `consentBasis` and `withdrawalReason` require `evidence:manage_restricted`.
- **Authorisation reuses the existing Casbin scope-tier boundary**: `evidence:*`/`evidence_link:*`
  follow `session:*`/`participant_consent:*` exactly (contributor/admin write access, reader through
  admin can read, no per-session ownership check) — reviewer also gets read access, ahead of
  Milestone 6 (Evidence Review and Validation) needing it.
- **API**: `evidence` (capture/list/get/history/update-draft/submit/withdraw, session-scoped) and
  nested evidence links (list/create/remove), with duplicate-link rejection checked in the service
  layer (a database read the domain layer may not perform) and backed by a database unique
  constraint as the last line of defence.
- **Frontend**: a session evidence feed at `/workspaces/:id/sessions/:sessionId/evidence` with an
  inline quick-capture form (type, attribution, source participant when applicable, title, content)
  built for capture-while-facilitating rather than a long form; an evidence detail page with full
  draft editing, submit/withdraw controls, related-evidence linking, and history — linked from the
  session detail page alongside Participants and Consent.
- **Known limitations, named rather than hidden:** no live Postgres or Docker was available in this
  sandbox, so the migration is hand-authored SQL (validated via `prisma validate`/`generate`, not
  applied against a live database) and the full workflow could not be walked through in a browser —
  same constraint every prior milestone was built under. Evidence Review (validating, disputing, or
  moving evidence through `under_review`/`needs_clarification`) does not exist yet — Milestone 6.
  There is no per-session "assigned facilitator" ownership check, the same named gap every prior
  milestone carries.
- **Verification:** `pnpm verify` (format, lint, typecheck, 624 tests across all packages — 266
  domain (up from 221), 321 API-gateway (up from 295), 12 contracts, 25 config — build) all green.
  `scripts/ci/check-domain-purity.sh` and `docs:lint` pass. No live Postgres/browser in this
  sandbox — manual verification is reproducible steps only, not an executed walkthrough.

### 2026-08-04 — Consent Management delivered (BUILD_ROADMAP.md Milestone 4), PR open

- **Third capability in the "WITNESS — COMPLETE THE REMAINING HUMAN-LED MVP" sequence.** With
  Participant Management merged (PR #27), consent is now first-class, specific, versioned,
  revocable and enforceable — never one generic checkbox. Consent to participate is modelled and
  enforced separately from consent to be audio/video-recorded, photographed, transcribed,
  AI-processed, attributed-quoted, anonymously quoted, used internally, reported externally,
  published, used for research, reused in future, included in a knowledge graph, or followed up
  with — fifteen well-known categories plus organisation-defined ones, none of which weaken the
  well-known set.
- **Three domain aggregates** (`packages/domain/src`): `ConsentTemplate` (structurally versioned —
  each row IS one immutable version, grouped by a shared `familyId`; there is no "edit template"
  function anywhere, so immutability is enforced by the absence of a mutator that could violate it,
  not a runtime guard), `SessionConsentConfiguration` (which template version a session uses and
  which of its categories are required/optional for that session — reconfigurable in place while
  `draft`/`scheduled`, frozen once `open`), and `ParticipantConsentRecord` (one participant's
  category-level decisions; consent is never overwritten — amending it is two coordinated writes,
  `supersedeConsentRecord` on the old record plus a fresh `captureParticipantConsent` for the new
  one, applied atomically by the service layer; there is deliberately no "restore" after
  withdrawal, since re-granting after withdrawing is itself a fact the audit trail must preserve as
  a distinct event, not an undo).
- **One reusable, fail-closed decision boundary** (`consent-decision.ts`, pure domain logic, wrapped
  for real use by `services/api-gateway/src/consent/consent-policy.service.ts`): every category
  question except `mayParticipate` itself first checks `mayParticipate` and refuses immediately if
  that is not granted — participation is the gate every other category decision is conditioned on.
  Missing, expired, withdrawn, or superseded-without-replacement consent all fail closed by
  construction, not by a caller remembering to check. This service is built as the boundary
  Milestone 5 (Structured Evidence Capture) will call before recording or using anything a
  participant said — it is not wired into evidence capture yet, since that capability does not
  exist.
- **Privacy**: general participant/session views expose only a consent _status summary_
  (`not_configured`/`not_requested`/`granted`/`partially_granted`/`refused`/`withdrawn`/`expired`);
  the category-by-category breakdown and withdrawal reason require
  `participant_consent:manage_restricted` and are structurally absent — not merely `null` — from
  the wire response otherwise, the same convention Milestone 3 established for
  `facilitatorNotes`/`linkedUserId`.
- **Authorisation reuses the existing Casbin scope-tier boundary.** `session_consent:*` and
  `participant_consent:*` follow `session:*`/`participant:*` exactly (contributor/admin, no
  per-session ownership check); `consent_template:manage` is admin-only, since a template is an
  organisation-wide governance artifact every session in scope may end up bound to — the same
  "administrative by definition" reasoning membership and role-assignment management already use.
  Consent capture is facilitator-mediated throughout, not participant self-service — the same
  limitation Milestone 3 already named (most participants cannot sign in to Witness at all).
- **API**: `consent-templates` (create/list/get/versions/create-version/activate/retire, org-scoped),
  `session-consent-configuration` (configure/reconfigure/get, session-scoped, atomically marking the
  session's own `consentConfigurationState` on first configuration), and
  `participant-consent-records` (capture/amend/withdraw/get-active/history, plus a facilitator
  dashboard summarising every participant's status for one session).
- **Frontend**: consent template list/create/detail-with-version-history/new-version pages under
  `/organisations/:id/consent-templates`; session consent configuration (configure/reconfigure) and
  a facilitator dashboard under `/workspaces/:id/sessions/:sessionId/consent-{configuration,dashboard}`;
  participant consent capture/amend/withdraw/history under
  `/workspaces/:id/sessions/:sessionId/participants/:participantId/consent` — linked from the
  session, participant, and organisation detail pages.
- **Known limitations, named rather than hidden:** `ConsentPolicyService` is built but not yet called
  by anything (Milestone 5 does not exist yet) — it is verified in isolation, not through an
  end-to-end evidence-capture flow. No participant self-service consent portal (mirrors Milestone
  3's own limitation). No per-session template-ownership check (same named gap as sessions/
  participants). No live Postgres or Docker was available in this sandbox, so the migration is
  hand-authored SQL (validated via `prisma validate`/`generate`, not applied against a live
  database) and the full workflow could not be walked through in a browser — same constraint every
  prior milestone was built under.
- **Verification:** `pnpm verify` (format, lint, typecheck, 553 tests across all packages — 221
  domain (up from 141), 295 API-gateway (up from 240), 12 contracts, 25 config — build) all green.
  `pnpm test:invariants` (20/20) and `pnpm test:adversarial` (30/30) unchanged, still green.
  `scripts/ci/check-domain-purity.sh`, `docs:lint`, `docs:links`, `check-adrs.sh`,
  `check-codeowners-coverage.sh`, `scan-secrets.sh` and `check-licenses.sh` all pass.
  `verify-no-egress.sh`'s runtime check needs Docker, unavailable in this sandbox — reported
  unverified, not claimed passed.

### 2026-08-04 — Participant Management delivered (BUILD_ROADMAP.md Milestone 3), PR open

- **Second capability in the "WITNESS — CO-DESIGN MVP BUILD COMPLETION" sequence.** With Co-design
  Session Management merged (PR #26), an authorised facilitator can now add and manage participants
  within a session: named, pseudonymous, anonymous, registered, and non-registered participation are
  all first-class, and a participant is never required to hold a Witness user account.
- **`SessionParticipant` domain aggregate** (`packages/domain/src/session-participant.ts`): identity
  is modelled on two independent axes — `identityMode` (`named`/`pseudonymous`/`anonymous`) and
  registration (`linkedUserId`, optional and orthogonal to identity mode, so a registered user can
  still participate pseudonymously and a non-registered person can still be named). `addParticipant`
  enforces anonymity by construction: an `anonymous` participant's `displayName` is forced to a fixed
  generic label and every other identifying field (`preferredName`/`pronouns`/`affiliation`) is
  cleared regardless of what the caller passed, and `linkedUserId` is rejected outright for that
  mode — "anonymous participation must not create fake personal details" is a domain invariant, not
  a UI convention. `participantType` is a free-form, organisation-supplied string, the same
  `sessionType` reasoning as Milestone 2: "interpreter" and "community representative" are not a
  closed set, and are explicitly not a system authorisation role (`role.ts`'s own doc comment).
  `consentStatusSummary` mirrors `CoDesignSession.consentConfigurationState`'s precedent — stored,
  defaulted to `not_configured`, no mutator until Milestone 4 (Consent) exists to set it.
- **Server-side privacy enforcement, not UI hiding.** `ParticipantsService` makes an imperative,
  in-service Casbin decision (`participant:manage_restricted`) — new to this codebase, because a
  single `GET` can legitimately return two different bodies for two different callers (a reader sees
  a redacted participant, a contributor sees the full record), which a route-level `@Requires(...)`
  boolean gate cannot express. `SessionParticipantSummary` has no `linkedUserId`/`facilitatorNotes`
  field at all — not merely `null` when hidden, but structurally absent from the list projection, so
  a server-side mistake cannot leak either through that type. `SessionParticipantDetail` includes
  both only when permitted (`linkedUserId` additionally for any `named` participant, whose account
  link is not restricted information); a `pseudonymous` participant's `linkedUserId` is retained
  internally but never returned by an ordinary read. The redacted export endpoint
  (`GET .../participants/export`) always applies the unprivileged redaction, regardless of the
  caller's own tier — an export artifact leaves the application's trusted context, so it never
  reflects the exporter's elevated view.
- **Session-lifecycle-gated participant changes.** Adding a participant or making an ordinary detail
  change is permitted in `draft`/`scheduled`/`open` (a facilitator registering a walk-in participant
  during a live session is a realistic need the milestone's floor rules do not forbid) and rejected
  in `closed`/`archived`. Attendance recording is permitted in `scheduled`/`open`/`closed` (marking
  final attendance after a session wraps up is routine) and rejected in `draft`/`archived`.
  Withdrawal/restoration is permitted in every status except `archived` — honouring a withdrawal
  request should not have to wait for the session to reopen.
- **Optimistic concurrency**, same conditional-`updateMany`-plus-audit-in-one-transaction pattern
  Milestone 2 established: every update/transition carries `expectedVersion`, and a stale write is a
  `409 STALE_VERSION` with nothing persisted.
- **Authorisation reuses the existing Casbin scope-tier boundary exactly.** Four new actions
  (`participant:read`/`create`/`update`/`manage_restricted`) at the same reader/contributor/
  reviewer/admin tiers `session:*` already uses — no new mechanism, no per-session or
  per-participant ownership check (same named gap Milestone 2 documented for sessions, extended
  here: any contributor/admin in a workspace's scope may manage any participant there).
  `packages/policy/policy.csv`'s header comment records the reasoning.
- **Frontend**: participant list (privacy-safe by construction — nothing to redact client-side
  because the server never sends restricted fields to an unprivileged caller), add-participant flow
  with independent registered/non-registered and named/pseudonymous/anonymous controls, participant
  detail with invitation/attendance/identity-visibility controls, a restricted facilitator-notes
  editor that renders only when the loaded record actually carries the `facilitatorNotes` key,
  withdrawal/restoration, redacted JSON export, and history — all under
  `/workspaces/:id/sessions/:sessionId/participants`.
- **Known limitations, named rather than hidden:** no per-session/per-participant ownership check
  (see above); no self-service view for a participant who is also a signed-in registered user to see
  only their own record (`participant:manage_restricted`/`participant:read` are workspace-scoped
  tiers, not row-level ownership — the same limitation Milestone 2 accepted for sessions); export
  format is JSON only (CSV/other formats deferred); no live Postgres or Docker was available in this
  sandbox, so the migration is hand-authored SQL (validated via `prisma validate`/`generate`, not
  applied against a live database) and the full workflow could not be walked through in a browser —
  same constraint every prior milestone was built under.
- **Verification:** `pnpm verify` (format, lint, typecheck, 409 tests across all packages — 137
  domain, 12 contracts, 25 config, 235 API-gateway — build) all green. `pnpm test:invariants`
  (20/20) and `pnpm test:adversarial` (30/30) unchanged, still green. `scripts/ci/check-domain-purity.sh`
  passes.

### 2026-08-04 — Co-design Session Management delivered (BUILD_ROADMAP.md Milestone 2), PR open

- **First core product capability after identity and access management.** With Authentication (PR
  #22/#23) and Authorisation Hardening (PR #25) both merged, this is the first milestone in the
  "WITNESS — CO-DESIGN MVP BUILD COMPLETION" sequence: a facilitator can now create, schedule, open,
  manage, close, archive, and reopen a co-design session within an organisation and workspace, with
  every action authorised through the existing Casbin scope-tier boundary — no new authorisation
  mechanism invented for this milestone.
- **`CoDesignSession` domain aggregate** (`packages/domain/src/co-design-session.ts`): an explicit
  five-state lifecycle (`draft → scheduled → open → closed → archived`, plus `scheduled → draft` and
  an audited, reasoned `closed → open` reopen) — mirrors `review.ts`'s "reopening emits an audit
  event, so the previous state is never lost" reasoning. Archived sessions are read-only, enforced
  in the domain layer (`assertNotArchived`), not just the UI. `sessionType` is a free-form,
  organisation-supplied string rather than a closed enum — "talanoa," "formal proceeding," and
  "community consultation" carry distinct protocol expectations a fixed list would either flatten or
  perpetually chase; `packages/contracts` ships a suggested set for the frontend picker only.
  `evidenceCaptureState` from the milestone brief is deliberately NOT a stored field — it is fully
  determined by `status` (`canCaptureEvidence()`), so Milestone 5 (Evidence Capture) will call that
  function rather than read a value that could drift from the state it describes.
  `consentConfigurationState` IS stored (`not_configured` at creation) because Milestone 4 (Consent)
  will need to set it independently of lifecycle status, but gets no mutator of its own yet — a
  named, deliberate gap, not an oversight.
- **Optimistic concurrency, new to this codebase.** Every update and transition of an existing
  session carries a client-supplied `expectedVersion`; the persistence-layer write is a single
  conditional `updateMany({ where: { id, version: expectedVersion } })`, and zero rows matched is a
  `409 STALE_VERSION` — the entire
  transaction, including the audit event, rolls back rather than silently overwriting a change the
  client never saw. `sessions.service.test.ts` verifies the case that actually matters: a client
  acting on a version it read _before_ someone else's write landed is rejected identically whether
  the conflicting write happened during this exact request or five minutes earlier.
- **Authorisation reuses the existing Casbin boundary exactly, with two named simplifications.**
  Four new actions (`session:read`/`session:create`/`session:update`/`session:transition`) were
  added to `packages/policy/policy.csv` and the deprecated dev-header fallback table
  (`role-grants.ts`), granted to the `contributor` tier (which `facilitator` collapses onto via
  `RoleResolutionService.ROLE_TO_TIER` — unchanged from Milestone 1.4). Two things this creates,
  named rather than hidden: (1) a plain `contributor` WitnessRole can create and manage sessions too,
  not only `facilitator` — splitting them onto separate tiers was judged out of scope; (2) there is
  no per-session "only the assigned facilitator may manage this specific session" ownership check —
  any contributor- or admin-tier holder in the session's organisation or workspace may manage _any_
  session there. Every session route nests under `:workspaceId`
  (`/api/v1/workspaces/:workspaceId/sessions/...`), which is what makes `AuthorizationGuard`'s
  existing scope resolution (Milestone 1.4) correctly Casbin-scope every session action without any
  change to the guard itself.
- **API**: `list`/`get`/`create`/`update`/`transition`/`history` under
  `/api/v1/workspaces/:workspaceId/sessions`, mirroring `RecordsController`'s
  parse-authorise-delegate-serialise shape; lifecycle transitions
  (schedule/unschedule/open/close/reopen/archive) are bundled behind one `session:transition`
  permission on `POST :sessionId/transition`, the same shape `record:review` uses for its own
  submit/confirm/correct/reject/reopen family. Lifecycle history reuses the existing polymorphic
  `AuditEvent` table filtered to lifecycle-action types — no new history table.
- **Frontend**: `/workspaces/[id]/sessions` (list + create link), `/workspaces/[id]/sessions/new`
  (create form — session-type picker with a free-text "Other" fallback, facilitator picker scoped to
  workspace members), and `/workspaces/[id]/sessions/[sessionId]` (detail, inline edit, lifecycle
  controls rendered from the server-computed `permittedTransitions` list, schedule/reopen sub-forms,
  and lifecycle history) — plus a "Co-design sessions →" link added to the existing workspace detail
  page. A distinct `staleUpdate` UI state (not folded into the generic error banner) handles
  `409 STALE_VERSION` with a "someone else changed this — reload" prompt, and a distinct `forbidden`
  state handles a 403 separately from "not found."
- **Known limitation, stated plainly**: this milestone's frontend, like every existing
  organisation/workspace/membership management page, drives the API through the unverified
  `X-Witness-Dev-User` header, not a real session — unchanged scope decision from Milestone 1.4, not
  reopened here.
- **No live Postgres or Docker was available in this sandbox** (unchanged from every prior
  milestone), so this could not be walked through end-to-end in a browser against a live database.
  Verification here is: 32 new domain tests (`co-design-session.test.ts`) covering every lifecycle
  transition and its adversarial rejections; 15 new service tests
  (`sessions.service.test.ts`) covering creation, scoping 404s, transitions, archived immutability,
  and optimistic concurrency against an in-memory Prisma double; 4 new policy-engine tests against
  the real, on-disk Casbin policy data; a hand-authored SQL migration (no live DB to generate a diff
  against, matching the same constraint every prior milestone's migration was written under) plus a
  successful `prisma generate`/`prisma validate`; and a full Next.js production build that
  type-checks and statically renders every new route. A live-database, live-browser manual
  walkthrough remains unverified — stated as such, not claimed.
- **Tests**: 331 tests across all packages (up from 276) — 94 domain (up from 62), 200 API-gateway
  (up from 177). `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged. Full `pnpm verify`
  (format, lint, typecheck, test, build) green.

### 2026-08-04 — Authorisation Hardening delivered (BUILD_ROADMAP.md Milestone 1.4), PR open

- **Continuous Product Delivery mode**: verified before starting — PR #24 (CI regression hotfix,
  discovered while confirming PR #23 was actually green on `main`) merged; `main`'s CI green.
  Branched `feat/authz/authorisation-hardening` from `fix/auth/ci-regression`'s tip rather than a
  stale `main` — one clean, CI-green commit ahead of `main` at branch time, disclosed here rather
  than silently deviating from "branch from main."
- **Casbin is now a genuine policy decision point (ADR-0007), not a second framework bolted beside
  the existing role-grants table.** `packages/policy/model.conf` and `packages/policy/policy.csv`
  are the single, versioned source of truth for what a request-time grant tier (`reader` /
  `contributor` / `reviewer` / `admin`) may do — ported 1:1 from the pre-existing `role-grants.ts`
  table, which now exists only as the deprecated fallback for the unverified development header.
  `PolicyEngineService` loads them once via a real Casbin `Enforcer`; `PolicyEngineService.test.ts`
  runs against that real, on-disk policy data rather than a fake — and caught a real bug doing so
  (Casbin's CSV adapter only skips `#`-prefixed comment lines, not `;`-prefixed ones; the policy
  file's original header used `;` and every enforcement call silently failed to load).
- **The organisation/workspace scoping gap left open since Authentication (Milestone 1.3) is
  closed.** `RoleResolutionService` now answers two distinct questions from the same
  `RoleAssignment` rows: `globalGrantTiers` (unscoped actions — `record:*`, `user:*`, `role:read` —
  `admin` excluded, unchanged from Milestone 1.3) and `scopedGrantTiers` (a specific organisation or
  workspace — `admin` included, only within that exact scope, and only when the backing
  `OrganisationMembership`/`WorkspaceMembership` is in good standing; a workspace scope also honours
  an assignment on the workspace's _parent_ organisation). The workspace/organisation split is a
  compile-time guarantee, not a runtime convention: `scopedGrantTiers`'s scope parameter type
  excludes `'global'` entirely, so `admin` cannot leak into an unscoped decision by a later edit
  forgetting a branch.
- **`AuthorizationGuard` now resolves a request's organisation/workspace scope and calls the new
  `PolicyEnforcementService.decide(principal, action, scope)`** instead of
  `AuthorizationPort.decide()` directly. Scope comes from the route's `organisationId`/`workspaceId`
  path parameter when present, else a creation body's `organisationId` (`workspace:create`), else
  the global scope. The unverified `X-Witness-Dev-User` path is untouched: a principal whose
  `subject` does not start with `user:` falls straight through to the pre-existing, unscoped
  `AuthorizationPort.decide()` — scoping is a property of real, session-backed identity, and there
  is no membership set to scope a header nobody has verified to.
- **`GET /api/v1/organisations` and `GET /api/v1/workspaces` are no longer full-catalog reads for a
  real session.** Both previously returned every row regardless of caller — authorised per-record
  by nothing, since neither route resolved a scope. `OrganisationsService.list` now filters to
  organisations the caller has a membership row in; `WorkspacesService.list` filters to workspaces
  the caller is a member of directly, or that sit under an organisation the caller is a member of
  (mirroring the `RoleResolutionService` cascade). The unverified dev-header path keeps seeing
  everything, exactly as before.
- **`GET /api/v1/me` now reports the role held in each organisation and workspace**, not just which
  ones the caller belongs to. `CurrentUserView`'s `organisations`/`workspaces` entries gained a
  `role: WitnessRole | null` field (`null` is a distinct, honest state — a membership predating its
  role assignment, per Milestone 1.2's "role assignment never happens implicitly" — not an error).
  The dashboard's existing "Your access" section now renders a role badge (or "No role assigned
  yet") next to each organisation and workspace. This is a display convenience only; the server
  re-derives the same answer independently via `PolicyEnforcementService` on every request, so a
  stale or manipulated client value can never grant anything.
- **Known limitation, stated plainly and deliberately not fixed this milestone**: the existing
  organisation/workspace/membership CRUD pages (`/organisations/[id]`, `/workspaces/[id]`, and
  their member-management flows) still call the API through the unverified dev-header path, not a
  real session — migrating them was judged out of scope for an authorisation-hardening milestone
  and would have doubled its surface area. The dashboard's "Your access" section is an additive
  extension for real sessions; the management UI itself remains dev-header-only until a later
  milestone migrates it.
- **`record:*` and `user:*` actions remain unscoped, on purpose.** `Record`/`Source` carry no
  `organisationId`/`workspaceId` foreign key in the Prisma schema, and `User` is not
  organisation-scoped — inventing a scoping model for either was out of scope ("speculative
  infrastructure" this milestone does not need to build). `organisation:create`/`user:create` stay
  admin-only in the _global_ tier resolution, which never includes `admin` for a real session — the
  same fail-closed boundary Milestone 1.3 documented and explicitly re-deferred, not resolved, here.
- **Tests**: 177 API-gateway tests (up from 153 at PR #24's merge) — new coverage for
  `RoleResolutionService.scopedGrantTiers` (organisation scope, workspace scope, the parent-org
  cascade, and five adversarial cases: cross-organisation leakage, cross-workspace leakage, a role
  assignment with no backing membership, a suspended membership, a nonexistent workspace),
  `PolicyEngineService` against the real on-disk policy data, `PolicyEnforcementService.decide`
  (grant/deny composition, the dev-header fallback, and fail-closed behaviour when role resolution
  or the policy engine itself throws), and list-visibility scoping for both
  `OrganisationsService.list` and `WorkspacesService.list`. All pre-existing tests preserved and
  passing; `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged. Full `pnpm verify`
  (format, lint, typecheck, test, build) green.
- **Not done this milestone, named rather than left implicit**: the milestone's full "current-context
  panel" UI (hide/disable actions, distinct states for forbidden-org/forbidden-workspace/
  insufficient-permission beyond what the additive dashboard extension above covers) was scoped down
  given the CRUD-page dev-header limitation above — there is little value in building rich
  forbidden-state UI for pages that do not yet authenticate the user they would be describing.

### 2026-08-03 — Authentication Hardening delivered, PR open

- **Continuous Product Delivery mode**: verified before starting — PR #22 (Authentication,
  Milestone 1.3) merged to `main`, no overlapping open PR. Scope: address the legitimate
  unresolved CodeRabbit review findings from PR #22, attempt real Keycloak verification, and leave
  the authentication boundary ready for Authorisation hardening — explicitly not that next
  capability itself.
- **Current-user error mapping corrected.** `GET /api/v1/me` previously collapsed every failure
  into `UNAUTHENTICATED`; a suspended or deactivated account with a still-technically-valid session
  token was silently served its full `CurrentUserView` — a real gap, not merely a UX one. Now
  distinguishes `UNAUTHENTICATED` (no/unknown session), `SESSION_EXPIRED`, `ACCOUNT_SUSPENDED` /
  `ACCOUNT_DEACTIVATED` (403 — the account, not the session, is the problem), and `UNKNOWN_ACCOUNT`
  (defensive). The frontend (`apps/web/src/lib/auth.tsx`) only discards the stored session token
  for the first two — a transient server failure or an account-state denial no longer forces an
  unnecessary full OIDC round trip, and the Shell now renders a distinct message for each case.
  Verified against a real database: suspending an already-signed-in account now correctly denies
  `/me` with `ACCOUNT_SUSPENDED` instead of serving the view.
- **Login-state consumption is now atomic.** The previous `findUnique` then separate `delete`
  left a real window where two concurrent callbacks carrying the same `state` could both read the
  row before either deleted it. Replaced with a single atomic `delete` — the delete itself is the
  claim; a losing concurrent caller or a replay gets Prisma's "record not found," identical to
  "never existed." A new concurrency test proves exactly one of two simultaneous callbacks for the
  same state succeeds.
- **`AuthLoginAttempt` no longer grows without bound.** `startLogin` (unauthenticated,
  `GET /api/v1/auth/login`) now opportunistically purges expired rows on every call — no external
  scheduler required for basic operation. Verified against a real database: an expired attempt
  inserted directly is gone after the next sign-in start; active attempts are preserved.
- **OIDC discovery hardened**: a 5-second timeout (`AbortSignal.timeout`) on both the discovery and
  token-exchange fetches (previously unbounded — a stalled Keycloak could hold every sign-in
  request open indefinitely); concurrent discovery requests on a cold adapter now share one
  in-flight fetch instead of each issuing their own; the discovery document's required fields are
  validated before use rather than assumed; a failed discovery is not cached, so the next call
  retries; a successful discovery is now re-fetched after one hour rather than cached forever.
  None of this weakens verification — a failed or incomplete discovery still fails closed.
- **OIDC configuration values are now trimmed** (`oidcIssuer`, `oidcClientId`, `oidcClientSecret`,
  `jwtAudience`) before being stored — previously only `webOrigin` and `oidcRedirectUri` were,
  meaning trailing whitespace in an operator's `.env` value would have silently broken the
  discovery-document fetch and every ID-token audience check.
- **A development-only open redirect closed.** `dev-idp/authorize`'s `redirect_uri` query parameter
  is now validated against the configured callback URI before use — the route is
  development-profile-only, so the blast radius was always a local dev machine, but the file's own
  header comment promised no caller-supplied redirect target, and this was the one exception.
- **N+1 query removed** from `SessionAuthenticator.effectiveRoleGrantTiers` — `AuthorizationGuard`
  calls this on every guarded request, so a user with N role assignments previously cost N
  sequential membership lookups before any handler ran. Now two batched `findMany` calls regardless
  of assignment count, with a regression test asserting exactly one query per scope type for three
  assignments across three organisations.
- **Three attack tests in the development identity-provider double's suite were passing for the
  wrong reason** — each verified a token signed by a _different_ key, so `jwtVerify` rejected on
  signature before the issuer/audience/expiry claim under test was ever evaluated; if the adapter
  had dropped those checks entirely, the tests would still have passed. `DevelopmentIdentityProviderAdapter`
  now accepts an optional shared key pair (test-only — production code never supplies one), and the
  three tests were rewritten to share a key pair and assert on the specific `jose` claim-validation
  error code (`ERR_JWT_CLAIM_VALIDATION_FAILED` / `ERR_JWT_EXPIRED`) rather than any throw.
- **Real Keycloak was not verified** — no container runtime is available in this sandbox (unchanged
  from PR #22; confirmed again, not assumed). Added
  [`docs/engineering/KEYCLOAK_INTEGRATION_VERIFICATION.md`](docs/engineering/KEYCLOAK_INTEGRATION_VERIFICATION.md),
  a step-by-step procedure (exact commands, exact checks) to run once Docker is available, and
  `infrastructure/docker/init/keycloak/witness-realm.json`, a reproducible realm-import file (realm
  `witness`, public PKCE client `witness-api`, two test users) for the `keycloak` compose service's
  existing `--import-realm` — declarative configuration, not yet imported into a running instance,
  stated as such in both the file's own status line and this entry. **This remains a pilot-blocking
  gate**, unchanged from before this PR.
- **Development identity boundary re-reviewed, no gaps found.** `DevelopmentAuthorizationAdapter`
  and `DevelopmentIdentityProviderAdapter` both still throw at construction outside the development
  profile; `SessionBackedAuthorizationAdapter`'s dev-header fallback returns `null` unconditionally
  outside development (now covered by a dedicated test,
  `session-backed.adapter.test.ts`); `AuthorizationGuard` tries a real session before the dev
  header (now covered by `authorization.guard.test.ts`, including a forged-admin-header-alongside-
  a-real-session case). Added a development-profile-only notice on `/signin` naming the local
  identity double explicitly, so the bypass is visible at the point someone is about to use it, not
  only on the dashboard's health panel.
- **TD-002 and TD-003 reassessed**, as instructed, for whether Authentication makes either directly
  exploitable. Neither is newly exploitable by this PR specifically — TD-003
  (`docs/engineering/TECH_DEBT.md`) already accounted for `AuthenticationService` reusing the
  unfixed `resolveActor` helper when Milestone 1.3 landed; its risk-scope description there was
  corrected in this PR (see below), but the underlying exposure and its 2026-11-03 deadline, tied to
  Milestone 1.4 or any external pilot, are unchanged.
- **Documentation corrections**: `docs/engineering/TECH_DEBT.md`'s TD-003 entry had a stale
  `2026-10-03` review date surviving alongside a corrected `2026-11-03` one, and its "examined at
  the trigger" note incorrectly claimed the collision risk was narrower after Authentication landed
  — `resolveActor` matches only on `(displayName, kind)`, never on `IdentityLink.providerSubject`,
  so two unrelated identities sharing a display name remain exactly as exposed as before; both
  fixed. `docs/MVP_CHECKLIST.md`'s pilot-blocking gate description overclaimed request-time
  workspace authorization when the actual evidence was membership-based visibility; reworded.
  `docs/engineering/DEVELOPER_ONBOARDING.md`'s invited-user bootstrap step named an admin action
  a real signed-in session cannot perform (session principals never carry the global admin grant);
  corrected to name the dev-header path explicitly.
- **Tests**: 145 API-gateway tests (up from 109 at PR #22's merge) — new coverage for atomic state
  consumption under concurrency, login-attempt retention and cleanup, OIDC discovery timeout/cache/
  dedup/validation (`keycloak-oidc.adapter.test.ts`, new), current-user error mapping
  (`authentication.controller.test.ts`, new), session precedence over the dev header
  (`authorization.guard.test.ts`, new), development-bypass containment for the session-backed
  adapter (`session-backed.adapter.test.ts`, new), the N+1 regression, and trimmed/empty-after-trim
  OIDC configuration (config package, 25 tests, up from 21). All pre-existing tests preserved and
  passing; `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged.
- **The pre-existing `Documentation` CI failure is now fixed, narrowly.**
  `governance/PRODUCT_CONSTITUTION.md` has carried no Owner/Status header since before PR #17,
  recorded each time as a known, deliberately-unfixed gap "this branch has no authority to
  decide" (STATUS.md's PR #20 entry). Per this task's explicit narrow permission, added
  `PRODUCT_CONSTITUTION.md` to `scripts/ci/check-doc-headers.sh`'s existing foundational-document
  exemption list (alongside `README.md`, `LICENSE`, `CODE_OF_CONDUCT.md`) — the same treatment
  those documents already get, not an invented Owner/Status header for a constitution that has
  neither by design.
- **Known limitations, stated plainly**: live Keycloak sign-in remains unverified — a pilot-blocking
  gate, see `KEYCLOAK_INTEGRATION_VERIFICATION.md`. No centralised Casbin policy-engine enforcement
  (Authorisation hardening, still the next capability). TD-002/TD-003 remain open on their existing
  schedules, both due 2026-11-03. Rate-limiting the unauthenticated `GET /api/v1/auth/login`
  endpoint (named alongside the login-attempt-purge finding in the PR #22 review) was not added —
  out of scope for this pass; the purge itself bounds table growth independent of a rate limit.

### 2026-08-03 — Authentication (BUILD_ROADMAP.md Milestone 1.3) delivered, PR open

- **Continuous Product Delivery mode**: verified before starting — `main` at the merged Roles and
  Permission Assignment commit (PR #21), no overlapping open PR, `main` green.
- **Authentication** (Milestone 1.3) delivered as a vertical slice, per the accepted identity
  decision ([ADR-0007](architecture/decisions/ADR-0007-identity-and-access.md)): OIDC
  authorization-code-with-PKCE against Keycloak. `IdentityProviderPort` is the reversal seam;
  `KeycloakOidcAdapter` uses the standard OIDC discovery document rather than Keycloak-specific
  paths, so any spec-compliant provider (Zitadel, Authentik — both named acceptable in ADR-0007)
  can replace it without a domain or API change.
- **No live Keycloak container is available in this sandbox** (no container runtime — `docker ps`
  fails, nested containerization is not permitted here). This is a sandbox limitation on _manual_
  verification, not a technical-impossibility finding against ADR-0007: the real
  `KeycloakOidcAdapter` is built and shipped exactly as specified. A protocol-faithful
  `DevelopmentIdentityProviderAdapter` — the same port, a locally generated RSA keypair, real
  `jose` `SignJWT`/`jwtVerify` calls — lets the full PKCE flow and JWT/JWKS verification be
  genuinely exercised end to end in development and in tests, never a "trust an unverified header"
  shortcut.
- **Identity mapped by verified provider subject, never email as the ongoing key.**
  `IdentityLink.provider` + `.providerSubject` (unique together) is the permanent link; email is a
  one-time bootstrap lookup at first sign-in only. First sign-in activates an account only when it
  is currently `invited` and the provider confirms `email_verified` — never onto an already-active,
  suspended, or deactivated account without an existing link, and never by auto-creating a user.
  Suspended/deactivated denial, and the activation itself, are audited
  (`authentication.denied`, `identity_link.created`, `user.activated`).
- **Session delivery: bearer token, not a cookie.** Chosen because the existing architecture already
  has the browser calling the API cross-origin directly (`main.ts`'s CORS configuration) — a
  cross-origin cookie would need `SameSite=None; Secure`, which doesn't fit local development
  without disproportionate complexity. The token travels once, in the callback URL's fragment
  (`/auth/callback#token=...`, never sent to any server), then lives in `sessionStorage` and is
  sent as `Authorization: Bearer`. The server stores only its SHA-256 hash, never the raw token —
  the same "store the hash, not the secret" treatment as a password.
- **Deliberate, documented authorisation boundary — not full hardening.** A signed-in principal's
  roles are computed by flattening every held `RoleAssignment` into the pre-existing
  `reader`/`contributor`/`reviewer` grant tiers, but the scope-relative `admin` `WitnessRole` never
  maps to the global admin grant through a session
  (`services/api-gateway/src/authz/session-authenticator.ts`) — no session-derived principal can
  reach an admin-gated action. This is the deliberate, fail-closed edge Authorisation hardening
  (the next capability) is expected to resolve; it is not silently assumed solved.
- The pre-existing `X-Witness-Dev-User` dev-header path is untouched and still development-profile-
  only, but a real session now takes priority over it whenever both are present on a request — a
  forged dev header can no longer widen what an authenticated caller may do.
- Web UI: `/signin`, `/auth/callback`, `/auth/error` (plain-language per-reason denial messages);
  the shell header shows **Signed in as `<name>`** / **Sign out** once authenticated (additive to,
  not replacing, the existing "Acting as" role switcher); the dashboard's new **Your access**
  section lists only the organisations and workspaces the signed-in user actually belongs to.
- Health/readiness (`GET /ready`) now performs a real, time-bounded reachability check of the
  identity provider's OIDC discovery document for non-development profiles, replacing the previous
  static `not_configured` label.
- **Tests**: 109 API-gateway tests (up from 60), including 16 tests exercising real cryptographic
  JWT/JWKS verification against the development identity-provider double (tampered signature, wrong
  key, wrong issuer/audience, expired token, nonce mismatch, PKCE mismatch, redirect-URI mismatch,
  replayed/unknown code), 13 covering the full authentication service (first-sign-in activation, no
  duplicate link/user on repeat sign-in or email change, unknown-identity/suspended/deactivated
  denial with audit, single-use state, sign-out revocation), and 11 covering session-to-principal
  resolution including the admin-tier exclusion attack case. 62 domain tests (up from 54). Verified
  against a real local PostgreSQL 16 database, not only service-level fakes: first sign-in, repeat
  sign-in, suspension denial, sign-out invalidation, and a forged-dev-header-alongside-a-real-
  session privilege-escalation attempt (denied), each confirmed against actual database rows,
  through a real browser (Chromium), and via the running API.
- **`docs/MVP_CHECKLIST.md`** — the six Authentication items and the pilot-blocking gate under §B
  Trusted Access marked ready pending merge; per the checklist's own rule, an open PR does not
  count as complete.
- **Known limitations, stated plainly**: no centralised Casbin policy-engine enforcement yet
  (Authorisation hardening is the next capability); live Keycloak sign-in has not been manually
  verified in this environment (no container runtime available); the `X-Witness-Dev-User` header
  remains a separate, unverified development convenience, unchanged by this PR. See the PR for the
  full account.

### 2026-08-03 — Roles and Permission Assignment (BUILD_ROADMAP.md Milestone 1.2) shipped

- **Continuous Product Delivery mode**: verified before starting — `main` at the merged Users and
  Memberships (PR #19) and documentation-baseline (PR #20) commits, no overlapping open PR, `main`
  green. Also restored the pre-existing `Documentation`/aggregate `CI gate` baseline failure in PR
  #20 (markdownlint violations in four documents committed directly to `main` outside the lint-gated
  PR flow) before starting this capability.
- **Roles and Permission Assignment** (Milestone 1.2) shipped: a new, deliberately separate concept
  from membership. Membership (`organisation-membership.ts`/`workspace-membership.ts`) answers "does
  this user belong here"; `packages/domain/src/role.ts` and `role-assignment.ts` answer "what may
  they do here". Six canonical roles — `admin`, `facilitator`, `contributor`, `reviewer`,
  `participant`, `reader` — preserving the existing `reader`/`contributor`/`reviewer`/`admin` names
  from `DevelopmentAuthorizationAdapter` rather than renaming them, and adding `facilitator`/
  `participant` as new. Each role maps to an explicit, least-privilege permitted-actions list
  (`ROLE_PERMISSIONS_BY_ROLE`) in the vocabulary of the one capability that exists today (records) —
  no role inheritance, no hierarchy.
- One role assignment per (user, scope): assigning where none exists creates it, assigning where one
  already exists replaces it (`changeRoleAssignment`), refusing a no-op "change" to the role already
  held (duplicate-assignment prevention). A role assignment can never create membership implicitly —
  it is always resolved from an _existing_ membership row, and requires that membership (and, for a
  workspace-scoped assignment, the _parent organisation_ membership, re-checked at assignment time
  rather than assumed from the workspace membership having once been valid) to be in good standing.
  Real foreign keys throughout; one `role_assignment` table with mutually-exclusive nullable
  `organisationId`/`workspaceId` columns, a CHECK constraint enforcing that exclusivity, and two
  `@@unique` constraints that give independent "one row per (organisation, user)" and "one row per
  (workspace, user)" using Postgres's NULL-never-equals-NULL semantics rather than a partial index.
- API: `GET /api/v1/roles` (the static catalog); `GET`/`PUT`/`DELETE
/api/v1/{organisations,workspaces}/{scopeId}/memberships/{membershipId}/role`. All four new
  actions (`role:read`, `role_assignment:{read,write,delete}`) admin-only except `role:read`, which
  is broadly granted — understanding what a role permits is useful to everyone, unlike managing
  assignments. Self-promotion prevention is enforced today only as a corollary of "role-assignment
  management is admin-only, full stop" — there is no real identity yet (Milestone 1.3) for the domain
  to compare "assigner" against "assignee" directly; recorded as a known limitation, not silently
  assumed solved.
- Web UI: a `RoleAssignmentControl` extends the existing membership tables on `/organisations/[id]`
  and `/workspaces/[id]` with a "Role" column — current role (or "No role assigned"), a role picker
  with a plain-language label and description per option, and assign/change/remove actions. No new
  page; no generic administration console.
- Audit: `role_assignment.created`/`.changed`/`.removed`, hash-chained through the existing
  mechanism, same as every other subject type. Verified against a real local PostgreSQL 16 database
  (not just service-level fakes) — all 17 manual-verification steps in the PR, including cross-
  organisation and cross-workspace manipulation attempts (denied `MEMBERSHIP_NOT_FOUND`, matching the
  existing membership-service pattern) and a non-admin dev-header caller's assignment attempt (denied
  `FORBIDDEN`).
- **Tests**: 12 new domain tests (54 total — up from 42), 19 new API-gateway service tests (60
  total — up from 41), 4 new adversarial tests (30 total — up from 26). All existing tests preserved
  and passing.
- **`docs/MVP_CHECKLIST.md`** — the Roles and Authorisation items under §B Trusted Access marked
  ready pending merge; per the checklist's own rule, an open PR does not count as complete.
- **Known limitations, stated plainly**: no production authentication, no Keycloak, no centralised
  Casbin enforcement, current development identity remains temporary (`X-Witness-Dev-User`,
  unverified), no delegated administration beyond the flat admin/non-admin split. See the PR for the
  full account, including the two inherited concurrency risks (audit tail-read race,
  actor-resolution TOCTOU) now formally logged in `docs/engineering/TECH_DEBT.md` rather than only
  mentioned in review threads.

### 2026-08-03 — Baseline markdownlint failures fixed (PR #20)

- The `Documentation` CI check (and the aggregate `CI gate` it feeds) had been red since
  `docs/PRODUCT_ROADMAP.md` was committed directly to `main` outside the lint-gated PR flow —
  flagged and left as an out-of-scope, pre-existing failure on PRs #17, #18, and #19. Fixed here:
  the same root cause (documents committed straight to `main`) also broke `BUILD_ROADMAP.md`,
  `MVP_CHECKLIST.md`, and `governance/PRODUCT_CONSTITUTION.md`, so all four were corrected with the
  same mechanical, meaning-preserving treatment — collapsed multiple blank lines, escaped periods on
  plain-text numbered section headings CommonMark was mis-parsing as ordered-list continuations,
  word-wrapped over-length lines, bolded existing Owner/Status header fields. Verified with a
  word-boundary diff against `origin/main`: the only content-level change anywhere is 29 escaped
  periods — everything else is whitespace/line-wrap only.
- `governance/PRODUCT_CONSTITUTION.md` still has no Owner/Status metadata at all (not just
  unbolded); left as a known, deliberately unfixed gap rather than inventing governance metadata
  this branch has no authority to decide.

### 2026-08-03 — Users and Memberships (BUILD_ROADMAP.md Milestone 1.1) shipped

- **Continuous Product Delivery mode**: `docs/BUILD_ROADMAP.md` was restructured around milestones
  toward a usable MVP (`docs/PRODUCT_ROADMAP.md` and `docs/MVP_CHECKLIST.md` also added); Organisations
  and Workspaces (Release 0.2 items 1–2, PRs #17/#18) are the completed baseline this milestone builds
  on. Verified before starting: `main` green (lint, typecheck, test, build, `test:invariants` 20/20,
  `test:adversarial` 23/23), no overlapping open PR.
- **Users and Memberships** (Milestone 1.1) shipped: user registration
  (`packages/domain/src/user.ts`, email normalised and deduplicated), a shared membership state
  machine (`packages/domain/src/membership.ts`: `invited → active ⇄ suspended`, `revoked` terminal)
  reused by both `organisation-membership.ts` and `workspace-membership.ts`. A workspace membership
  cannot be created without an _organisation_ membership in good standing for that workspace's
  specific parent organisation — enforced in the domain from a state the service reads and passes in,
  which is what stops standing in one organisation being used to justify workspace access under
  another. Real foreign keys and unique constraints throughout (`witness_user`,
  `organisation_membership`, `workspace_membership` — no polymorphic references, unlike `AuditEvent`,
  because none of these relationships are genuinely polymorphic). All five new mutations
  (`user.created`, `organisation_membership.created`/`.state_changed`,
  `workspace_membership.created`/`.state_changed`) are hash-chained through the existing audit
  mechanism. Every new action (`user:read`/`:create`, `organisation_membership:*`,
  `workspace_membership:*`) is admin-only — this capability is explicitly administrative
  (`BUILD_ROADMAP.md`: "an organisation administrator needs to..."), so reader/contributor/reviewer
  get none of it, not even read.
- Web UI: `/users` + `/users/new`, and membership management added to `/organisations/[id]` and
  `/workspaces/[id]` (add member, activate/suspend/revoke, all server-computed `permittedActions`
  the same way `RecordDetail` already works). No page claims an invitation email was sent — Witness
  does not deliver email yet, and every "invited" label says so.
- **Tests**: 42 domain tests (up from 29 — user/membership creation, email normalisation,
  transition rules, cross-organisation and cross-workspace rejection), 40 API-gateway tests (up from
  20 — three new service test files against an in-memory Prisma double, since no live Postgres was
  available in this environment; see "Known limitations" in PR for what that does and doesn't cover),
  `test:invariants` 20/20 unchanged, `test:adversarial` 26/26 (up from 23 — administrator-permitted,
  reviewer-denied and invented-role-denied cases for every new action).
- **`docs/MVP_CHECKLIST.md`** — the seven Users and Memberships items under §B Trusted Access marked
  ready pending merge (user domain model, organisation membership, workspace membership, admin can
  add a user, duplicate membership prevented, membership changes audited, user list and membership
  state visible in UI) — per the checklist's own rule that an open PR does not count as complete, they
  read READY rather than DONE until this merges. Roles/Authentication items in the same section remain
  unchecked — out of scope for this PR.

### 2026-08-03 — Workspaces (BUILD_ROADMAP.md Release 0.2, item 2) shipped

- **Product Delivery Execution Mode**: continuing directly from the merged Organisations PR (#17),
  per the standing instruction to select the next incomplete `BUILD_ROADMAP.md` capability, implement
  it as one vertical slice, open one PR, and stop.
- **Workspaces** shipped: `packages/domain/src/workspace.ts` (`createWorkspace`, with domain unit
  tests — the previous PR shipped `createOrganisation` without any, a gap not backfilled here to keep
  this PR scoped to workspaces), a real foreign-key `workspace` table (unlike `AuditEvent`'s
  necessarily-polymorphic association, a workspace always belongs to exactly one organisation, so
  referential integrity is enforced by Postgres, not the application layer), contracts, an
  authorised `WorkspacesController`/`WorkspacesService` that 404s creation against a
  non-existent `organisationId`, and `/workspaces` + `/workspaces/new` in the web app (the create
  form lists organisations to choose from, since a workspace cannot exist without one). `admin` gains
  `workspace:create`; all four roles get `workspace:read`, matching the least-privilege shape already
  established for organisations.
- All checks green: lint, typecheck, build, full test suite (29 domain tests, up from 26), `pnpm
test:invariants` (20/20), `pnpm test:adversarial` (23/23, one new "reviewer cannot create a
  workspace" case). As with Organisations, no live Postgres was available in this environment — the
  migration is schema-validated but not executed against a real database.
- **Open discrepancies from the previous PR remain unresolved** (not this capability's job to fix):
  ADR-0022 still does not exist; `Tenant` vs `Organisation` naming is still split between
  `DATA_MODEL.md` and `ARCHITECTURE.md`.

### 2026-08-03 — Implementation authorised; Organisations (BUILD_ROADMAP.md Release 0.2, item 1) shipped

- **`docs/BUILD_AUTHORIZATION.md`, `docs/BUILD_ROADMAP.md` and `docs/governance/PRODUCT_CONSTITUTION.md`
  added to `main`** (direct commits, Founder-approved). `BUILD_AUTHORIZATION.md` declares the
  planning phase complete and implementation authorised; outstanding Phase 1 deliverables (1.3–1.5,
  1.8) continue in parallel and do not block. This entry records two open discrepancies rather than
  silently resolving them: **ADR-0022**, cited by the authorising instruction, does not exist in
  `architecture/decisions/` (ADR-0000–0021 do); and the instruction to "use ROADMAP.md" is read here
  as `docs/BUILD_ROADMAP.md` — the only document with a concrete, ordered capability list — rather
  than the pre-existing root `ROADMAP.md`, which has none.
- **Organisations** (`BUILD_ROADMAP.md` Release 0.2, item 1 — the first item on the new roadmap with
  nothing yet built) shipped as a full vertical slice: `packages/domain/src/organisation.ts`
  (`createOrganisation`), a `subject_type`/`subject_id` migration generalising the audit hash-chain
  from record-only to polymorphic (so the same tamper-evident mechanism serves any future aggregate,
  not just `Record`), contracts, an authorised `OrganisationsController`/`OrganisationsService`, and
  `/organisations` + `/organisations/new` in the web app. A new `admin` role gates
  `organisation:create` under least privilege — `reader`/`contributor`/`reviewer` get
  `organisation:read` only. `make verify`-equivalent (format, lint, typecheck, test, build) and
  `test:invariants` / `test:adversarial` all pass; no database was available to run the migration
  live, so it is unexecuted-but-reviewed pending a real Postgres instance.

### 2026-08-02 — Sign-off status reconciled; Phase 1 deliverable 1.2 (domain model) drafted

- **Sign-off reconciled for 1.1, 1.7, 1.9, 1.10.** All four are merged to `main`; none has a
  recorded human department review. Trackers corrected from stale "PR open" / unqualified "merged"
  text to `MERGED — SIGN-OFF REQUIRED`, naming the exact reviewers each needs. CodeRabbit posted
  automated findings on PR #12 (1.9, 2 nitpicks) and PR #15 (1.7, 7 findings — landed after merge,
  a race between the human merge and the review finishing); neither is human sign-off, both are
  recorded as outstanding rather than silently dropped.
- **D-10 recorded**: whether a deliverable's formal sign-off (not merge) is required before a
  _dependent_ deliverable may start. Interim reading — no, only phase-gate closure requires it —
  already acted on to start 1.2, since `DEPARTMENT_ASSIGNMENTS.md`'s own dependency column and
  status (`⚪ available`, not `⛔ gated`) already reflected that reading before this decision made it
  explicit.
- **`architecture/domains/DOMAIN_MODEL.md`** (deliverable 1.2) elaborates all twelve bounded
  contexts from `ARCHITECTURE.md` §3 and `DATA_MODEL.md` §2 to the depth
  `DEPARTMENT_ASSIGNMENTS.md`'s acceptance gate requires, and maps every context against actual
  0.1.0 code. Finding: no undocumented drift — every gap between the model and shipped code already
  traces to a dated decision (a schema comment, a roadmap sequence item, a threat-model entry).

### 2026-08-02 — Persistent multi-agent organisation established; Delivery Wave 1 launched

- **Organisational control plane** established in `docs/engineering/organisation/` — agent
  registry, work-package register, delivery-wave model, review and escalation matrices, agent
  communication and memory policies. Extends existing canonical documents (`DEPARTMENTS.md`,
  `DEPARTMENT_ASSIGNMENTS.md`, `AGENT_HANDOFF_PROTOCOL.md`) rather than duplicating them.
- **D-9 recorded**: `BRANCH_STRATEGY.md` (ADR-0015) describes a `develop`/domain-branch model that
  has never actually been used — every merged PR to date branched from and targeted `main` directly.
- **Stacked PRs now prohibited by default** in `PULL_REQUEST_WORKFLOW.md`, after this session found
  that PR #11's own documented retarget plan was not followed when PR #10 remained open.
- **Delivery Wave 1** launched: two independently-owned Phase 1 work packages, each on its own
  branch from `main`, neither stacked on the other — `architecture/views/COMPONENT_VIEWS.md`
  (deliverable 1.1, D2) and the threat model/PIA completion (deliverable 1.7, D6).

### 2026-08-02 — Phase 1 deliverable 1.7 (threat model & PIA) drafted

- **`docs/research/THREAT_MODEL.md`** created — `SECURITY_ARCHITECTURE.md` §10 has referenced this
  file as "in progress" since Phase 0; it did not exist. Expands the existing ten-threat STRIDE
  summary to full detail (asset, attack vector, mitigation — built or planned — verification,
  residual risk) and adds the Privacy Impact Assessment `DEPARTMENT_ASSIGNMENTS.md` bundles into the
  same deliverable.
- Two new risks found during the pass, added to `docs/governance/RISK_REGISTER.md`'s Top risks
  table: **R-17** (erasure incomplete in backup after a right-to-erasure request) and **R-18**
  (re-identification via entity resolution merging a pseudonymous subject with a named entity).
- **Not self-certified.** Marked 🟡 drafted, pending Security Lead (second reviewer) and QA Lead
  (PIA) sign-off.

### 2026-08-02 — PR #10 and PR #11 merged; Phase 1 deliverable 1.9 (Accessibility & i18n) drafted

- **PR #10** (Developer Preview reconciliation) and **PR #11** (deliverable 1.10, merged into PR #10's
  branch before PR #10 merged) both landed on `main`. Verified by ancestor check, not assumed: both
  commits are ancestors of `main`, and every Developer Preview path
  (`packages/domain`, `packages/config`, `packages/contracts`, `services/api-gateway`, `apps/web`,
  `pnpm-lock.yaml`, the Prisma schema/migration/seed, ADR-0021, the department docs) is present.
- **Canonical `main` re-verified from a clean checkout**: `make verify` (format, lint, typecheck,
  test, build), `pnpm test:invariants` (20/20), `pnpm test:adversarial` (21/21), all governance and
  security gates, `make migrate` and `make seed` against PostgreSQL 16, and the application run
  end-to-end — capture, submit, confirm, hash-chained audit trail, 401/403 authorisation boundary —
  all through the running API, not just static checks.
- **`docs/product/ACCESSIBILITY_I18N_STRATEGY.md`** (deliverable 1.9) consolidates the WCAG 2.2 AA
  merge-gate, RTL and low-bandwidth requirements already decided in `PROJECT_CONTEXT.md` P8 and
  ADR-0020, and explicitly gates five not-yet-decided objectives (audit tooling, first-supported
  languages, i18n infrastructure, external audit timing, per-language extraction quality) with an
  owner and phase gate.
- **1.10's tracker rows corrected** — they still read "PR open" after PR #11 merged; now read
  "merged to main, pending Principal Architect + CTO sign-off," since a human merging a PR is not the
  same as the named department completing its review.

### 2026-08-02 — Phase 1 deliverable 1.10 (NFRs & SLOs) drafted

- **[`architecture/NFR_SLO.md`](architecture/NFR_SLO.md)** consolidates the latency, throughput,
  availability and recovery objectives already decided piecemeal in `DEPLOYMENT_ARCHITECTURE.md`,
  `CI_CD.md` and the risk register, and explicitly gates six not-yet-decided objectives (API latency,
  write throughput, review queue throughput, projection rebuild time, extraction latency, concurrent
  capacity at scale) with an owning department and the phase gate that must produce each number.
- Chosen from the Phase 1 backlog because it was the only deliverable that was simultaneously
  unblocked (no dependencies), assignable to a single department (D2), and directly named on the
  critical path to the Phase 2 exit gate in `docs/engineering/PHASE_EXECUTION_PLAN.md`.
- **Not self-certified.** Marked 🟡 drafted, pending Principal Architect and CTO review — the exit
  gate for 1.10 is verified by the named department, not the implementer.

### 2026-08-02 — Developer Preview reconciled into main

- **The Developer Preview was not on `main`.** PR #1 merged the architecture branch into `main` at
  03:07:08; PR #2 merged the preview into that same branch at 03:07:53 — 45 seconds after it had
  already been merged away. All 84 files were stranded on `f1dce48`. This was a consequence of the
  stacked-PR structure: PR #2 could only reach `main` through PR #1's branch, and merging #1 first
  closed that path.
- **Reconciled** on `reconcile/developer-preview-to-main`, branched from current `main` and merged
  with `f1dce48`. No Git conflicts.
- **Preserved from `main`:** the CodeQL action bump to v4.37.4 (a security update — `f1dce48` had
  only reformatted a comment in that file), the Dependabot markdownlint bump (which matched the
  branch's value exactly), and all ten files added to `main` independently.
- **Applied from the branch:** the full Developer Preview, and the ADR-0021 deletions that had
  never landed — including `memory/changelog.md`, the fictional implementation history.
- **Reconciled structures:** five agent personas, three prompt templates, an alternative operating
  model and one task file. Nothing deleted. Recorded in
  [`AGENT_STRUCTURE_RECONCILIATION.md`](docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md), with
  D-7 and D-8 raised for the owner.
- **`tasks/task-001-authentication.md` gated** as PHASE 2 / GATED / NOT STARTED. It specified JWT
  login with password hashing, which would make Witness its own identity provider — the option
  ADR-0007 considered and rejected. No authentication code was written.

### 2026-08-01 — Developer Preview 0.1.0

- **D-6 resolved** ([ADR-0021](architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)).
  `VISION.md` is the canonical product definition; ADR-0000–0020 are the canonical architecture. Four
  overlapping documents from `main` superseded, their content preserved in the ADR appendix.
  `memory/changelog.md` removed — it recorded five modules as built, none of which existed.
- **Repository foundation repaired.** Seven referenced-but-missing scripts and compose files created
  and verified. Two defects fixed that would have hit every new contributor's first `make dev`:
  `.env.example` was missing a mandatory variable, and Compose never loaded the root `.env` at all.
- **Toolchain activated.** Lockfile committed; the dormant CI code gates (build, test, lint,
  invariants) now run for real.
- **Developer Preview shipped.** `packages/domain` (pure), `packages/config` (profile enforcement),
  `packages/contracts` (Apache-2.0), `services/api-gateway` (NestJS + Prisma), `apps/web` (Next.js).
  110 tests across six suites.
- **Department model established.** Ten departments with ownership and prohibited actions; phase
  execution plan; assignment board; agent handoff protocol; verified developer onboarding.
- **D-1 structurally resolved.** Apache-2.0 boundary documented and enforced; one written
  affirmation from the copyright holder remains outstanding.

**Verified, not assumed:** migrations applied against PostgreSQL 16, fixtures seeded, records created
through the browser, review transitions performed, provenance and audit trail rendered, zero console
errors. Tamper detection confirmed by altering an audit row directly in the database and watching the
chain fail — then restoring it and watching it pass.

### 2026-07-31 — Foundation established

- Repository scaffolded to the full enterprise structure.
- Complete documentation baseline: context, vision, mission, roadmap, governance, engineering
  operating model, product operating model, all process documents.
- ADRs 0000–0020 drafted; core architectural stance recorded and open to challenge.
- 19 role charters defined in [`agents/`](agents/), with explicit authority boundaries.
- Branch strategy defined for 30 long-lived branches with owners and merge rules.
- CI/CD, security review and AI development workflow established.
- OSS evaluation dossier produced for the full core stack, with an exit strategy per dependency.
- Governance framework: consent, digital sovereignty, Indigenous data sovereignty, risk register.
- CODEOWNERS mapping every path to an owning role; no path is unowned.
- **Executable governance gates** in `scripts/ci` and `scripts/security`, wired into CI: link
  integrity, document ownership, ADR completeness, CODEOWNERS coverage, action pinning, branch
  divergence, licence boundary, and static zero-egress verification. All pass on this commit.

**Known gaps, stated plainly:**

- The _runtime_ half of zero-egress verification activates with the Phase 2 stack. Only the static
  half runs today.
- Deployment, admin, user and API guides describe the **target** experience, not a shipped one. They
  are published early so operators can tell us they are wrong before we build them.
- Personas are hypotheses from desk research, not findings from interviews (Phase 1 research).
- ADR-0019 (Indigenous data sovereignty) carries a **hard external review gate** before Phase 4.
  Nothing in that area should be implemented until it is met.

---

## Open decisions needing resolution

| #    | Decision                                                                                                                                                                                                            | Owner                     | Needed by                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Confirm SDK/contracts permissive licensing with copyright holders                                                                                                                                                   | Open Source Lead          | Phase 2                                                       | 🟡 **Structurally resolved; one human action outstanding.** The full Apache-2.0 boundary is implemented, documented in [`docs/governance/LICENSING.md`](docs/governance/LICENSING.md) and mechanically enforced by `check-licenses.sh`. Attribution uses the collective placeholder "The Witness Contributors" rather than an invented legal entity. **Remaining:** the copyright holder must affirm the boundary in writing — see LICENSING.md §D-1 for the exact three-step action. No software change can complete this                                                                                                                                                       |
| D-2  | Event transport: NATS JetStream vs Postgres-only for small deployments                                                                                                                                              | Backend Lead              | Phase 3                                                       | ADR-0005 proposes profile-based; needs load evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-3  | ASR engine: faster-whisper vs whisper.cpp vs WhisperX composition                                                                                                                                                   | AI Lead                   | Phase 5                                                       | Blocked on benchmark against target languages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-4  | Graph store: confirm Neo4j Community vs Apache AGE for constrained deployments                                                                                                                                      | Knowledge Graph Lead      | Phase 4                                                       | Licensing/footprint trade-off, ADR-0004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D-5  | Foundation host for long-term stewardship                                                                                                                                                                           | Founder                   | Phase 8                                                       | Candidates under consideration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-7  | Agent persona layer: adopt subordinate, fold into charters, or replace charters                                                                                                                                     | CTO & Product Director    | Before Phase 2                                                | `main` gained five execution personas (`agents/architect.md` etc.) alongside the 19 role charters. They are different artefacts — personas describe behaviour, charters describe authority — and both are retained with the personas explicitly subordinate. Whether that is the end state is a governance call. See [`AGENT_STRUCTURE_RECONCILIATION.md`](docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md) §8                                                                                                                                                                                                                                                                |
| D-8  | `engineering/README.md`: build the layout it describes, rewrite it, or deprecate it                                                                                                                                 | CTO                       | Before Phase 2                                                | It directs agents to `engineering/vision/`, `engineering/standards/` and four other paths that do not exist. Retained with a banner; an agent following it literally fails at step one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D-9  | `docs/engineering/BRANCH_STRATEGY.md` (ADR-0015) describes `main → develop → domain → working`; no `develop` branch has ever existed and every merged PR (#10, #11, #12) branched from and targeted `main` directly | CTO & Release Manager     | Before the next delivery wave scales past two parallel agents | Recorded in [`docs/governance/DECISIONS.md`](docs/governance/DECISIONS.md) and [`docs/engineering/organisation/00-INDEX.md`](docs/engineering/organisation/00-INDEX.md). Until resolved, the organisational control plane follows the actually-practiced direct-to-`main` model, not ADR-0015                                                                                                                                                                                                                                                                                                                                                                                    |
| D-10 | Does a Phase 1 deliverable need its formal department sign-off (not just a merge) before a _dependent_ deliverable can start — e.g. must 1.1 be signed off before 1.2 begins?                                       | CTO & Principal Architect | Confirm before Phase 1 exit                                   | **Interim reading, already acted on:** no. `DEPARTMENT_ASSIGNMENTS.md`'s Dependencies column names the prior deliverable (`1.1`), not its sign-off state, and 1.2's own row already read `⚪ available` rather than `⛔ gated` once 1.1 merged. The phase-level exit gate (`PHASE_EXECUTION_PLAN.md`: "verified by the named department, not self-certified") still requires every deliverable's sign-off before _Phase 1_ closes — this decision is narrower, about starting dependent _work_, not about closing the _phase_                                                                                                                                                    |
| D-6  | Product and architecture reconciliation                                                                                                                                                                             | CTO & Founder             | **Phase 1 — resolved 2026-08-01**                             | ✅ **Resolved** by [ADR-0021](architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md). `VISION.md` is canonical product scope; ADR-0000–0020 are the canonical architecture. `docs/vision.md`, `docs/architecture.md`, `docs/coding-standards.md` and `memory/decisions.md` are superseded; `memory/changelog.md` (fictional implementation history) removed. Sector material preserved as explicitly non-canonical in [`docs/product/SECTOR_APPLICATIONS.md`](docs/product/SECTOR_APPLICATIONS.md). **Reversible via a superseding ADR if the multi-sector framing reflects a stakeholder commitment the engineering organisation is not party to** |

---

## What we are deliberately not doing right now

- AI extraction, transcription, or anything that produces a candidate assertion (Phase 5)
- The knowledge graph projection (Phase 4)
- The consent service (Phase 3) — and therefore not enforcing P2 yet
- Real authentication (Phase 2) — the preview's authorisation boundary is real; its authentication
  is deliberately absent rather than faked
- Building a docs website (content first, presentation later)
- Any live-transcription work (deferred, see roadmap)
- Any cloud-hosted multi-tenant offering (contradicts sovereignty default)
