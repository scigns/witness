# Event Catalogue

**Owner:** Backend Lead
**Status:** Draft v0.1 — Phase 1 deliverable 1.4
**Contract home:** `packages/contracts/events` (AsyncAPI 3.0)

Events are the integration contract between bounded contexts. They are versioned, published
artefacts — changing one breaks other people's systems, so they are treated with the same care as
a public API.

---

## 1. Envelope

All events use the [CloudEvents 1.0](https://cloudevents.io/) envelope, so operators can route them
with off-the-shelf tooling.

```json
{
  "specversion": "1.0",
  "type": "org.witness.knowledge.assertion.confirmed.v1",
  "source": "/witness/services/curation",
  "id": "01J8XQ...",
  "time": "2027-03-04T00:14:22.481Z",
  "subject": "assertion/01J8XR...",
  "datacontenttype": "application/json",
  "dataschema": "https://schemas.witness.org/events/assertion-confirmed/1.2.0.json",
  "witnesstenant": "01J8AA...",
  "witnesstraceparent": "00-4bf92f...-00f067aa0ba902b7-01",
  "witnesscausationid": "01J8XP...",
  "witnesscorrelationid": "01J8XM...",
  "data": { }
}
```

| Extension | Purpose |
|---|---|
| `witnesstenant` | Tenant scope. Consumers **must** filter on it; brokers are not a security boundary |
| `witnesstraceparent` | W3C trace context, so an async pipeline is one trace end to end |
| `witnesscausationid` | The event that directly caused this one |
| `witnesscorrelationid` | The originating user action — lets you reconstruct a whole workflow |

## 2. Naming and versioning

```text
org.witness.<context>.<aggregate>.<past-tense-verb>.v<major>
```

Events are named in the **past tense** because they are facts that have already happened. An event
named `CreateSession` is a command wearing a costume, and it will cause a design failure later.

| Change | Version impact |
|---|---|
| Add an optional field | Patch — consumers ignore unknown fields |
| Add a required field | **Major** — new event type; both published during transition |
| Remove or rename a field | **Major** |
| Change semantics without changing shape | **Major** — the most dangerous kind, and the easiest to do by accident |

Major versions are published in parallel for at least one LTS cycle. Consumers declare which
versions they handle; an unhandled version is a loud failure, never a silent skip.

## 3. Delivery guarantees

| Property | Guarantee |
|---|---|
| Delivery | **At-least-once.** Exactly-once is not offered because it does not exist |
| Ordering | Per aggregate only. Global ordering is never assumed |
| Idempotency | **Consumer responsibility**, keyed on event `id`. Non-negotiable |
| Durability | Transactional outbox — state change and event commit atomically in Postgres |
| Retention | 30 days in NATS JetStream; the Postgres `event_log` is the permanent record |
| Poison messages | 5 attempts with exponential backoff, then dead-letter with an alert |

## 4. Catalogue

### Identity & tenancy

| Event | Payload | Consumers |
|---|---|---|
| `identity.tenant.provisioned.v1` | tenant, residency, profile | all services (bootstrap) |
| `identity.user.registered.v1` | user, tenant, roles | notification, audit |
| `identity.role.assigned.v1` | user, role, scope, grantor | authz cache, audit |
| `identity.user.deactivated.v1` | user, reason, effective_at | authz cache, review reassignment |

### Consent — the highest-consequence events in the system

| Event | Payload | Consumers |
|---|---|---|
| `consent.grant.recorded.v1` | grant, subject, scopes, legal_basis, capture_method, evidence_ref | ingestion, audit |
| `consent.grant.expired.v1` | grant, expired_at | ingestion, projector, search |
| `consent.grant.revoked.v1` | grant, subject, revoked_at, reason, scope | **all data-holding services** |
| `consent.delegation.recorded.v1` | grant, delegate, authority_basis | consent, audit |
| `consent.erasure.requested.v1` | subject, scope, requested_at | all data-holding services |
| `consent.erasure.completed.v1` | request, verification_hash, stores_verified[] | audit, notification |

**`consent.grant.revoked.v1` has a 5-minute SLO** to full propagation across every projection,
index, embedding and cache. It is the only event with a hard latency guarantee, it is monitored
with a paging alert, and failure to meet it is a P0 incident.

### Ingestion & media

| Event | Payload | Consumers |
|---|---|---|
| `capture.session.created.v1` | session, workspace, type, occurred_at, convener | consent, projector |
| `capture.session.consent_cleared.v1` | session, grants[] | **gate: transcription may now begin** |
| `capture.media.ingested.v1` | media, session, checksum, duration, storage_key | transcription |
| `capture.media.rejected.v1` | media, reason | notification, audit |
| `capture.document.ingested.v1` | document, session?, mime, checksum | document processing |
| `capture.media.retention_expired.v1` | media, policy | storage lifecycle, audit |

`capture.session.consent_cleared.v1` is the enforcement point of principle P2. The transcription
worker subscribes to **this**, not to `media.ingested`. Media without cleared consent is stored
encrypted and never processed. The gate is structural, not procedural.

### Transcription

| Event | Payload | Consumers |
|---|---|---|
| `transcription.started.v1` | media, engine, model, language_hint | observability |
| `transcription.completed.v1` | transcript, utterance_count, language, wer_estimate | extraction, indexing |
| `transcription.failed.v1` | media, error_class, attempt | alerting, dead letter |
| `transcription.speaker_mapped.v1` | transcript, label, subject, method, confidence | projector, audit |
| `transcription.utterance_redacted.v1` | utterance, reason, actor | projector, search, audit |

### Extraction & curation

| Event | Payload | Consumers |
|---|---|---|
| `extraction.run.started.v1` | run, transcript, model, model_version, prompt_hash | observability |
| `extraction.candidates.proposed.v1` | run, candidates[] (with source spans + confidence) | curation queue |
| `extraction.run.failed.v1` | run, error_class | alerting |
| `curation.candidate.confirmed.v1` | candidate, reviewer, decided_at | **assertion creation** |
| `curation.candidate.corrected.v1` | candidate, reviewer, corrected_payload, rationale | assertion creation, eval set |
| `curation.candidate.rejected.v1` | candidate, reviewer, rationale | eval set |
| `curation.entity.merge_proposed.v1` | entities[], score, evidence | adjudication queue |
| `curation.entity.merged.v1` | surviving, merged, decided_by, rationale | projector, search |
| `curation.entity.split.v1` | original, resulting[], decided_by | projector, search |

`curation.candidate.rejected.v1` is deliberately retained and consumed by the evaluation set.
Rejections are the highest-value training signal we have — they tell us exactly where extraction is
wrong, labelled by an expert, for free.

### Knowledge

| Event | Payload | Consumers |
|---|---|---|
| `knowledge.assertion.confirmed.v1` | assertion, provenance_chain, sensitivity | projector, indexing, notification |
| `knowledge.assertion.retracted.v1` | assertion, reason, actor | projector, indexing, audit |
| `knowledge.entity.created.v1` | entity, type, label, sensitivity | projector, indexing |
| `knowledge.relationship.asserted.v1` | from, to, type, validity, assertion | projector |
| `knowledge.commitment.created.v1` | commitment, promisor, promisee, deadline | notification, tracking |
| `knowledge.commitment.status_changed.v1` | commitment, from, to, evidence | notification, audit |
| `knowledge.contradiction.detected.v1` | assertions[], kind, confidence | curation queue, notification |
| `knowledge.sensitivity.changed.v1` | entity, from, to, actor, rationale | projector, search, audit |

### Projection & search

| Event | Payload | Consumers |
|---|---|---|
| `projection.checkpoint.advanced.v1` | projection, last_event_id, lag_ms | observability |
| `projection.rebuild.started.v1` | projection, reason, target | operators, UI status banner |
| `projection.rebuild.completed.v1` | projection, duration, events_processed | operators |
| `projection.failed.v1` | projection, event_id, error | **paging alert** |
| `search.index.updated.v1` | index, document_count | observability |
| `search.embedding.regenerated.v1` | scope, model, count | observability |

### Audit & administration

| Event | Payload | Consumers |
|---|---|---|
| `audit.entry.appended.v1` | entry, hash, previous_hash | SIEM forwarder |
| `audit.chain.verified.v1` | range, result, verified_at | operators |
| `audit.chain.broken.v1` | entry, expected, actual | **paging alert — potential tampering** |
| `admin.config.changed.v1` | key, actor, old_hash, new_hash | audit |
| `admin.egress_policy.changed.v1` | tenant, from, to, actor, justification | **audit + user-visible notice** |
| `admin.export.requested.v1` | scope, actor, format, destination | audit |

`admin.egress_policy.changed.v1` is surfaced **to end users**, not just logged. If an institution
changes its posture such that recorded conversations may now be sent to an external model provider,
the people recorded have a right to know that, and a system that only logs it to an admin console
is not honouring principle P1.

## 5. Anti-patterns

Rejected at review, every time:

| Anti-pattern | Why |
|---|---|
| Commands disguised as events (`SessionShouldBeProcessed`) | Events are facts. Commands go through the API |
| Fat events carrying full aggregate state | Couples consumers to the write model; use IDs and let consumers read |
| Thin events requiring an immediate callback for every field | Chatty, and creates a synchronous dependency in an async system |
| Consumers assuming global ordering | It does not exist. Per-aggregate only |
| Events used for request/response | Use the API. Events are not RPC |
| Publishing without the outbox | Guarantees eventual divergence between state and events |
| Personal data in event payloads beyond what the consumer needs | Data minimisation applies to the bus too. Broker retention is a data store |

## 6. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| EV-1 | Do we need a compacted stream for current-state bootstrap of new consumers? | Backend Lead | Phase 3 |
| EV-2 | Schema registry: a service, or contract tests plus CI validation? | Backend Lead | Phase 3 |
| EV-3 | Should events carry sensitivity so the broker can enforce topic-level restriction? | Security Lead | Phase 3 |
| EV-4 | Per-tenant streams vs one stream with tenant filtering — isolation vs operational cost | Infrastructure Lead | Phase 3 |
