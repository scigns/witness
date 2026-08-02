# Observability

**Owner:** Infrastructure Lead
**Status:** Phase 2

OpenTelemetry wrapper. **The only place the OTel SDK may be imported** — direct imports in services
fail a lint rule, so an SDK upgrade touches one package.

Structured logging uses a **field allowlist, not a denylist**. A denylist eventually misses a field
and puts utterance text in a log, which is a privacy incident through the observability path.
