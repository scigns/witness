# ADR-0014: Observability with OpenTelemetry

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Infrastructure Lead, Backend Lead |
| **Principles engaged** | P1 (sovereignty), P7 (boring technology) |

## Context

Witness is an asynchronous pipeline: ingestion → transcription → extraction → review → projection →
indexing, spanning six services across hours. When something is slow, stuck or wrong, an operator
needs to see where — and that operator is often one person with no distributed-systems background.

Two constraints shape the choice. First, **telemetry must never leave the operator's boundary** —
an observability vendor SDK phoning home would violate P1 as surely as an LLM API call. Second,
operators already run something (Splunk, Elastic, Datadog, Zabbix, or nothing), and we should
forward to what they have rather than demand they adopt ours.

## Decision

> We will instrument with **OpenTelemetry** — traces, metrics and logs — and ship a self-hosted
> default stack of **Prometheus, Grafana, Tempo and Loki**. Telemetry never leaves the operator's
> infrastructure and there is no upstream collector. We will not add one.

Trace context propagates through NATS via the `witnesstraceparent` CloudEvents extension, so a
recording's full journey from upload to graph is a single trace.

## Options considered

### Option A — OpenTelemetry with a self-hosted stack *(chosen)*
**Pros:** vendor-neutral by design — operators forward to whatever they run; CNCF governed; no lock-in;
one instrumentation API for all three signal types; broad ecosystem.
**Cons:** the OTel Node SDK has historically churned; the collector is another component to run; more
initial setup than a single-vendor agent.

### Option B — Vendor SDK (Datadog, New Relic, Honeycomb)
**Pros:** excellent developer experience; less setup.
**Cons:** violates P1 outright — data egress by default. Rejected without hesitation.

### Option C — Logs only, no tracing
**Pros:** simplest; every operator understands logs.
**Cons:** correlating a request across six services and several hours from logs alone is
impractical, and this is precisely our hardest debugging scenario.

### Option D — Prometheus metrics plus structured logs, no distributed tracing
**Pros:** lighter; covers most operational questions.
**Cons:** loses causal chains in the async pipeline. Tracing is where the value is for our topology.
**However**: tracing is made optional at deployment. A small operator who does not want to run Tempo
gets metrics and logs, and the system works. This is a partial adoption, not a rejection.

## Consequences

### Positive
- One trace spans upload through to graph projection, across services and hours.
- Operators integrate with existing tooling rather than adopting ours.
- Telemetry stays inside the boundary; nothing to disable for air-gapped deployment.
- Domain-specific metrics — consent revocation propagation, projection lag, review queue age — are
  first-class, and these are the metrics that actually matter for this product.

### Negative
- The OTel Node SDK adds startup time and some runtime overhead. Sampling is configurable; the
  default is 10%.
- The full stack (Prometheus, Grafana, Tempo, Loki) is four more services in the observability
  profile. Optional, but the operator who wants full visibility pays for it.
- Contributors must instrument deliberately; poorly chosen spans are noise.

### Risks accepted
- **Sensitive data leaking into telemetry.** Utterance text in a span attribute or an error message
  would be a privacy incident via the observability path — an easy mistake to make. Mitigation:
  structured logging with a **field allowlist, not a denylist**; a CI check for known-sensitive field
  names in telemetry calls; log redaction tested.
- SDK churn requiring maintenance. Mitigated by wrapping instrumentation in `packages/observability`
  so upgrades touch one package.

## Compliance and enforcement

- All instrumentation goes through `packages/observability`; direct OTel SDK imports in services fail
  a lint rule.
- Logging uses the structured logger with an explicit field allowlist. `console.log` fails lint.
- Every service exposes `/healthz`, `/readyz` and `/metrics`.
- Required domain metrics are asserted by a fitness test — a service that does not emit them fails.
- Trace context propagation through NATS is verified by an integration test.

## Reversal

Instrumentation is OTel-standard, so switching backends is a collector configuration change.
Removing instrumentation entirely would be straightforward and deeply unwise.

## References

- [OpenTelemetry](https://opentelemetry.io/) · [`DEPLOYMENT_ARCHITECTURE.md` §6](../DEPLOYMENT_ARCHITECTURE.md)
