# Role: Backend Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Principal Architect |
| **Integration branch** | `backend`, `workers`, `database`, `search`, `integrations` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Build the services that hold the institutional record — correct, consistent, observable, and
structurally incapable of writing an assertion without provenance or reading personal data without
consent.

## Responsibilities

- Own the domain layer, application layer and service implementations
- Own the PostgreSQL schema, migrations, row-level security and query performance
- Own the event catalogue, the transactional outbox and consumer idempotency
- Own the API contracts (OpenAPI, GraphQL SDL) and their implementations
- Own the workers: transcription orchestration, indexing, projection dispatch
- Own search implementation and its permission filtering
- Own external integrations behind anti-corruption layers
- Keep the domain layer pure, in fact and not just in the lint config

## Authority

### Decides alone
- Service internal design within the agreed architecture
- Schema design within the data model
- Library choices within the backend, inside the established stack
- Query and index optimisation
- Worker concurrency and retry strategy

### Must consult
- Principal Architect on context boundaries and cross-service contracts
- Security Lead on any authorisation, consent or export path
- Knowledge Graph Lead on projection contracts
- Infrastructure Lead on operational impact of a schema or worker change

### Must escalate
- New technology → CTO with an ADR
- Changes to consent enforcement → Governance Lead and Security Lead
- Breaking API changes → Release Manager and CTO
- Migrations that cannot be made reversible → CTO

## Deliverables

Services and workers · domain layer with 100% test coverage · PostgreSQL schema and reversible
migrations · event catalogue implementation · API contracts and conformance · search implementation ·
integration adapters · performance baselines for data access paths.

## Ownership

| Path / domain | Notes |
|---|---|
| `services/**` | Except `consent` (shared with Governance Lead) and `identity` (with Security Lead) |
| `workers/**` | |
| `packages/domain/**` | With Principal Architect |
| Database schema and migrations | |
| `architecture/EVENT_CATALOGUE.md` | |

## Success metrics

| Signal | Target |
|---|---|
| Domain layer coverage | 100% of new logic |
| Domain purity violations | 0 |
| **Consent and provenance invariant tests** | Passing, always |
| Migration reversibility | 100%, tested both directions |
| Consumer idempotency verified | Every consumer |
| API contract conformance | 100% |
| N+1 queries reaching `main` | 0 |
| Projection rebuild-from-log test | Passing |

## Definition of Done

Beyond the standard DoD: the invariants hold and are tested; the migration is reversible and timed on
realistic volume; the event is documented in the catalogue before it is published; the consumer is
idempotent and duplicate-delivery tested; no unbounded query exists on a request path; the domain
layer imports nothing.

## Dependencies

**Depends on:** Principal Architect (structure), Security Lead (authorisation model), Governance Lead
(consent semantics), Infrastructure Lead (runtime), AI Lead (extraction contracts).

**Depended on by:** Frontend Lead (APIs), Knowledge Graph Lead (events), QA Lead (testability),
integrators (contracts).

## Review responsibilities

| Must review | Response |
|---|---|
| `services/**`, `workers/**` | 1 working day |
| Schema and migrations | 1 working day |
| Event contract changes | 1 working day |
| API contract changes | 1 working day |

## Merge authority

`services/**` (except consent paths) · `workers/**` · `packages/domain/**` (with Principal Architect)
· migrations · `architecture/EVENT_CATALOGUE.md`.

## Anti-responsibilities

- Does not decide architecture alone (Principal Architect).
- Does not weaken a consent or provenance invariant to make an implementation simpler — if the
  invariant is genuinely wrong, that is an ADR, not a workaround.
- **Does not let Prisma types leak past the repository adapter.** That coupling is how a data layer
  becomes permanent.
- Does not add a service where a module would do.
