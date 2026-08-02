# ADR-0005: Event-driven backbone with NATS JetStream

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Backend Lead, Infrastructure Lead, Principal Architect |
| **Related** | ADR-0004, ADR-0011 |
| **Principles engaged** | P7 (boring technology), and it introduces technology not in the original stack — hence this ADR |

## Context

Witness needs reliable asynchronous communication:

- Transcription of a four-hour parliamentary session takes hours and must not block anything
- Extraction runs after transcription, projection after confirmation, indexing after projection
- **Consent revocation must fan out to every data-holding service with a 5-minute SLO**
- A failure anywhere must be retryable without data loss or duplicate side effects

Synchronous HTTP between services would couple availability (transcription being down would block
ingestion) and provide no durable retry. We need durable, at-least-once delivery with consumer
groups.

**NATS JetStream was not in the specified technology stack**, so per the working rules it requires
an ADR naming what it replaces and why the existing stack is insufficient. That is this document.

## Decision

> We will use the **transactional outbox pattern in PostgreSQL** as the durability guarantee, with
> **NATS JetStream** as the transport for event distribution between services and workers.

Two profiles:

- **Standard** — Postgres outbox → relay → NATS JetStream → consumers
- **Minimal** — Postgres outbox → in-process polling dispatcher, no broker, for the smallest
  single-node deployments

Both use identical application code behind `EventBusPort`. The profile is a deployment choice.

## Options considered

### Option A — Apache Kafka

The default answer for event-driven systems.
**Pros:** the most battle-tested event log in existence; enormous ecosystem; excellent for replay and
stream processing; every consultant knows it.
**Cons:** operationally heavy — JVM tuning, KRaft or ZooKeeper, partition and consumer-group
management, rebalancing pathologies. For a two-person ministry IT team this is a substantial and
ongoing burden. Our throughput is thousands of events per day, not millions per second; we would be
paying Kafka's operational cost for none of its benefit. **Rejected on operability**, which is
architectural goal 4 and above performance.

### Option B — Redis Streams

**Pros:** Redis is already in the stack — no new technology at all, which is the strongest argument
available under principle P7.
**Cons:** persistence guarantees are weaker than we need for consent revocation; consumer group
semantics are workable but less mature; and it would make Redis a durable component, contradicting
ADR-0004's placement of Redis as strictly ephemeral. That contradiction is what tipped it. Also, the
Redis licensing situation (see `TECH_STACK.md`) makes expanding our dependence on it unwise.

### Option C — RabbitMQ

**Pros:** mature, well understood, good routing.
**Cons:** a message queue rather than an event log — replay and multiple independent consumers with
independent cursors are awkward, and both are central to our projection model. Erlang operational
knowledge is a scarcer skill in our operator population than it looks.

### Option D — PostgreSQL only, using `LISTEN/NOTIFY` plus an outbox table

**Pros:** zero new technology; one fewer thing to operate; genuinely sufficient at small scale.
**Cons:** `LISTEN/NOTIFY` payloads are size-limited and notifications are lost if no listener is
connected, so it needs polling as a backstop; no consumer-group semantics; connection-count pressure
with many consumers; poor fan-out at scale.
**Adopted as the "minimal" profile** rather than rejected — for a single-agency deployment processing
a few hundred meetings a year, this is the right answer and we should not force a broker on them.

### Option E — NATS JetStream *(chosen for the standard profile)*

**Pros:** single ~15 MB Go binary, no JVM, no ZooKeeper; embeddable for single-node; durable streams
with configurable retention; consumer groups with independent cursors; at-least-once delivery; simple
enough that an operator can actually understand it from the runbook; Apache-2.0 under CNCF
governance.
**Cons:** smaller ecosystem than Kafka; fewer engineers have prior experience; some advanced stream
processing patterns are less developed.

## Consequences

### Positive

- Services are decoupled in availability — transcription being down queues work rather than failing
  ingestion.
- Durable retry with dead-lettering for poison messages.
- Consent revocation fan-out has a reliable delivery mechanism with a measurable SLO.
- Operationally light enough for the target operator, unlike Kafka.
- The minimal profile means small institutions run one fewer service.

### Negative

- One more component to run, monitor and back up in the standard profile.
- Eventual consistency is now user-visible; the UI must show honest processing status.
- Contributors need to understand at-least-once semantics, and every consumer must be idempotent —
  a real cognitive load that we will pay for in review time.
- Two profiles means two paths to test. Mitigated by identical application code behind the port.

### Risks accepted

- NATS is less widely known than Kafka; hiring and community support are thinner. Mitigated by the
  port abstraction — a Kafka adapter is a bounded piece of work if we ever need it.
- Duplicate delivery causing duplicate side effects if a consumer's idempotency is wrong. Mitigated
  by a shared idempotency helper and a mandatory review checklist item.

## Compliance and enforcement

- All publishing goes through the outbox. **Direct broker publishing from application code is
  forbidden** and caught by a lint rule — publishing outside the transaction is the classic way this
  pattern is silently broken.
- Every consumer implements idempotency keyed on CloudEvents `id`; a shared base class provides it,
  and a contract test verifies each consumer handles duplicate delivery.
- Consumer registration is validated against the event catalogue in CI.
- Dead-letter depth and consumer lag are alerted metrics.

## Reversal

`EventBusPort` means swapping to Kafka, Redis Streams or Postgres-only is an adapter change plus an
operational migration, not an application rewrite. Estimate: one to two weeks plus a drain-and-cutover
window. We would revisit if throughput exceeded roughly 10,000 events/second sustained, or if
operator feedback showed NATS was a support burden — the latter being the more likely trigger, and we
should ask about it explicitly in reference deployments.

## References

- [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream) · [CloudEvents](https://cloudevents.io/)
- [Transactional outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [`EVENT_CATALOGUE.md`](../EVENT_CATALOGUE.md)
