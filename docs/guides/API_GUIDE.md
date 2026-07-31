# API Guide

**Owner:** Backend Lead & Documentation Lead
**Status:** Contract-first specification — **Phase 1 deliverable 1.5, then Phase 3**
**Decision record:** [ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md)

> ⚠️ Witness is pre-implementation. This describes the API contract being specified before any
> implementation exists — that ordering is deliberate, and it is why integrators can rely on it.

---

## Two surfaces, on purpose

| | REST | GraphQL |
|---|---|---|
| **For** | Integrators, scripts, government systems | Witness's own web and admin apps |
| **Stability** | **Versioned public contract** — `/api/v1` | Evolves with the UI |
| **Breaking changes** | Never within a major version | Permitted with the app |
| **Deprecation** | ≥ 12 months, plus one LTS cycle | With the release |
| **Spec** | OpenAPI 3.1 | GraphQL SDL |

**Integrators should use REST.** GraphQL is a backend-for-frontend, not a public contract, and it is
served on a distinct path and excluded from the SDKs precisely so that this is unambiguous.

Events are the third interface — AsyncAPI 3.0,
[`EVENT_CATALOGUE.md`](../../architecture/EVENT_CATALOGUE.md).

## Authentication

OAuth2 client credentials for machine-to-machine, via Keycloak.

```http
POST /realms/witness/protocol/openid-connect/token
grant_type=client_credentials&client_id=...&client_secret=...
```

```http
GET /api/v1/sessions
Authorization: Bearer <token>
X-Witness-Tenant: <tenant-id>
```

Tokens are short-lived (15 minutes). Service tokens are never usable as user tokens.

## The concepts you need

| Concept | Meaning |
|---|---|
| **Session** | A meeting, consultation, workshop or sitting |
| **Subject** | A person or community whose data may be processed — **not necessarily a user** |
| **Consent grant** | The lawful basis for processing a subject's data, with scopes |
| **Utterance** | A time-bounded span of speech. **The atomic provenance target** |
| **Candidate** | A model-proposed assertion. **Not yet institutional record** |
| **Assertion** | A human-confirmed claim with a complete provenance chain |
| **Entity** | A resolved node in the knowledge graph |

**The distinction between candidate and assertion is the most important thing to understand.** They
are different types with different endpoints. A candidate is a proposal; an assertion is record. Code
that conflates them will produce a system that presents AI inference as institutional fact, which is
the specific harm Witness exists to avoid.

## Core endpoints *(planned)*

```
POST   /api/v1/sessions                      create a session
GET    /api/v1/sessions/{id}
POST   /api/v1/sessions/{id}/media           upload (resumable)

POST   /api/v1/consent/grants                record a grant
DELETE /api/v1/consent/grants/{id}           revoke — propagates within 5 minutes
GET    /api/v1/consent/subjects/{id}/grants

GET    /api/v1/transcripts/{id}
GET    /api/v1/transcripts/{id}/utterances

GET    /api/v1/candidates?status=pending     the review queue
POST   /api/v1/candidates/{id}/confirm       becomes an assertion
POST   /api/v1/candidates/{id}/correct
POST   /api/v1/candidates/{id}/reject

GET    /api/v1/assertions/{id}
GET    /api/v1/assertions/{id}/provenance    the chain to source audio
GET    /api/v1/entities/{id}
GET    /api/v1/entities/{id}/relationships
GET    /api/v1/search?q=...&mode=hybrid
POST   /api/v1/export                        open formats; audited
```

### The provenance endpoint

The most important endpoint in the API, and the one that distinguishes Witness from a search tool.

```http
GET /api/v1/assertions/{id}/provenance
```

Returns the unbroken chain: the source utterance with character offsets, the media object and time
range, the model ID, version and prompt hash, the human who confirmed it and when, and the consent
grants under which processing was lawful.

Target: the full chain in ≤ 3 calls, < 500 ms p95. If you are building anything on Witness, build it
so a user can always reach this.

## Rules you must follow

1. **Never present a candidate as a fact.** If you surface model output, label it and show its
   confidence.
2. **Always offer a path to provenance.** A user seeing an assertion must be able to reach its source.
3. **Respect the consent boundary.** The API enforces it; do not cache past it. A revoked grant means
   data must disappear from your system too.
4. **Do not cache permission-filtered results across users.** Results are filtered per caller.
5. **Handle 202 Accepted.** Ingestion and extraction are asynchronous; poll or subscribe.

## Errors

RFC 9457 problem details.

```json
{
  "type": "https://witness.org/errors/consent-required",
  "title": "No valid consent grant",
  "status": 403,
  "detail": "Processing requires an active grant covering purpose 'policy_analysis'.",
  "instance": "/api/v1/sessions/01J8.../media"
}
```

`consent-required` and `consent-revoked` are distinct from `forbidden`. A caller with every permission
still receives them, because consent is evaluated *before* authorisation. Handle them as a lawful-basis
problem, not a permissions problem.

## Versioning

`/api/v1`. Breaking changes require a major version and are detected in CI (`oasdiff`) — a breaking
change without a bump fails our build, not yours.

Additive changes are non-breaking: **tolerate unknown fields**. A client that breaks on a new optional
field is a client that will break on our next minor release.

## SDKs

Generated from the OpenAPI specification, so they cannot drift: `@witness/sdk` (npm) and
`witness-sdk` (PyPI), both **Apache-2.0** so integration carries no copyleft obligation
([ADR-0002](../../architecture/decisions/ADR-0002-licensing-strategy.md)).

## Rate limits

Per tenant and per client. `429` with `Retry-After`. Bounded by design: no unbounded query, traversal
or result set is reachable through the API — graph traversal is capped at depth 6 and 1,000 nodes.
