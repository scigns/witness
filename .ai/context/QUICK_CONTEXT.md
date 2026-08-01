# Quick Context

**Owner:** Principal Architect
**Status:** Active
**Purpose:** the condensed briefing. Read [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) for the
authoritative version — this is a summary, not a substitute.

---

## What Witness is

Open-source Digital Public Infrastructure that turns meetings, consultations and parliamentary
sessions into a **provenance-backed knowledge graph** of People, Communities, Organisations, Projects,
Meetings, Policies, Evidence, Risks, Decisions, Actions, Commitments, Locations and Topics.

Not a transcription tool. A transcript is an intermediate artefact.

**The test every feature must pass:** _"Who committed to what, on whose behalf, on what evidence,
under what consent — and can I prove it five years later when everyone involved has left?"_

## The architecture in five facts

1. **PostgreSQL is the system of record.** Neo4j, OpenSearch and pgvector are disposable projections,
   rebuildable from the event log. ([ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md))
2. **Consent is enforced by the type system and the message topology**, not by remembering to check.
   ([ADR-0008](../../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md))
3. **Provenance is a non-nullable field.** No assertion exists without a chain to a source utterance,
   a model version and a confirming human. ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md))
4. **The sovereign profile makes zero external network calls**, and a misconfigured instance refuses
   to start. ([ADR-0009](../../architecture/decisions/ADR-0009-ai-abstraction-and-model-sovereignty.md))
5. **Hexagonal architecture.** The domain layer imports nothing. Everything replaceable behind a port.
   ([ADR-0003](../../architecture/decisions/ADR-0003-hexagonal-ddd-clean-architecture.md))

## The flow

```text
Recording → Transcription (Whisper, local) → Extraction (LLM → candidates)
  → HUMAN REVIEW ← the gap here is the entire ethical position of the product
  → Assertion (Postgres, system of record)
  → Projections (Neo4j graph · OpenSearch lexical · pgvector semantic)
```

Everything before human review is a **proposal**. Everything after is **institutional record**.

## Layering

```text
adapters (infra) → application (use cases) → domain (pure)
```

`packages/domain` imports nothing but the standard library. Time and identity are injected. Enforced
by lint, not by discipline.

## Where things live

| Need                    | Path                  |
| ----------------------- | --------------------- |
| Domain model            | `packages/domain/`    |
| API and event contracts | `packages/contracts/` |
| Backend services        | `services/`           |
| Async processors        | `workers/`            |
| Web and admin apps      | `apps/`               |
| Architecture and ADRs   | `architecture/`       |
| Process documentation   | `docs/engineering/`   |
| Role charters           | `agents/`             |

## Current state

**Phase 1 — Architecture & research**, with a **Developer Preview (0.1.0)** that proves the
foundation end to end: capture a record, store it, display it, show its provenance, and let a human
accept or reject it. Domain, configuration, API and web all exist and are tested.

What is deliberately **not** built: AI extraction, transcription, the knowledge graph projection, the
consent service, and Keycloak/Casbin authentication. The running instance lists every one of these at
`/ready` and renders the list on its dashboard, so nothing has to be guessed at.

The reason the pipeline is not built yet is unchanged: consent and provenance are cross-cutting
invariants, and any assertion written before they are enforceable is permanently untrustworthy.

Live picture: [`STATUS.md`](../../STATUS.md).

## Before you write code

Read [`docs/engineering/AGENT_HANDOFF_PROTOCOL.md`](../../docs/engineering/AGENT_HANDOFF_PROTOCOL.md).

It exists because of one specific failure: a capable contributor, given a narrow task, reasons from
first principles and redesigns something already decided. The redesign is often locally sensible and
still wrong, because the decision it overturns carried context — funding, procurement, a legal
constraint — that is invisible from inside the task.

The short version: work your assigned row in
[`DEPARTMENT_ASSIGNMENTS.md`](../../docs/engineering/DEPARTMENT_ASSIGNMENTS.md), change only what your
department owns ([`DEPARTMENTS.md`](../../docs/engineering/DEPARTMENTS.md)), and when you find a
decision that is not yours to make, **write it down and hand it back rather than picking the
sensible-looking default.**
