# Changelog

All notable changes to Witness are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as qualified in
[`docs/engineering/RELEASE_STRATEGY.md`](docs/engineering/RELEASE_STRATEGY.md).

Entries are generated from Conventional Commits and curated before release. Anything affecting
**consent, provenance, data sovereignty, security or migration** is called out explicitly in its
own subsection, regardless of size — those changes carry obligations for operators.

---

## [0.3.0] — 2026-08-23 — Institutional Pilot Release

> **Witness Institutional Pilot Release — client-ready controlled pilot workflows.**
>
> Builds on the 0.2.0 controlled-pilot foundation with a substantially clearer
> facilitator and participant experience, reusable institutional onboarding,
> operational pilot controls and measurable evidence of pilot value.
>
> This remains a pre-1.0 release. Sensitive institutional data is subject to the
> deployment-specific readiness decision in
> `docs/operations/PILOT_1_READINESS.md`; this version number does not by itself
> authorise sensitive data or attachments.

### Added

- Client-ready program and session experience across the main Witness workflow,
  including clearer role-aware navigation, session journey guidance, evidence
  registers, consent views, review surfaces and program administration.
- Reusable institutional starter-profile presentation for regional /
  multi-community consultation, training/classroom work, formal proceedings,
  congregational meetings and general-purpose use without creating separate
  product forks.
- Browser audio recording and participant document/image evidence, with
  `evidence_submission` enforced as a distinct consent category.
- Organisation-level pilot value indicators derived from existing records:
  failed transcription and summary jobs, completed reviews, published reports
  and median session-close-to-report-publication time.
- Structured pilot feedback issue template that explicitly excludes participant
  names, quotations, transcripts and confidential session content.
- Pilot operations material:
  - `PILOT_1_READINESS.md`
  - `PILOT_LAUNCH_CHECKLIST.md`
  - `FACILITATOR_QUICKSTART.md`
  - client rollout profiles and onboarding runbook.

### Changed

- Client-facing terminology now consistently prefers **Program** where the
  underlying domain/API still uses `workspace`.
- Empty states, role descriptions, first-use guidance and administrator wording
  were rewritten around what a real facilitator needs to do next.
- API errors exposed in the web application use plain-language fallbacks rather
  than raw HTTP-oriented messages.
- Session, participant, consent, evidence, review, report and administration
  pages were substantially refined for real pilot operation.
- Sign-in/session handling now bounds and retries the identity session check
  rather than allowing an indefinite wait.

### Fixed

- Non-admin users being incorrectly locked out of their own authorised program
  pages.
- Quick-capture visibility for roles that can never submit evidence.
- Consent amendment and consent-configuration failure paths discovered during
  controlled UAT.
- Dead links and missing export-history feedback in the capture workflow.
- Native file-input and browser-recording usability issues, including mobile
  overflow and clearer browser capability guidance.
- Identity role consistency and centralised friendly authorisation errors.
- Pilot deployment now preserves the runner-managed `.env` across application
  checkouts.

### Consent, provenance and sovereignty

- Consent remains category-specific and fail-closed.
- `evidence_submission` authorises a participant submission; it does not invent
  authority on behalf of people identified inside a submitted artefact.
- Generated transcripts, summaries and suggestions remain drafts until a human
  confirms them.
- Report composition continues to apply consent/redaction at render time rather
  than copying participant-derived content into an uncontrolled second store.
- No external AI provider was enabled by this release; the deployed production
  profile continues to report external inference disabled.
- No claim of legal or regulatory compliance is made by the institutional
  profiles. Formal-proceeding deployments still require the institution to
  establish the applicable lawful basis and governance approvals.

### Operations

- PR #97 was merged to `main` and automatically deployed successfully.
- Production web, API readiness and identity endpoints were healthy after
  deployment.
- PostgreSQL, Keycloak and local Ollama inference reported healthy after
  deployment.
- Controlled-pilot database backups remained scheduled and checksum-valid
  during the release-preparation period.
- Pilot feedback, readiness and facilitator procedures are now reusable rather
  than rediscovered for each institution.

### Known limitations

- Fijian/iTaukei automated transcription is not approved as authoritative;
  human verification or manual transcription is required where textual
  accuracy matters.
- Speaker diarisation remains deferred.
- Neo4j knowledge-graph projection and OpenSearch hybrid/vector search remain
  unconfigured in the current production profile.
- Database-level row-level security is not yet the independent second tenant
  isolation layer; application/repository scoping remains the current
  enforcement layer.
- PDF export remains deferred; HTML, Markdown, JSON and CSV are supported.
- Sensitive institutional attachments remain subject to explicit storage
  protection/recovery and deployment-readiness approval.
- This release does not claim completion of the repository's longer-term Phase
  1–8 architecture roadmap.

## [0.2.0] — 2026-08-16 — Controlled Pilot

> **Witness Controlled Pilot — real institutional use under supervision.**
>
> Authenticated, role- and tenant-scoped, with consent enforcement, local transcription and AI
> summarisation, object storage with per-organisation quota, and report export. Not yet a general
> release: no multi-browser human UAT for the Reviewer/Observer roles, no genuine Fijian/iTaukei
> transcription evidence, and no offline/air-gapped install bundle.

Converts the engineering-complete build into an operationally supportable pilot: a verified
release candidate, a full production flight (login journey, role and tenant regression, backup and
independent restore, rollback procedure), production secret hygiene review, and a pilot support
path via GitHub Issues.

### Added

- Institutional onboarding: create an organisation with a starting profile (SPC, FTA, MOJ, Church),
  a storage quota, and a first administrator, in one step
- Per-organisation usage metering (storage, members, participants, sessions, transcription and AI
  jobs, exports)
- PWA installability (manifest, icons, `apple-mobile-web-app` metadata)
- A severity field (P0–P3) on the bug report template, for pilot-support triage

### Fixed

- Starter consent templates for the SPC/FTA/MOJ/Church profiles were missing the required
  `participation` category, which the domain layer rejects — new organisations created from these
  profiles would have failed to seed a usable starter template
- Report export (HTML, Markdown, CSV) silently omitted the organisation and program name, and
  dropped transcripts and the session summary entirely from three of four export formats — an
  operator exporting a session's record for an institution's own archive was not getting the whole
  record
- `scripts/ops/backup-status.sh` crashed with an unbound-variable error on the production host
  (Linux); it tried the BSD `stat` flag first, which is a different, non-erroring flag on GNU stat

### Operations

- First verified backup → independent restore drill against this release, using the documented
  `scripts/pilot/backup.sh` / `scripts/ops/restore.sh` path
- Rollback procedure confirmed: no schema migration in this release, so rollback is `git checkout`
  the previous known-good commit, rebuild, and recreate the affected containers
- Confirmed no leftover placeholder or example credentials in the production `.env`; tightened
  permissions on the UAT test-account password file

### Known limitations

- Reviewer and Observer role boundaries are proven at the API/authorization-policy level, not yet
  via a live authenticated browser session — passwords are never entered into a browser or an API
  call by the engineering agent, by design
- No genuine Fijian/iTaukei audio has been supplied to verify transcription in that language
- Safari/iPhone and Firefox have not been manually checked

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
