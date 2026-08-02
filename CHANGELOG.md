# Changelog

All notable changes to Witness are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as qualified in
[`docs/engineering/RELEASE_STRATEGY.md`](docs/engineering/RELEASE_STRATEGY.md).

Entries are generated from Conventional Commits and curated before release. Anything affecting
**consent, provenance, data sovereignty, security or migration** is called out explicitly in its
own subsection, regardless of size — those changes carry obligations for operators.

---

## [0.1.0] — 2026-08-01 — Developer Preview

> **Witness Developer Preview — foundational institutional-memory workflow.**
>
> **Not production-ready.** Requests are not authenticated. Consent is not enforced. There is no AI
> extraction, no transcription and no knowledge graph. Do not put real institutional records in it.

The first release with running software. It proves the architecture end to end on one narrow
workflow rather than approximating the whole product.

### What it does

- **Capture** an institutional record from a named source, with the source type and date required —
  a record without provenance is refused by the domain, not merely discouraged.
- **Store** it in PostgreSQL, the sole system of record (ADR-0004).
- **Display** it, with unaccepted records prominently labelled as candidates rather than record.
- **Show its provenance** — source, when the source occurred, when Witness captured it, and who by.
- **Human review** — submit, confirm, correct, reject, reopen. Corrections are tracked as a distinct
  state from confirmations, because correction rate is how `VISION.md` measures whether extraction is
  trustworthy.
- **Audit trail** — append-only, hash-chained, verified on every read and surfaced in the UI.
- **Health and readiness** — `/health` does no I/O so a database blip cannot cause a restart loop;
  `/ready` reports every dependency, the deployment profile, data residency, build identifier, and an
  explicit list of what this build does not implement.

### Deliberately not implemented

Named here and served by the API at `/ready`, so no one has to guess whether something is broken or
simply unbuilt:

- AI extraction of candidate assertions (Phase 5)
- Transcription and diarisation (Phase 5)
- Knowledge graph projection (Phase 4)
- Consent service — grants, scopes, revocation (Phase 3)
- Keycloak authentication and Casbin authorisation (Phase 2)
- Hybrid search (Phase 6)
- Multi-tenant isolation and row-level security (Phase 3)
- Event-driven projection rebuild (Phase 4)

Nothing in that list is simulated or stubbed to look present.

### Consent, provenance and sovereignty

- **Provenance is structurally required.** `packages/domain` offers no path that constructs a record
  without a source and a capturing actor, and the database columns are NOT NULL.
- **Only a human can accept a record** into institutional memory. The P4 check lives in the domain,
  so it holds for every caller rather than for whichever controller remembered it.
- **Consent is NOT enforced.** `consent_grant_id` exists and is threaded through, but the consent
  service is Phase 3. This is stated rather than implied, and the column becomes NOT NULL then.
- **The sovereign profile refuses to start** with an external model provider configured — including
  when it is supplied through the base URL or API key alone (ADR-0009, ADR-0013).
- **The development profile refuses to run in production**, which is what keeps the permissive
  development authorisation adapter unreachable there.

### Security

- Authorisation is a real boundary with deny-by-default: a route with no declared policy is refused
  rather than allowed, and an unrecognised role grants nothing.
- `AuthorizationPort` is the Phase 2 integration point for Keycloak and Casbin (ADR-0007). The
  development adapter behind it performs **no authentication**, says so in the UI and in its logs,
  and throws at construction outside the development profile.
- No secret appears in configuration served over the network; verified by test.
- Audit content is deliberately excluded from log output — parameter values here are the words people
  said in a meeting.

### Added — engineering

- `packages/domain` — pure domain model, no runtime dependencies, no infrastructure imports.
- `packages/config` — environment validation and deployment-profile enforcement.
- `packages/contracts` — API types and runtime schemas, Apache-2.0.
- `services/api-gateway` — NestJS over Prisma and PostgreSQL.
- `apps/web` — Next.js application.
- Toolchain activated: pnpm workspace, TypeScript project references, ESLint, Prettier, Vitest,
  Turborepo, and the lockfile that switches on the dormant CI code gates.
- 110 tests: 26 domain, 13 configuration, 12 contract, 18 API, 20 invariant, 21 adversarial.

### Added — governance

