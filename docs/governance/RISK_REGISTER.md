# Risk Register

**Owner:** Governance Lead & CTO
**Status:** Active
**Review:** Quarterly, and on any accepted ADR that changes the risk picture
**Last reviewed:** 2026-07-31

---

## How to read this

Risks are recorded because pretending they do not exist is how projects fail. Each has an owner, a
current assessment, a mitigation, and — most importantly — a **signal**: the observable thing that
tells us the risk is materialising, so we act on evidence rather than on anxiety or optimism.

**Scoring:** Likelihood (L) and Impact (I) on 1–5. Score = L × I.
**Bands:** 🔴 15–25 critical · 🟠 9–14 high · 🟡 4–8 medium · 🟢 1–3 low

---

## Top risks

| # | Risk | L | I | Score | Owner |
|---|---|---|---|---|---|
| **R-01** | Ontology becomes an unbounded research project | 4 | 4 | 🟠 16 | KG Lead |
| **R-02** | Human review becomes an unacceptable throughput bottleneck | 4 | 4 | 🟠 16 | Product Director |
| **R-03** | Extraction quality inadequate in low-resource languages | 4 | 4 | 🟠 16 | AI Lead |
| **R-04** | Third-party data — people discussed but not present | 4 | 4 | 🟠 16 | Governance Lead |
| **R-05** | Indigenous data governance model is wrong | 3 | 5 | 🟠 15 | Governance Lead |
| **R-06** | Witness legitimises extractive consultation | 3 | 5 | 🟠 15 | Product Director |
| **R-07** | Consent revocation incomplete in some store | 2 | 5 | 🟠 10 | Security Lead |
| **R-08** | Projection rebuild exceeds the maintenance window at scale | 3 | 3 | 🟡 9 | KG Lead |
| **R-09** | Bus factor of one in a critical domain | 4 | 4 | 🟠 16 | CTO |
| **R-10** | LTS backport commitment quietly degrades | 4 | 3 | 🟠 12 | Release Manager |
| **R-11** | Funding pressure erodes the sovereignty default | 2 | 5 | 🟠 10 | Founder |
| **R-12** | Operational complexity exceeds operator capacity | 4 | 4 | 🟠 16 | Infrastructure Lead |
| **R-13** | Prompt injection forges assertions | 2 | 4 | 🟡 8 | Security Lead |
| **R-14** | Dependency licence change (e.g. Redis) | 3 | 3 | 🟡 9 | Research Lead |
| **R-15** | No reference deployment materialises | 3 | 5 | 🟠 15 | Founder |
| **R-16** | Reviewer rubber-stamping defeats the human gate | 4 | 5 | 🔴 20 | UX Lead |
| **R-17** | Erasure incomplete — subject data survives in a backup after a right-to-erasure request | 3 | 3 | 🟡 9 | Security Lead |
| **R-18** | Entity resolution re-identifies a pseudonymous subject by merging them with a named entity | 2 | 4 | 🟡 8 | Security Lead |

---

## Detail on the ones that matter most

### R-16 — Reviewer rubber-stamping 🔴

**Risk.** [ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md) makes
human confirmation the control that separates Witness from a system that manufactures false
institutional memory. A reviewer under time pressure clicking "confirm" on everything defeats it
entirely — and produces a record that looks *more* authoritative than an un-reviewed one.

**Why it scores highest.** It is behavioural, not technical, so no code change fixes it. It is
invisible: rubber-stamped assertions are indistinguishable from careful ones in the data. And the
pressure toward it grows exactly as adoption grows.

**Mitigation.** Measure review duration per decision and flag implausibly fast sessions ·
sample-audit confirmations against source audio · design the review UX so careful review is *faster*
than careless review · report correction rates per reviewer as a quality signal, **never** as a
performance metric used against people · train reviewers that rejecting is as valuable as confirming.

**Signal.** Median review duration falling · correction rate falling toward zero (which would mean
either perfect extraction or no real review, and it will not be the first) · sample audits finding
confirmed assertions that are wrong.

### R-01 — Ontology as unbounded research 🟠

**Risk.** Knowledge representation is a field with fifty years of unresolved debate. We could spend
two years designing an ontology and ship nothing.

**Mitigation.** Hard time-box on v0.1 · explicitly versioned and evolvable rather than
correct-first-time · [ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)
makes ontology change a projector change plus a replay, so **being wrong is affordable** · ship and
iterate.

**Signal.** Ontology work extending past its time-box · ADR-0019-style external reviews multiplying
· no working pipeline by end of Phase 4.

### R-02 — Human review bottleneck 🟠

**Risk.** A four-hour parliamentary session may produce hundreds of candidates. If review cannot keep
up, institutions cannot process their material and Witness is unusable at their volume.

**Mitigation.** Review UX as a primary product surface · confidence-based triage · batch adjudication
· keyboard-first workflows · honest queue metrics · clear guidance that **not everything needs
processing** — selective use is legitimate.

**Signal.** Review queue age growing in reference deployments · operators reporting they cannot keep
up · pressure to auto-accept (which is R-16 arriving through the front door).

