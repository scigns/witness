# Threat Model (STRIDE) and Privacy Impact Assessment

**Owner:** Security Lead
**Status:** Draft — Phase 1 deliverable 1.7. Pending sign-off by Security Lead (second reviewer) and
QA Lead (PIA) per [`DEPARTMENT_ASSIGNMENTS.md`](../engineering/DEPARTMENT_ASSIGNMENTS.md)'s
acceptance gate for row 1.7. Not self-certified — see
[`PHASE_EXECUTION_PLAN.md`](../engineering/PHASE_EXECUTION_PLAN.md)'s rule that an exit gate is
verified by the named department, not the implementer.
**Related:** [`architecture/SECURITY_ARCHITECTURE.md`](../../architecture/SECURITY_ARCHITECTURE.md)
§10 (the summary table this document completes) ·
[`docs/governance/RISK_REGISTER.md`](../governance/RISK_REGISTER.md) ·
[`docs/governance/CONSENT_FRAMEWORK.md`](../governance/CONSENT_FRAMEWORK.md)

---

## What this is

`SECURITY_ARCHITECTURE.md` §10 has carried a ten-row STRIDE summary table since Phase 0, with a note
that the full model lives here — a reference to a document that did not yet exist. This is that
document: each summary-table threat expanded to the level a security reviewer needs to sign off on,
plus the Privacy Impact Assessment `DEPARTMENT_ASSIGNMENTS.md` bundles into the same deliverable.

**Discipline, consistent with `NFR_SLO.md` and `ACCESSIBILITY_I18N_STRATEGY.md`:** every mitigation
below traces to a control that is either already built (cited against real code or an accepted ADR)
or explicitly scheduled to a phase. Nothing is marked mitigated on the strength of an intention.

## 1. Scope

The Developer Preview (0.1.0) as it exists on `main` today: `packages/domain`, `packages/config`,
`services/api-gateway`, `apps/web`, running in the `development` deployment profile with the
`DevelopmentAuthorizationAdapter`. Threats whose subject does not exist yet (transcription,
extraction, the knowledge graph) are scored against the **planned** architecture in
`ARCHITECTURE.md` and `architecture/views/COMPONENT_VIEWS.md`, and explicitly marked as such — a
threat model that only covers shipped code would miss exactly the threats a phase gate exists to
catch before the code ships.

## 2. Threats

Likelihood (L) and Impact (I) use the same 1–5 scale as
[`RISK_REGISTER.md`](../governance/RISK_REGISTER.md), so the two registers stay comparable.

### T-1 — Consent bypass through a processing path that skips the gate

**STRIDE:** Elevation of privilege · **L:** 2 · **I:** 5 · **Priority:** Critical
**Status:** Planned control — the consent service (deliverable 3.4) does not exist yet.

**Attack vector.** A new code path (a new ingestion route, an admin bulk-import tool, a debugging
script) processes subject data without passing through the policy decision point, because the PDP is
a convention enforced by review, not yet a type-system guarantee.

**Planned mitigation.** [ADR-0008](../../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md):
a `ConsentedContext` type that a processing function cannot obtain without a valid grant — making the
bypass a compile error, not a review miss. `architecture/views/COMPONENT_VIEWS.md` §2 places the
policy decision point as a hard dependency in the context map, not an optional check.

**Verification (Phase 3 exit gate).** Attempting to process without a consent grant fails by
construction, demonstrated by trying it — `PHASE_EXECUTION_PLAN.md`'s own Phase 3 exit gate.

**Residual risk.** Until Phase 3, this control does not exist. The Developer Preview processes no
real subject data (all fixtures are synthetic, per `services/api-gateway/prisma/seed.ts`), so current
exposure is nil — this is a pre-Phase-3 gate condition, not a live gap.

### T-2 — Cross-tenant data access

**STRIDE:** Information disclosure · **L:** 2 · **I:** 5 · **Priority:** Critical
**Status:** Planned control — tenancy (deliverable 3.5) does not exist yet; the Developer Preview is
single-tenant.

