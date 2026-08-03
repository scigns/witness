# Status

**Last updated:** 2026-08-03
**Updated by:** CTO
**Update rule:** every pull request that changes the state of a workstream updates this file.
Staleness here is a defect — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Executive summary

Witness is in **Phase 1 (Architecture & Research)**, and now ships a **Developer Preview (0.1.0)**
that runs.

Phase 0 is complete. The preview proves the architecture end to end on one narrow workflow —
capture a record, store it, display it, show its provenance, let a human accept or reject it — with
a hash-chained audit trail and a real authorisation boundary.

**The pipeline is still deliberately unbuilt.** No AI extraction, no transcription, no knowledge
graph, no consent service, no Keycloak. Consent, provenance and tenancy are cross-cutting
invariants; any assertion written before they are enforceable is permanently untrustworthy. The
running instance lists every missing capability at `/ready` and renders it on the dashboard, so the
gap is visible rather than inferred.

**Overall health:** 🟢 On track
**Biggest current risk:** R-01 — ontology design becoming an unbounded research project. Mitigation
is a hard time-box on ontology v0.1 and a commitment to versioned, evolvable schema rather than a
correct-first-time one. See [`docs/governance/RISK_REGISTER.md`](docs/governance/RISK_REGISTER.md).

---

## Phase status

| Phase | Name | State | Gate met |
|---|---|---|---|
| 0 | Engineering organisation | 🟢 Complete | ✅ |
| 1 | Architecture & research | 🟡 In progress | — |
| — | *Developer Preview 0.1.0* | 🟢 *Shipped 2026-08-01* | *n/a — not a phase gate* |
| 2 | Infrastructure & identity | ⚪ Not started | — |
| 3 | Core backend & data | ⚪ Not started | — |
| 4 | Knowledge graph | ⚪ Not started | — |
| 5 | AI platform & capture | ⚪ Not started | — |
| 6 | Search & experience | ⚪ Not started | — |
| 7 | Hardening | ⚪ Not started | — |
| 8 | v1.0 & reference deployments | ⚪ Not started | — |

Legend: 🟢 complete/healthy · 🟡 in progress · 🔴 blocked · ⚪ not started

---

## Workstream status

| Workstream | Branch | Owner | State | Notes |
|---|---|---|---|---|
| Architecture | `architecture` | Principal Architect | 🟡 | C4 context/container done; component views pending |
| Research | `research` | Research Lead | 🟡 | OSS evaluation complete for core stack; ASR benchmark pending |
| Documentation | `documentation` | Documentation Lead | 🟢 | Baseline complete; onboarding verified end-to-end; docs site not yet built |
| Product | `product` | Product Director | 🟡 | Personas and core journeys defined; PRDs pending |
| UX design | `ux-design` | UX Lead | ⚪ | Blocked on Phase 1 journeys |
| Governance | `governance` | Governance Lead | 🟡 | Consent framework drafted; Indigenous protocols need external review |
| Security | `security` | Security Lead | 🟡 | Threat model started; PIA not begun; authorisation boundary shipped, real identity is Phase 2 |
| Infrastructure | `infrastructure` | Infrastructure Lead | 🟡 | Compose stack running; observability overlay added, wiring pending |
| Backend | `backend` | Backend Lead | 🟡 | Domain, config, contracts and API gateway shipped in 0.1.0 |
| Knowledge graph | `knowledge-graph` | Knowledge Graph Lead | 🟡 | Ontology v0.1 in design |
| AI platform | `ai-platform` | AI Lead | ⚪ | Awaiting Phase 5; model policy drafted |
| Frontend | `frontend` | Frontend Lead | 🟡 | Preview web application shipped; design system awaits Phase 6 |
| Testing | `testing` | QA Lead | 🟡 | 110 tests; invariant and adversarial suites live |
| Release | `release` | Release Manager | 🟢 | Strategy and versioning defined |

---

## Phase 1 deliverable tracker

| # | Deliverable | Owner | State |
|---|---|---|---|
| 1.1 | C4 architecture views | Principal Architect | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) — [`architecture/views/COMPONENT_VIEWS.md`](architecture/views/COMPONENT_VIEWS.md) |
| 1.2 | Domain model & bounded contexts | Principal Architect | 🟡 Drafted, PR open — [`architecture/domains/DOMAIN_MODEL.md`](architecture/domains/DOMAIN_MODEL.md) |
| 1.3 | Knowledge graph ontology v0.1 | Knowledge Graph Lead | 🟡 Draft in `architecture/KNOWLEDGE_GRAPH.md` |
| 1.4 | Event catalogue v0.1 | Backend Lead | 🟡 Draft in `architecture/EVENT_CATALOGUE.md` |
| 1.5 | API contract v0.1 | Backend Lead | ⚪ Not started |
| 1.6 | OSS evaluation | Research Lead | 🟢 Complete for core stack |
| 1.7 | Threat model & PIA | Security Lead | 🟡 MERGED — SIGN-OFF REQUIRED (2nd Security Lead + QA Lead) — [`docs/research/THREAT_MODEL.md`](docs/research/THREAT_MODEL.md); 7 CodeRabbit findings landed after merge, unaddressed |
| 1.8 | Consent framework spec | Governance Lead | 🔴 BLOCKED — needs external Indigenous governance review |
| 1.9 | Accessibility & i18n strategy | UX Lead | 🟡 MERGED — SIGN-OFF REQUIRED (UX Lead + D10) — [`docs/product/ACCESSIBILITY_I18N_STRATEGY.md`](docs/product/ACCESSIBILITY_I18N_STRATEGY.md); 2 CodeRabbit nitpicks outstanding |
| 1.10 | NFRs & SLOs | CTO | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) — [`architecture/NFR_SLO.md`](architecture/NFR_SLO.md) |

