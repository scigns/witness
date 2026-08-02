# Non-Functional Requirements & Service Level Objectives

**Owner:** CTO
**Status:** Draft — Phase 1 deliverable 1.10. Pending review and sign-off by Principal Architect and
CTO per [`PHASE_EXECUTION_PLAN.md`](../docs/engineering/PHASE_EXECUTION_PLAN.md). Not
self-certified — see that document's rule that an exit gate is verified by the named department,
not the implementer.
**Related:** [`DEPLOYMENT_ARCHITECTURE.md`](DEPLOYMENT_ARCHITECTURE.md) ·
[`docs/engineering/CI_CD.md`](../docs/engineering/CI_CD.md) ·
[`docs/governance/RISK_REGISTER.md`](../docs/governance/RISK_REGISTER.md) ·
[ADR-0011](decisions/ADR-0011-knowledge-graph-as-projection.md) ·
[ADR-0013](decisions/ADR-0013-tenancy-and-deployment-topology.md)

---

## What this document is

[`ROADMAP.md`](../ROADMAP.md) deliverable 1.10 requires latency, throughput, availability and
recovery objectives to be **quantified** before Phase 1 can close. Several of these were already
decided piecemeal — in `DEPLOYMENT_ARCHITECTURE.md`, in `CI_CD.md`, in the risk register — while
building the Developer Preview. This document is not new decision-making. It is the single place
those figures live, so a reviewer checking the Phase 1 exit gate does not have to reconstruct them
from five files, and so nothing quantifiable is silently missing.

**Discipline.** Every row below is either a number with its source, or an explicit `TBD` with an
owner and the phase that must produce it. Per the Phase 1 exit gate: *"No unanswered 'we'll figure
that out later' on any load-bearing decision."* A blank cell is not an option; an honest `TBD` is.

---

## 1. Availability and recovery

Restated from [`DEPLOYMENT_ARCHITECTURE.md` §4](DEPLOYMENT_ARCHITECTURE.md#4-availability-and-recovery),
which remains the source of truth if the two ever disagree.

| Objective | Single node (default) | Clustered |
|---|---|---|
| Availability target | 99% (business hours) | 99.9% |
| **RPO** (data loss on failure) | ≤ 24 h nightly, or ≤ 15 min with WAL shipping | ≤ 15 min |
| **RTO** (time to restore) | ≤ 8 h | ≤ 4 h |

**Decided by:** Infrastructure Lead,
[ADR-0013](decisions/ADR-0013-tenancy-and-deployment-topology.md).
**Verified by:** quarterly recovery drill (`DEPLOYMENT_ARCHITECTURE.md` §4) — an untested backup
is a hypothesis, not an RTO.

## 2. Consent — the hardest guarantee

| Objective | Target | Source |
|---|---|---|
| Consent revocation propagation to every projection | **p99 ≤ 300 s** | `DEPLOYMENT_ARCHITECTURE.md` §6, `consent_revocation_propagation_seconds` — paged on breach |

This is called out separately because it is the one SLO the architecture treats as a page-worthy
incident rather than a warning. INV-10 (roadmap Phase 3) makes it executable, not just monitored.

## 3. Scale envelope

Restated from [`DEPLOYMENT_ARCHITECTURE.md` §§1, 3](DEPLOYMENT_ARCHITECTURE.md#1-deployment-profiles).

| Profile | Target users | Deployment size | Meetings/yr |
|---|---|---|---|
| `sovereign` (default) | 1–5,000 | Small–Medium | < 5,000 |
| `hybrid` | 1–20,000 | Medium–Large | < 50,000 |

These figures bound every throughput number below — Witness is sized for an institution, not
internet-scale multi-tenancy. A design that requires internet-scale assumptions to meet its SLOs is
solving the wrong problem; see [ADR-0013](decisions/ADR-0013-tenancy-and-deployment-topology.md).

## 4. CPU-only transcription throughput

| Objective | Value | Source |
|---|---|---|
| Real-time factor, single node, no GPU | 6–10× slower than realtime | `DEPLOYMENT_ARCHITECTURE.md` §2 |

Stated as a constraint, not a target: a one-hour meeting takes 6–10 hours without a GPU. Acceptable
for overnight batch processing on the default profile; documented so an operator without a GPU is not
surprised by it in production.

## 5. Engineering throughput (process SLO, not product)

| Objective | Value | Source |
|---|---|---|
| CI pipeline duration, p95 | < 10 minutes per pull request | `docs/engineering/CI_CD.md` |

Included because it is quantified, enforced (treated as a defect with an owner if breached), and
governs how fast every other deliverable in this roadmap can move.

---

## 6. Not yet quantified

These are load-bearing and currently undecided. Each has an owner and the phase gate that requires
the number to exist before it can close — not silence, an explicit deferral.

| # | Objective | Why it is not yet a number | Owner | Required by |
|---|---|---|---|---|
| NFR-1 | API latency (REST + GraphQL), p50/p95 | No API implementation exists yet to measure against; setting a target before contract v0.1 (1.5) risks designing to a made-up number | Backend Lead | Phase 3 exit gate (3.6 GraphQL BFF) |
| NFR-2 | Sustained write throughput (records/sec, events/sec) | Depends on the event log and outbox design (3.3), not yet built | Backend Lead | Phase 3 exit gate |
| NFR-3 | Review queue latency / throughput | Flagged as **R-02**, a top risk, precisely because no target exists yet; setting one without evidence from real reviewers would be a guess dressed as an SLO | Product Director | Phase 5 evaluation harness (5.3), before the review queue UX (5.6) ships |
| NFR-4 | Knowledge graph projection rebuild time bound | INV-9 (Phase 4 exit gate) requires a *correct* rebuild from the event log; it does not yet require a *timed* one. **R-08** flags rebuild-exceeds-maintenance-window as a live risk at scale | Knowledge Graph Lead | Phase 4 exit gate |
| NFR-5 | Extraction pipeline latency (audio in → candidate out) | No extraction pipeline exists; premature before the evaluation harness (Phase 5 PR 3, deliberately sequenced before the pipeline itself) | AI Lead | Phase 5 exit gate |
| NFR-6 | Concurrent request capacity at Large deployment scale (10,000 users) | Sizing table (§3) states hardware, not achieved request rate; no load test has run | Infrastructure Lead | Phase 7 — Performance & scale testing (7.2) |

**Do not fill these in speculatively.** A target set without evidence is worse than an acknowledged
gap — it produces false confidence and gets treated as a real number by the next person who reads it.
This is the same discipline `test/invariants/invariants.test.ts` uses for invariants whose subject
does not exist yet: listed with the phase that brings them, not stubbed as passing.

---

## 7. How this document is kept honest

- Every number here traces to a source that already justified it (an ADR, an architecture document,
  or a measured CI metric) — this document does not introduce new targets, only consolidates them.
- Every `TBD` names an owner and a phase gate. A `TBD` that survives past its named phase gate is a
  defect in that phase's exit review, not in this document.
- If a number in this document and its source document disagree, the source document
  (`DEPLOYMENT_ARCHITECTURE.md`, `CI_CD.md`) wins, and this document has drifted — file it as a
  documentation defect against D2.