**Attack vector.** A query missing a tenant filter returns another organisation's records.

**Planned mitigation.** Row-level security at the database plus a repository-layer filter — two
independent layers, so a single missed filter is not a single point of failure — verified
adversarially, not asserted, per `PHASE_EXECUTION_PLAN.md` Phase 3's test requirement.

**Verification.** INV-8 (`test/invariants/invariants.test.ts`'s documented Phase 3 addition):
"Tenant isolation: cross-tenant reads are impossible."

**Residual risk.** Nil today — no multi-tenancy exists to attack.

### T-3 — Audit chain tampering by a privileged insider

**STRIDE:** Repudiation · **L:** 2 · **I:** 4 · **Priority:** Critical
**Status:** Partially mitigated today.

**Attack vector.** An operator with direct database access alters an `audit_event` row to hide what
happened.

**Current mitigation, verified this session.** The hash chain (`packages/domain/src/audit.ts`) is
real and running: this session altered an `audit_event` row directly in PostgreSQL as part of
Developer Preview validation, and `verifyChain()` correctly reported the chain invalid; restoring the
row made it valid again. `ADVERSARIAL` suite (`test/adversarial/adversarial.test.ts`, "ATTACK —
rewrite the audit trail") covers four tamper attempts programmatically.

**Not yet mitigated.** An `UPDATE`/`DELETE` path against `audit_event` is prohibited by convention
(`DEPARTMENTS.md` D4: "An `UPDATE` or `DELETE` path against `audit_event`... It is append-only") but
not yet enforced by a database trigger — that is deliverable 3.7. External anchoring (so tampering is
detectable even if an attacker controls the database entirely) is explicitly deferred to Phase 7 per
`STATUS.md`'s stated known gap.

**Residual risk.** A privileged database user can today alter an event and a subsequent chain
verification will catch it (detection works), but nothing yet **prevents** the write
(prevention is deliverable 3.7). Detection without prevention is a real, accepted, phase-gated gap —
not a silent one.

### T-4 — Culturally restricted knowledge exposed to unauthorised viewers

**STRIDE:** Information disclosure · **L:** 2 · **I:** 5 · **Priority:** Critical
**Status:** Planned control — depends on the knowledge graph (Phase 4) and Indigenous data
sovereignty protocols, which carry their own hard external-review gate.

**Attack vector.** A community-restricted entity or relationship (per CARE/OCAP® principles) is
returned to a viewer outside the community that restricted it, because access control is applied at
a general permission level rather than at the specific restriction.

**Planned mitigation.** Community restriction enforced at the policy decision point, above and
independent of administrative roles — an administrator's general access does not override a
community's specific restriction. [ADR-0019](../../architecture/decisions/ADR-0019-indigenous-data-sovereignty.md)
(external Indigenous governance review) is a **hard gate**: `PHASE_EXECUTION_PLAN.md` states nothing
in this area is implemented until that review completes.

**Residual risk.** Nil today — no knowledge graph exists. This threat's mitigation is gated behind a
review this document does not have authority to schedule; see deliverable 1.8's blocked status in
`DEPARTMENT_ASSIGNMENTS.md`.

### T-5 — Prompt injection forging assertions

**STRIDE:** Tampering · **L:** 3 · **I:** 3 · **Priority:** High
**Status:** Planned control — no extraction pipeline exists yet (Phase 5).

**Attack vector.** Content within a recorded utterance is crafted to manipulate the extraction
model into producing a false candidate assertion — misattributed to the speaker, or fabricated
outright.

**Planned mitigation.** Schema-constrained model output (candidates can only take the shape
`packages/contracts` defines, not arbitrary text) plus the human confirmation gate — per ADR-0012, no
candidate reaches the institutional record without a human. This is the same P4 guarantee this
session verified live: `confirmRecord` throws `HumanConfirmationRequired` for any non-human actor
(`packages/domain/src/record.ts`), and the adversarial suite specifically tests "cannot launder a
model actor by giving it a human-looking name."

**Residual risk.** The human-gate gate is real and tested today for the one workflow that exists
(record review). Prompt-injection-specific defences (schema constraints on model output) are Phase 5
work and untested because the subject doesn't exist.

### T-6 — Unexpected egress in a "sovereign" deployment

**STRIDE:** Information disclosure · **L:** 2 · **I:** 4 · **Priority:** High
**Status:** Mitigated today, verified this session.

**Attack vector.** A dependency, a misconfigured client, or a debugging leftover causes the
application to phone home from a deployment that promises zero external calls.

**Current mitigation, verified this session.** Dual-layer: `packages/config` refuses to boot the
`sovereign` profile if `EXTERNAL_MODEL_PROVIDER`, `EXTERNAL_MODEL_BASE_URL` or
`EXTERNAL_MODEL_API_KEY` is set (INV-1, `test/invariants`), and this is tested adversarially — "cannot
use the base URL alone as a side channel," "cannot use an API key alone as a side channel"
(`test/adversarial`). `bash scripts/security/verify-no-egress.sh`'s static half passed on `main` this
session. The runtime half (running the sovereign profile in a network-isolated container) could not
be executed in this session's sandbox — no Docker daemon available — which is an environment
constraint on this verification, not a code defect; it is the same runtime check CI runs on every PR.

**Residual risk.** Static analysis and the boot-time refusal are proven; the full network-isolated
runtime proof was not re-executed in this session specifically. It has passed in CI historically
(this session confirmed the CI job exists and is green on recent PRs).

### T-7 — Erasure incomplete — data survives in a cache, index or backup

**STRIDE:** (Compliance, not a classic STRIDE category — retained from the existing summary table)
**L:** 3 · **I:** 3 · **Priority:** High
**Status:** Architecturally favourable, not yet implemented.

**Attack vector, reframed as a compliance risk.** A subject exercises the right to erasure; the
record is deleted from PostgreSQL but survives in Neo4j, OpenSearch, a Redis cache, or an existing
backup.

**Planned mitigation.** [ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)'s
core guarantee — Neo4j, OpenSearch and pgvector are **rebuildable projections**, not sources of truth
— means erasure from PostgreSQL followed by a projection rebuild structurally cannot leave a
survivor in a projection, unlike a polyglot-persistence system with independent stores. Backups are
the harder case, not solved by projection design: [`DEPLOYMENT_ARCHITECTURE.md`](../../architecture/DEPLOYMENT_ARCHITECTURE.md)
§4 covers what is and isn't backed up but does not yet cover erasure-from-backup procedure.

**Verification.** No verification job exists yet — this is itself a gap the PIA (§3) flags rather
than assumes will be built.

**Residual risk.** Architecturally favourable (the projection model does most of the work for free)
but the backup-erasure procedure and its verification job are unbuilt. Recorded as a gap, not closed.

### T-8 — Re-identification via entity resolution merging pseudonymous to named

**STRIDE:** Information disclosure · **L:** 2 · **I:** 4 · **Priority:** High
**Status:** Planned control — entity resolution does not exist yet (Phase 4).

**Attack vector.** Automated entity resolution merges a pseudonymous mention ("a community elder")
with a named entity, re-identifying someone who was deliberately recorded without a name.

**Planned mitigation.** `DATA_MODEL.md`'s aggregate map treats entity merges/splits as "entity-level
transactions" requiring elevated authority, never automatic — per
`architecture/views/COMPONENT_VIEWS.md` §3's entity resolver component design, which this document
cross-references rather than restates.

**Residual risk.** Nil today — no entity resolution exists.

### T-9 — Compromised model weights altering extraction

**STRIDE:** Tampering · **L:** 2 · **I:** 3 · **Priority:** Medium
**Status:** Planned control — no model inference exists yet (Phase 5).

**Attack vector.** A tampered or substituted model file (via a compromised registry, a supply-chain
attack, or local file tampering) produces subtly incorrect extraction.

**Planned mitigation.** Checksum pinning and operator-controlled model storage, consistent with the
air-gapped distribution model (`DEPLOYMENT_ARCHITECTURE.md` §2: "Model weights included in the
bundle, checksum-pinned").

**Residual risk.** Nil today.

### T-10 — Denial of service via unbounded graph traversal

**STRIDE:** Denial of service · **L:** 2 · **I:** 2 · **Priority:** Medium
**Status:** Planned control — no graph query API exists yet (Phase 4).

**Attack vector.** A crafted graph query with no depth or result bound consumes unbounded resources.

**Planned mitigation.** Depth, result and timeout limits at the query API — noted as a Phase 4
deliverable ("graph query API with traversal limits") in `PHASE_EXECUTION_PLAN.md`.

**Residual risk.** Nil today.

## 3. Privacy Impact Assessment

### 3.1 Data categories processed

Per [`CONSENT_FRAMEWORK.md`](../governance/CONSENT_FRAMEWORK.md) §2–3, and grounded in what the
Developer Preview actually stores today (verified against `services/api-gateway/prisma/schema.prisma`
this session):

| Category | Example | Legal basis (planned, per `CONSENT_FRAMEWORK.md`) | Stored today? |
|---|---|---|---|
| Institutional record content | Meeting minutes, decisions, commitments | Consent grant, scoped | Yes — synthetic fixtures only |
| Provenance metadata | Source, capture time, capturing actor | Necessary to the record's function — not separately consentable per se, since a record without provenance cannot exist ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)) | Yes |
| Subject identity in content | A named person discussed in a meeting | Consent grant, or third-party-data disposition (risk **R-04**, unresolved) | Not modelled yet — no `Subject` aggregate exists in the Developer Preview schema |
| Audio/media | Recorded sessions | Consent grant, explicit, at capture time | Not yet — no ingestion exists |

### 3.2 Necessity and proportionality

Each category above is necessary to the stated product function (`VISION.md`: institutional memory
with traceable justification) rather than collected speculatively. The one category flagged as
**not yet resolved** — third-party data, a named person discussed by someone else, who has not
themselves consented — is **risk R-04** in `RISK_REGISTER.md`, owned by Governance Lead, and this
PIA does not attempt to resolve it; resolving it is exactly the kind of decision
`AGENT_HANDOFF_PROTOCOL.md` reserves for Governance Lead's absolute veto authority.

### 3.3 Data subject rights

`CONSENT_FRAMEWORK.md` §8 already states the rights model (access, correction, revocation, erasure).
This PIA's contribution is confirming what is and is not yet exercisable: **none of these rights are
exercisable today**, because the Developer Preview processes no real subject data — the seed fixtures
are synthetic (`prisma/seed.ts`: "All fixtures are synthetic," verified this session by inspection).
This is a gap only in the sense that the rights aren't implemented; it is not a live exposure, since
there is no real subject data to exercise a right over yet.

### 3.4 Sign-off status

**Not yet signed off.** Per this deliverable's acceptance gate in
[`DEPARTMENT_ASSIGNMENTS.md`](../engineering/DEPARTMENT_ASSIGNMENTS.md), sign-off belongs to
Security Lead (a second reviewer, not the implementer) and QA Lead for the PIA specifically.

## 4. Mitigations recorded in the risk register

Every threat above with an unmitigated residual risk maps to a `RISK_REGISTER.md` **Top risks** row
rather than a new, undiscoverable one: T-4's Indigenous governance gate is **R-05**; T-5's prompt
injection is **R-13**; T-3's chain-tampering-without-prevention angle relates to **R-07** (consent
revocation incomplete in some store — same "detection without prevention" shape). T-7's
erasure-verification gap and T-8's re-identification risk are new observations from this pass, added
as **R-17** and **R-18** in this same PR — within D6's owned scope
(`docs/governance/RISK_REGISTER.md`, risk entries only), not `ARCHITECTURE.md` §8's mirrored
architectural-risk list, which belongs to D2.
