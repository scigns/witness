# Observability

**Owner:** Infrastructure Lead
**Status:** Reserved — Phase 2. Not built; this directory contains only this planning document,
and no `package.json` (it is not a resolvable workspace package today). The observability *stack*
(Prometheus/Grafana/Tempo/Loki, `infrastructure/docker/docker-compose.observability.yml`) is real
and runs in local development (`make dev-obs`), but is not deployed to the production pilot, and
no application code instruments against an OTel wrapper package as this document plans — see
`STATUS.md`'s infrastructure workstream.

OpenTelemetry wrapper. **The only place the OTel SDK may be imported** — direct imports in services
fail a lint rule, so an SDK upgrade touches one package.

Structured logging uses a **field allowlist, not a denylist**. A denylist eventually misses a field
and puts utterance text in a log, which is a privacy incident through the observability path.