- ADR-0021 reconciling canonical product scope and architecture (decision D-6).
- `docs/governance/LICENSING.md` documenting the Apache-2.0 boundary and the outstanding D-1 action.
- Ten departments with ownership, authority and prohibited actions.
- Phase execution plan, department assignment board and agent handoff protocol.
- Developer onboarding, executed end to end rather than described.

### Fixed

- `.env.example` was missing `KEYCLOAK_ADMIN_PASSWORD`, which the compose stack marks mandatory —
  every new contributor's first `make dev` would have failed naming a variable the template never
  mentioned. A CI gate now prevents the class.
- Docker Compose resolves `.env` relative to the compose file's directory, so the root `.env` was
  never loaded and `make dev` could not have worked as documented.
- Seven scripts and compose files referenced by the Makefile and `package.json` did not exist.
- `next build` failed on the 404 route when `NODE_ENV=development` leaked from `.env`.

### Removed

- `memory/changelog.md`, which recorded an authentication module, a user module, RBAC, AI services
  and notifications as built. None of it existed.
- `docs/vision.md`, `docs/architecture.md`, `docs/coding-standards.md` and `memory/decisions.md`,
  superseded under ADR-0021 with their content preserved verbatim in its appendix.

### Known limitations

- Requests are not authenticated. The `X-Witness-Dev-User` header is unverified and trivially forged.
- Consent is not enforced.
- Single-tenant only; there is no tenant isolation.
- The audit log is tamper-**evident**, not tamper-proof. An attacker who rewrites the entire chain
  produces a valid one; external anchoring is Phase 7.
- `TD-001` — dependency review is not running. GitHub's Dependency graph is unavailable on this
  repository, so the gate probes and warns rather than pretending to run. Must be closed before
  Phase 2 introduces the first real dependency.
- Append-only enforcement for the audit log is in the repository layer, not yet a database trigger.

### Architecture status

Canonical and unchanged: ADR-0000 through ADR-0021, all accepted. Nothing in this release supersedes
an ADR. **Next phase:** Phase 2 — infrastructure and identity, beginning with closing TD-001.

---

## [Unreleased]

### Added
- Repository scaffold covering the full enterprise structure (`.ai/`, `agents/`, `architecture/`,
  `docs/`, `apps/`, `packages/`, `services/`, `workers/`, `infrastructure/`, `deployments/`,
  `sdk/`, `examples/`, `scripts/`, `templates/`, `.github/`).
- Foundational documentation: `PROJECT_CONTEXT.md`, `VISION.md`, `MISSION.md`, `ROADMAP.md`,
  `STATUS.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- Architecture baseline: `ARCHITECTURE.md`, `SYSTEM_CONTEXT.md`, `TECH_STACK.md`, `DATA_MODEL.md`,
  `KNOWLEDGE_GRAPH.md`, `EVENT_CATALOGUE.md`, `SECURITY_ARCHITECTURE.md`,
  `DEPLOYMENT_ARCHITECTURE.md`.
- Architecture Decision Records ADR-0000 through ADR-0020.
- Engineering operating system: engineering and product operating models; branch, repository,
  release and documentation strategies; code review, CI/CD, security review, issue and pull
  request workflows; testing strategy; coding standards; AI development workflow.
- Nineteen role charters in `agents/`.
- Governance framework: consent framework, digital sovereignty policy, Indigenous data
  sovereignty protocols, risk register, decision log, technical debt register.
- Open-source dependency evaluation dossier with per-dependency exit strategies.
- CI/CD workflows, issue and pull request templates, CODEOWNERS, Dependabot configuration.
- Scaffolding templates for ADRs, RFCs, services, packages, runbooks and postmortems.

### Notes
- No application code has been released. Witness is pre-implementation; see [`STATUS.md`](STATUS.md).

---

## Release entry format

Each released version uses this shape:

```markdown
## [1.4.0] — 2027-05-14

### ⚠️ Operator action required
Anything requiring an operator to act before or during upgrade.

### 🔐 Security
Security fixes, with CVE identifiers where assigned.

### 🤝 Consent & sovereignty
Changes to consent semantics, data residency, egress behaviour or retention.

### 🧬 Data migration
Schema or projection changes, with rebuild requirements and expected duration.

### Added / Changed / Deprecated / Removed / Fixed
Standard Keep a Changelog sections.

### Contributors
Everyone whose work is in this release.
```

[Unreleased]: https://github.com/scigns/witness/commits/main
