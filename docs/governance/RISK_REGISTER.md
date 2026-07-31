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

**Signal.** Ontology work extending past its time-box · ADR-0019-style external reviews multiplying ·
no working pipeline by end of Phase 4.

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

**Signal.** Legal review finding our approach insufficient · a complaint from a mentioned third party ·
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

**Signal.** Any domain where one person's absence would stop a release · a lead unable to take leave ·
review latency spiking when one person is away.

### R-12 — Operational complexity 🟠

**Risk.** Postgres, Neo4j, OpenSearch, Valkey, MinIO, Keycloak, NATS, Ollama, Whisper. That is a lot
for a two-person government IT team, and operability is architectural goal 4 — above performance.

**Mitigation.** Single-node Compose profile as a first-class production target · minimal
(Postgres-only) profile under evaluation · one backup target, not four
([ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md)) · runbook for every alert ·
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

## Closed risks

*None yet — the project is young enough that nothing has been resolved or fallen away.*

## Quarterly review

The Governance Lead and CTO review: new risks · score changes with justification · whether any signal
has fired · whether mitigations were actually implemented or merely written down · risks that can be
closed.

**A register nobody audits is a graveyard**, and a graveyard is indistinguishable from having no
register. Missed reviews are themselves reported to the Steering Committee.