### R-04 — Third-party data 🟠

**Risk.** In any meeting, people are discussed who are not present and gave no consent. We do not have
a complete answer. Recorded plainly rather than glossed.

**Mitigation.** Minimise · treat mentions of absent third parties as `confidential` by default ·
support redaction on request · **external legal review before Phase 3**.

**Signal.** Legal review finding our approach insufficient · a complaint from a mentioned third
party ·
a jurisdiction where our approach is unlawful.

### R-06 — Legitimising extractive consultation 🟠

**Risk.** Excellent documentation of a consultation could make a *bad* consultation more defensible.
An institution could use Witness to prove it consulted while changing nothing — the exact harm we
exist to reduce, wearing our own evidence as armour.

**Mitigation.** Surface to communities what was recorded and how it was used · make commitment
closure rate visible, not just commitment capture · **refuse to market Witness as consultation
compliance** · publish the consultation-reuse metric from [`VISION.md`](../../VISION.md).

**Signal.** Adopters describing Witness primarily as a compliance or audit-defence tool · high
capture with low commitment closure · community feedback that nothing changed.

### R-09 — Bus factor of one 🟠

**Risk.** Currently high and honestly acknowledged: Witness has very few contributors and several
domains have one person who understands them. This is the risk the project's entire governance
structure is designed to reduce.

**Mitigation.** Every role charter names a deputy · everything written down, nothing in private
knowledge · maintainer pathway with real merge authority · governance Stage 2 target of ≥ 3
organisations with merge authority · continuity plan tested six-monthly.

**Signal.** Any domain where one person's absence would stop a release · a lead unable to take leave
· review latency spiking when one person is away.

### R-12 — Operational complexity 🟠

**Risk.** Postgres, Neo4j, OpenSearch, Valkey, MinIO, Keycloak, NATS, Ollama, Whisper. That is a lot
for a two-person government IT team, and operability is architectural goal 4 — above performance.

**Mitigation.** Single-node Compose profile as a first-class production target · minimal
(Postgres-only) profile under evaluation · one backup target, not four
([ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md)) · runbook for every
alert ·
**every new component requires justification to the CTO**.

**Signal.** Operators abandoning deployment · support questions concentrating on operations rather than
use · cold-start time exceeding one day.

### R-11 — Funding pressure erodes sovereignty 🟠

**Risk.** Low likelihood, catastrophic impact. A funder offers resources conditioned on a hosted
offering, or on relaxing the egress default. Each individual step looks pragmatic.

**Mitigation.** Funding constraints written into [`GOVERNANCE.md`](../../GOVERNANCE.md) and
[`FUNDING.md`](FUNDING.md) · public disclosure of funding conditions · **Governance Lead's absolute
veto**, which the Founder cannot override · principle changes require Steering Committee approval.

**Signal.** Any funding discussion where the sovereignty default is on the table · a proposal for
opt-in telemetry "just to understand usage" · pressure to build a hosted offering.

---

## Architectural risks

