# Workers

**Owner:** Backend Lead (AI Lead for transcription and extraction)
**Status:** Phase 4–5 deliverable

Asynchronous processors consuming events from NATS JetStream.

| Worker | Consumes | Produces |
|---|---|---|
| [`transcription/`](transcription/) | `capture.session.consent_cleared.v1` | `transcription.completed.v1` |
| [`extraction/`](extraction/) | `transcription.completed.v1` | `extraction.candidates.proposed.v1` |
| [`graph-projector/`](graph-projector/) | `knowledge.assertion.confirmed.v1` | Neo4j projection |
| [`indexing/`](indexing/) | assertion and entity events | OpenSearch and pgvector projections |
| [`notification/`](notification/) | commitment and review events | Notifications |

## The gate worth understanding

**The transcription worker subscribes to `consent_cleared`, not to `media.ingested`.**

Media without cleared consent is stored encrypted and never enters the pipeline. The consent gate is
in the shape of the system — the message topology — rather than in a conditional someone might forget
to write ([ADR-0008](../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md)).

## Rules

- **Every consumer is idempotent**, keyed on the CloudEvents `id`. At-least-once delivery is assumed;
  exactly-once is a fiction we do not build on.
- **Everything is resumable.** A four-hour parliamentary session cannot restart from zero on a
  transient failure.
- Assume out-of-order delivery across aggregates. Ordering holds per aggregate only.
- Publish through the transactional outbox, never directly to the broker.
