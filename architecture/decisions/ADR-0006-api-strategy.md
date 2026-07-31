# ADR-0006: API strategy — GraphQL BFF plus versioned REST

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Backend Lead, Frontend Lead, Principal Architect |
| **Principles engaged** | P6 (decades) |

## Context

Witness has two very different API consumers with incompatible needs.

**Our own web application** renders a meeting view showing the session, its participants, the
decisions produced, each decision's evidence, each commitment's owner, and the provenance chain for
every assertion. Over REST that is a request waterfall — unacceptable over the low-bandwidth,
high-latency links that principle P8 commits us to supporting.

**Integrators** — government records systems, ETL jobs, monitoring scripts, an EDRMS connector
written in 2029 by a contractor who has left — need a stable, boring, well-documented contract that
does not change when we redesign a screen. Most of these consumers will never speak GraphQL, and
requiring them to would exclude a large part of the ecosystem we need.

Trying to serve both with one API means either a chatty GraphQL schema frozen by external consumers,
or a REST API distorted by UI needs. Both are worse than having two.

## Decision

> We will expose **GraphQL as a backend-for-frontend**, owned by and evolving with our own
> applications, and a **versioned REST API** as the stable public contract for integrators. Both are
> specified before implementation (API-first) and both are generated from contracts in
> `packages/contracts`.

| | GraphQL | REST |
|---|---|---|
| **Consumer** | Witness web and admin apps | Integrators, scripts, government systems |
| **Stability** | Evolves with the UI; not a public contract | **Versioned public contract**, `/api/v1` |
| **Breaking changes** | Permitted with the app | Never within a major version |
| **Spec** | GraphQL SDL | OpenAPI 3.1 |
| **Deprecation** | With the release | Minimum 12 months, plus one LTS cycle |

Events (AsyncAPI 3.0) are the third interface, documented in [`EVENT_CATALOGUE.md`](../EVENT_CATALOGUE.md).

## Options considered

### Option A — GraphQL only
**Pros:** one API to build and maintain; flexible for every consumer.
**Cons:** excludes integrators who cannot or will not adopt GraphQL — a large fraction of government
IT. A public GraphQL schema also becomes frozen by unknown consumers, losing the flexibility that
justified it. And an expressive query language exposed publicly is a denial-of-service and
exfiltration surface requiring query cost analysis and depth limiting to control.

### Option B — REST only
**Pros:** universally understood; trivially cacheable; simple to secure and document.
**Cons:** the waterfall problem above. We would end up building composite endpoints shaped exactly
like our UI screens — a worse GraphQL, invented accidentally, and then frozen as a public contract.

### Option C — Both, with GraphQL as a BFF *(chosen)*
**Pros:** each consumer gets what it needs; the public contract stays stable while the UI evolves
freely; the BFF is not public API, so schema changes are cheap.
**Cons:** two API surfaces to build, document, test and secure. Real, ongoing cost.

### Option D — gRPC for internal, REST for external
**Pros:** efficient internal communication.
**Cons:** our internal communication is predominantly asynchronous via events (ADR-0005), so the
synchronous internal API surface is small. gRPC would add tooling for little benefit. Revisit if
synchronous service-to-service traffic grows.

## Consequences

### Positive
- The web app fetches a full meeting view in one round trip — decisive for low-bandwidth use.
- Integrators get a stable, documented, boring REST contract with a real deprecation policy.
- Contract-first means the SDKs are generated, not hand-written, so they cannot drift.
- Breaking-change detection in CI is possible because both surfaces have machine-readable specs.

### Negative
- Two surfaces means duplicated authorisation, validation and audit concerns. Mitigated by both
  delegating to the same application layer — neither contains business logic.
- More documentation to maintain.
- Contributors must know which surface a change belongs to; getting it wrong means either an
  unstable public contract or an over-constrained BFF.

### Risks accepted
That an integrator starts depending on the GraphQL BFF despite it not being a public contract. It is
served on a distinct path, documented as unstable, and not included in the SDKs — but someone will
do it anyway. If it becomes widespread we will have to decide whether to stabilise it, which would
cost us the flexibility. Signal: support requests referencing GraphQL from outside the project.

## Compliance and enforcement

- Contracts in `packages/contracts` are the source of truth; implementations are verified against
  them by contract tests. An implementation that diverges fails CI.
- **Breaking-change detection** on the REST spec in CI (`oasdiff`); a breaking change without a
  major-version bump fails the build.
- GraphQL query depth and cost limits enforced at the gateway — no unbounded query is reachable.
- SDKs are generated from the specs; hand-editing generated code fails CI.
- Every endpoint declares its authorisation requirement; an endpoint with none fails a fitness test.

## Reversal

Dropping GraphQL would mean building composite REST endpoints for the UI — perhaps three to four
weeks. Dropping REST is not viable; external consumers would break. The REST contract is effectively
permanent from v1.0, which is exactly why it is versioned and specified before we implement anything.

## References

- [`docs/guides/API_GUIDE.md`](../../docs/guides/API_GUIDE.md) · [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html) · [AsyncAPI 3.0](https://www.asyncapi.com/)