Tracked in [`ARCHITECTURE.md` §8](../../architecture/ARCHITECTURE.md#8-known-architectural-risks) and
mirrored here: A-1 ontology scope · A-2 rebuild time · A-3 low-resource language quality · A-4 Neo4j
licensing · A-5 operational footprint · A-6 review bottleneck · A-7 prompt injection · A-8 event log
growth.

## Commercialisation programme risks

**Review cadence:** Monthly during the first 90 days, then quarterly. Scores use the register's
existing 1–5 likelihood and impact scales. `Planned` means a control is designed or scheduled, not
implemented. Evidence must be updated from observed facts.

| ID | Category | Risk | Cause | Consequence | L | I | Control | Owner role | Evidence | Residual risk | Review cadence | Status |
|---|---|---|---|---|---:|---:|---|---|---|---|---|---|
| C-R01 | Product | Willingness to pay is lower than assumed | Value and pricing have not been tested with enough buyers | No paid pilot or unsustainable discounting | 4 | 5 | Paid-default design partner programme; structured pricing interviews | Commercial Lead | Qualified opportunities, proposals and outcomes | High until paid evidence exists | Monthly | Open |
| C-R02 | Commercial | Pricing error | Catalogue/package hypotheses do not match value or procurement constraints | Lost sales or poor margin | 4 | 4 | Separate recurring/non-recurring components; record objections and outcomes | SaaS Revenue Operations Lead | Pricing evidence record | High | Monthly | Open |
| C-R03 | Commercial | Procurement delay | Institutional approvals, vendor onboarding and PO cycles are underestimated | Revenue timing slips and pilots stall | 4 | 4 | Qualify procurement path early; checklist and sponsor escalation | Enterprise Procurement Adviser | Procurement stage duration and blockers | High | Monthly | Open |
| C-R04 | Product | Consulting/customisation creep | Design-partner requests bypass product classification | Forked product, weak recurring value and support burden | 4 | 5 | Configuration-before-customisation; explicit approval and separate pricing | Product Director | Request classification decisions | High | Monthly | Open |
| C-R05 | Commercial | Non-renewal | Pilot completion is mistaken for customer value | One-off revenue without recurring business | 4 | 5 | Baseline/evaluation/renewal lifecycle and explicit outcomes | Institutional Customer Success Lead | Renewal reviews and measured value | High | Monthly | Open |
| C-R06 | Financial | Customer concentration | Early revenue depends on one institution | Material revenue loss or roadmap capture | 4 | 4 | Concentration reporting; reusable core; diversify qualified pipeline | Commercial Lead | Revenue/prospect concentration | High | Monthly | Open |
| C-R07 | Engineering | Tenant leakage | Missing scope filter, IDOR or absent database defence-in-depth | Confidential governance/commercial disclosure | 2 | 5 | Application scoping; adversarial tests; planned RLS | Security Lead | Test evidence and security review | High until C3 isolation and RLS evidence | Each release | Open |
| C-R08 | Engineering | Migration failure or historical corruption | Commercial migrations alter or misapply existing state | Outage, lost history or incorrect commercial state | 3 | 5 | Additive migrations; fresh/upgrade validation; forward-fix plan | Backend Lead | Migration-chain and upgrade reports | High until C3 evidence | Each migration | Open |
| C-R09 | Operations | Failed restore | Backup omits objects/configuration or restore is untested | Governance evidence or commercial state unavailable | 3 | 5 | Full database/object synthetic destruction-and-restore drill | Platform Reliability Lead | Timed restore and verification report | High until drill passes | Quarterly | Open |
| C-R10 | Security | Settlement duplication | Repeated/concurrent reconciliation is applied twice | Duplicate access/revenue state and audit inconsistency | 3 | 5 | Unique evidence, idempotency and atomic exactly-once applicator | Backend Lead | C3 concurrency/adversarial tests | High; control planned only | Each release | Planned |
| C-R11 | Engineering | Entitlement inconsistency | Settlement, subscription and entitlement writes diverge | Paid customer lacks access or unpaid access is granted | 3 | 5 | Witness-owned state; atomic transition; stale-intent check | Principal Architect | Invariant and recovery tests | High; control planned only | Each release | Planned |
| C-R12 | Security | Invoice tampering | Mutable issued values, IDOR or unsafe rendering | Fraud, customer harm or loss of trust | 3 | 5 | Immutable snapshots, authentication, escaping and audit | Security Lead | C3 security tests and review | High; capability not implemented | Each release | Planned |
| C-R13 | Security | Commercial-admin escalation | Broad organisation admin or compromised operator can reconcile/activate improperly | Fraudulent settlement or access | 3 | 5 | Least-privilege action, strong auth, audit and optional dual review | Security Lead | Authorization tests and access review | High; control planned only | Monthly | Planned |
| C-R14 | Security | Credential leakage | Billing/remittance or provider secrets enter code, logs or audit | Financial/security compromise | 2 | 5 | Secret configuration, redaction, scanning; never store bank login/card data | Security Lead | Gitleaks, log review and configuration tests | Medium | Each release | Open |
| C-R15 | Operations | Support burden exceeds capacity | Founder-led pilots and dedicated deployments require unpriced effort | Poor service, burnout and negative margin | 4 | 4 | Explicit support configuration; measure effort; bound pilot scope | Institutional Customer Success Lead | Support hours, incidents and escalations | High | Monthly | Open |
| C-R16 | Financial | Infrastructure cost exceeds revenue | Dedicated hosting/storage/compute is underpriced | Negative contribution margin | 3 | 4 | Package decomposition and later attributable-cost reporting | SaaS Revenue Operations Lead | Deployment cost and settled revenue | High until measured | Monthly | Open |
| C-R17 | Financial | AI cost volatility | Model/provider or compute demand changes materially | Margin erosion or unusable allowance | 3 | 4 | Local-first option, measured server usage and explicit assumptions | AI Lead | Compute usage/cost evidence | Medium-high | Monthly | Open |
| C-R18 | Legal / Compliance | Data residency mismatch | Proposal or deployment claim exceeds verified topology/configuration | Contract breach or sensitive-data exposure | 2 | 5 | Deployment go/no-go; evidence-based security responses | Security Lead | Deployment verification and customer approval | Medium-high | Per pilot | Open |
| C-R19 | Legal / Compliance | Contractual overcommitment | Templates or sales claims invent SLA, compliance, tax or legal conclusions | Liability and delivery failure | 3 | 5 | Professional-review placeholders; claim reconciliation; authorised approval | Commercial Lead | Reviewed proposal/contract record | High | Per proposal | Open |

## Closed risks

*None yet — the project is young enough that nothing has been resolved or fallen away.*

## Quarterly review

The Governance Lead and CTO review: new risks · score changes with justification · whether any signal
has fired · whether mitigations were actually implemented or merely written down · risks that can be
closed.

**A register nobody audits is a graveyard**, and a graveyard is indistinguishable from having no
register. Missed reviews are themselves reported to the Steering Committee.