---

## What changed recently

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
  *dependent* deliverable may start. Interim reading — no, only phase-gate closure requires it —
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

- The *runtime* half of zero-egress verification activates with the Phase 2 stack. Only the static
  half runs today.
- Deployment, admin, user and API guides describe the **target** experience, not a shipped one. They
  are published early so operators can tell us they are wrong before we build them.
- Personas are hypotheses from desk research, not findings from interviews (Phase 1 research).
- ADR-0019 (Indigenous data sovereignty) carries a **hard external review gate** before Phase 4.
  Nothing in that area should be implemented until it is met.

---

## Open decisions needing resolution

| # | Decision | Owner | Needed by | Notes |
|---|---|---|---|---|
| D-1 | Confirm SDK/contracts permissive licensing with copyright holders | Open Source Lead | Phase 2 | 🟡 **Structurally resolved; one human action outstanding.** The full Apache-2.0 boundary is implemented, documented in [`docs/governance/LICENSING.md`](docs/governance/LICENSING.md) and mechanically enforced by `check-licenses.sh`. Attribution uses the collective placeholder "The Witness Contributors" rather than an invented legal entity. **Remaining:** the copyright holder must affirm the boundary in writing — see LICENSING.md §D-1 for the exact three-step action. No software change can complete this |
| D-2 | Event transport: NATS JetStream vs Postgres-only for small deployments | Backend Lead | Phase 3 | ADR-0005 proposes profile-based; needs load evidence |
| D-3 | ASR engine: faster-whisper vs whisper.cpp vs WhisperX composition | AI Lead | Phase 5 | Blocked on benchmark against target languages |
| D-4 | Graph store: confirm Neo4j Community vs Apache AGE for constrained deployments | Knowledge Graph Lead | Phase 4 | Licensing/footprint trade-off, ADR-0004 |
| D-5 | Foundation host for long-term stewardship | Founder | Phase 8 | Candidates under consideration |
| D-7 | Agent persona layer: adopt subordinate, fold into charters, or replace charters | CTO & Product Director | Before Phase 2 | `main` gained five execution personas (`agents/architect.md` etc.) alongside the 19 role charters. They are different artefacts — personas describe behaviour, charters describe authority — and both are retained with the personas explicitly subordinate. Whether that is the end state is a governance call. See [`AGENT_STRUCTURE_RECONCILIATION.md`](docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md) §8 |
| D-8 | `engineering/README.md`: build the layout it describes, rewrite it, or deprecate it | CTO | Before Phase 2 | It directs agents to `engineering/vision/`, `engineering/standards/` and four other paths that do not exist. Retained with a banner; an agent following it literally fails at step one |
| D-9 | `docs/engineering/BRANCH_STRATEGY.md` (ADR-0015) describes `main → develop → domain → working`; no `develop` branch has ever existed and every merged PR (#10, #11, #12) branched from and targeted `main` directly | CTO & Release Manager | Before the next delivery wave scales past two parallel agents | Recorded in [`docs/governance/DECISIONS.md`](docs/governance/DECISIONS.md) and [`docs/engineering/organisation/00-INDEX.md`](docs/engineering/organisation/00-INDEX.md). Until resolved, the organisational control plane follows the actually-practiced direct-to-`main` model, not ADR-0015 |
| D-10 | Does a Phase 1 deliverable need its formal department sign-off (not just a merge) before a *dependent* deliverable can start — e.g. must 1.1 be signed off before 1.2 begins? | CTO & Principal Architect | Confirm before Phase 1 exit | **Interim reading, already acted on:** no. `DEPARTMENT_ASSIGNMENTS.md`'s Dependencies column names the prior deliverable (`1.1`), not its sign-off state, and 1.2's own row already read `⚪ available` rather than `⛔ gated` once 1.1 merged. The phase-level exit gate (`PHASE_EXECUTION_PLAN.md`: "verified by the named department, not self-certified") still requires every deliverable's sign-off before *Phase 1* closes — this decision is narrower, about starting dependent *work*, not about closing the *phase* |
| D-6 | Product and architecture reconciliation | CTO & Founder | **Phase 1 — resolved 2026-08-01** | ✅ **Resolved** by [ADR-0021](architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md). `VISION.md` is canonical product scope; ADR-0000–0020 are the canonical architecture. `docs/vision.md`, `docs/architecture.md`, `docs/coding-standards.md` and `memory/decisions.md` are superseded; `memory/changelog.md` (fictional implementation history) removed. Sector material preserved as explicitly non-canonical in [`docs/product/SECTOR_APPLICATIONS.md`](docs/product/SECTOR_APPLICATIONS.md). **Reversible via a superseding ADR if the multi-sector framing reflects a stakeholder commitment the engineering organisation is not party to** |

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
