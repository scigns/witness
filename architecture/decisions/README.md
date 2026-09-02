# Architecture Decision Records

Every decision that is expensive to reverse is recorded here, with its reasoning, its alternatives
and its costs.

**Why we do this:** in 2034, someone will look at a design choice and think it is obviously wrong.
They will be right about a third of the time. The other two thirds, there was a reason, and without
this directory that reason is gone along with the person who knew it. Undocumented decisions get
re-litigated, then re-made badly, then re-made again.

An ADR is **immutable once accepted.** We do not edit history — we supersede it with a new ADR. The
record of having been wrong is part of the value.

## Index

| # | Title | Status | Principles |
|---|---|---|---|
| [0000](ADR-0000-record-architecture-decisions.md) | Record architecture decisions | Accepted | P6 |
| [0001](ADR-0001-monorepo-strategy.md) | Adopt a monorepo | Accepted | P6 |
| [0002](ADR-0002-licensing-strategy.md) | Licensing strategy | Accepted | P1 |
| [0003](ADR-0003-hexagonal-ddd-clean-architecture.md) | Hexagonal architecture with DDD | Accepted | P6, P7 |
| [0004](ADR-0004-polyglot-persistence.md) | Polyglot persistence | Accepted | P6, P7 |
| [0005](ADR-0005-event-driven-backbone.md) | Event-driven backbone with NATS JetStream | Accepted | P7 |
| [0006](ADR-0006-api-strategy.md) | API strategy — GraphQL BFF plus versioned REST | Accepted | P6 |
| [0007](ADR-0007-identity-and-access.md) | Identity with Keycloak, authorisation with Casbin | Accepted | P1 |
| [0008](ADR-0008-consent-as-a-domain-primitive.md) | Consent as a domain primitive | Accepted | **P2** |
| [0009](ADR-0009-ai-abstraction-and-model-sovereignty.md) | AI abstraction and model sovereignty | Accepted | **P1**, P4 |
| [0010](ADR-0010-transcription-pipeline.md) | Transcription pipeline | Accepted | P1, P8 |
| [0011](ADR-0011-knowledge-graph-as-projection.md) | Knowledge graph as a projection | Accepted | **P3**, P6 |
| [0012](ADR-0012-provenance-and-human-in-the-loop.md) | Provenance and human-in-the-loop | Accepted | **P3, P4** |
| [0013](ADR-0013-tenancy-and-deployment-topology.md) | Tenancy and deployment topology | Accepted | P1, P6 |
| [0014](ADR-0014-observability-with-opentelemetry.md) | Observability with OpenTelemetry | Accepted | P1, P7 |
| [0015](ADR-0015-branching-and-integration-strategy.md) | Branching and integration strategy | Accepted | P6 |
| [0016](ADR-0016-build-system-and-package-management.md) | Build system and package management | Accepted | P7 |
| [0017](ADR-0017-versioning-and-release-strategy.md) | Versioning and release strategy | Accepted | P6 |
| [0018](ADR-0018-hybrid-search-architecture.md) | Hybrid search architecture | Accepted | P6 |
| [0019](ADR-0019-indigenous-data-sovereignty.md) | Indigenous data sovereignty | Accepted | **P5** |
| [0020](ADR-0020-offline-first-and-low-connectivity.md) | Offline-first and low connectivity | Accepted | **P8** |
| [0021](ADR-0021-canonical-scope-and-architecture-reconciliation.md) | Canonical scope and architecture reconciliation | Accepted | P1, P6, P7 |
| [0022](ADR-0022-billing-and-payments-as-replaceable-ports.md) | Billing and payments as replaceable ports | Proposed | P1, P6, P7 |
| [0023](ADR-0023-organisation-as-the-commercial-aggregate.md) | Organisation as the commercial aggregate | Proposed | P1, P3, P6, P7 |
| [0024](ADR-0024-server-managed-browser-sessions.md) | Server-managed browser sessions | Proposed | P1, P6, P7 |

Bold principles indicate an ADR that is a primary expression of that principle. Changing one of
those requires Steering Committee approval, and where consent, provenance or Indigenous data
sovereignty is weakened, the Governance Lead holds an absolute veto ([`GOVERNANCE.md`](../../GOVERNANCE.md)).

## Writing an ADR

```bash
make adr TITLE="use content-addressed media storage"
```

Or copy [`templates/adr/ADR-TEMPLATE.md`](../../templates/adr/ADR-TEMPLATE.md) manually.

## Statuses

| Status | Meaning |
|---|---|
| **Proposed** | Open for discussion. Minimum 7 days before acceptance |
| **Accepted** | In force. Binding on all contributors |
| **Rejected** | Considered and declined. **Kept, not deleted** — knowing what we ruled out is as valuable as knowing what we chose |
| **Deprecated** | No longer applies; nothing replaced it |
| **Superseded** | Replaced by a later ADR, which is linked |

## When to write one

Write an ADR if the decision:

- introduces, removes or replaces a technology
- changes a service or context boundary
- changes the data model or the ontology's core types
- affects consent, provenance, security or sovereignty
- establishes a pattern others are expected to follow
- would make a new contributor ask "why on earth is it done this way?"

**If in doubt, write one.** A rejected ADR costs an hour. An undocumented decision costs a year.

Process detail: [`docs/engineering/ADR_PROCESS.md`](../../docs/engineering/ADR_PROCESS.md).
