# Packages

**Owner:** Backend Lead & Principal Architect
**Status:** Phase 2–3 deliverable

Shared libraries.

| Package | Purpose | Licence |
|---|---|---|
| [`domain/`](domain/) | **The pure domain model** — aggregates, value objects, invariants, domain events | GPL-3.0 |
| [`contracts/`](contracts/) | API and event contracts — OpenAPI, GraphQL SDL, AsyncAPI | **Apache-2.0** |
| [`ui/`](ui/) | Design system — shadcn/ui source we own, with per-component a11y tests | GPL-3.0 |
| [`policy/`](policy/) | Casbin model and policies — versioned and unit-tested like code | GPL-3.0 |
| [`observability/`](observability/) | OpenTelemetry wrapper; the only place the OTel SDK is imported | GPL-3.0 |
| [`config-eslint/`](config-eslint/) | Shared ESLint config, including layering enforcement | GPL-3.0 |
| [`config-typescript/`](config-typescript/) | Shared TypeScript configuration | GPL-3.0 |

## The rule that matters

**`packages/domain` imports nothing** — no framework, no ORM, no HTTP, no filesystem, no clock, no
randomness. Time and identity are injected as ports.

Enforced by `eslint-plugin-boundaries` in CI, not by discipline. This is what makes the domain testable
in milliseconds and portable across a decade of framework churn
([ADR-0003](../architecture/decisions/ADR-0003-hexagonal-ddd-clean-architecture.md)).

`contracts/` and the SDKs are **Apache-2.0** so integrators face no copyleft obligation
([ADR-0002](../architecture/decisions/ADR-0002-licensing-strategy.md)).
