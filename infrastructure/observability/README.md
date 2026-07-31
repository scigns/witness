# Observability Configuration

**Owner:** Infrastructure Lead
**Status:** Phase 2

Prometheus rules, Grafana dashboards and alert definitions.

**Every alert has a runbook.** An alert without one wakes someone at 2am with no path forward, and
is treated as a defect.

Domain-specific alerts that matter more than the golden signals:
`consent_revocation_propagation_seconds` (page above 300s p99), `audit_chain_verification_status`
(page on failure), `egress_denied_total` (warn on any non-zero in `sovereign`).
