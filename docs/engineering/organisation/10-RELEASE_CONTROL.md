# Release Control

**Owner:** Release Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`RELEASE_STRATEGY.md`](../RELEASE_STRATEGY.md) ·
[`../../ROADMAP.md`](../../../ROADMAP.md)

---

## What this adds

[`RELEASE_STRATEGY.md`](../RELEASE_STRATEGY.md) is authoritative for cadence, versioning rules, the
release checklist and release roles. It does not map version numbers to the phase gates that produce
them. This file adds that mapping only.

**No dates are given below.** The repository contains no approved release schedule — `ROADMAP.md`
sequences by dependency, explicitly not by date (`PHASE_EXECUTION_PLAN.md`: *"sequenced by
dependency, not by demo appeal"*). A date here would be invented, which is exactly what this
project's own discipline (see `NFR_SLO.md` §6, `ACCESSIBILITY_I18N_STRATEGY.md` §5) treats as worse
than an acknowledged gap.

## Checkpoints

| Version | Name | Produced by | Capability gate (not marketing) |
|---|---|---|---|
| 0.1.x | Developer Preview hardening | Phase 1 in-progress work | Current: capture → review → confirm → audit trail, one narrow workflow, no auth, no AI. Hardening = fixing defects found in the preview, not adding capability |
| 0.2.0 | Phase 1 architecture baseline complete | Phase 1 exit gate | Every deliverable 1.1–1.11 `COMPLETE` per `04-WORK_PACKAGE_REGISTER.md`; ADRs 0001–0021 accepted or explicitly deferred with an owner |
| 0.3.0 | Phase 2 foundation | Phase 2 exit gate | `make bootstrap && make dev-full && make app` works from a clean clone; no unauthenticated path to data exists (Keycloak + Casbin replace the development adapter) |
| 0.4.0 | Consent and identity integration | Phase 3 partial (3.4, 3.5) | Consent service enforced; tenant isolation adversarially verified |
| 0.5.0 | Retrieval and knowledge foundations | Phase 3 exit gate + Phase 4 start | Event log/outbox, audit append-only trigger, GraphQL BFF; knowledge graph projection begins |
| 0.6.0 | Transcription/extraction workflow | Phase 5 partial | LiteLLM gateway, local inference, evaluation harness, transcription — before extraction, per `PHASE_EXECUTION_PLAN.md`'s deliberate ordering |
| 0.7.0 | Multi-user institutional pilot | Phase 5 exit gate + Phase 6 partial | Human review queue; no model output reaches the graph without provenance and human confirmation, demonstrated by attempting to bypass it |
| 0.8.0 | Sovereign deployment candidate | Phase 7 partial | Air-gapped installation proven; SBOM, signing, SLSA level 3 |
| 0.9.0 | Release candidate | Phase 7 exit gate | External audit findings remediated or formally accepted with expiry dates |
| 1.0.0 | Production release | Phase 8 exit gate | Three institutions running Witness in production, at least one not deployed by this project — verified by Founder and Steering Committee, not self-declared |

## How a checkpoint gets a date

Only when the Founder / Product Authority approves one, recorded as a decision in
[`docs/governance/DECISIONS.md`](../../governance/DECISIONS.md) — the same discipline
`docs/governance/DECISIONS.md`'s D-000 entry establishes for every other process decision. This
control plane does not have authority to set one.
