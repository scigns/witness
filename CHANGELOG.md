# Changelog

All notable changes to Witness are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as qualified in
[`docs/engineering/RELEASE_STRATEGY.md`](docs/engineering/RELEASE_STRATEGY.md).

Entries are generated from Conventional Commits and curated before release. Anything affecting
**consent, provenance, data sovereignty, security or migration** is called out explicitly in its
own subsection, regardless of size — those changes carry obligations for operators.

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
