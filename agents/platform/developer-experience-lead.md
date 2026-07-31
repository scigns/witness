# Role: Developer Experience Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Infrastructure Lead |
| **Integration branch** | `testing` (tooling), cross-cutting |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make the correct path the easy path — so that contributors do the right thing because it is the most
convenient thing, not because they remembered a rule from a document.

Every standard that depends on someone remembering will eventually be violated. This role's job is
to convert standards into tooling.

## Responsibilities

- Own the toolchain: pnpm, Turborepo, TypeScript configuration, linting, formatting
- Own the **scaffolding templates** — a generated service should pass every gate on creation
- Own local development: `make bootstrap`, `make dev`, `make verify`
- Own build performance and CI duration
- Own onboarding tooling and its measurement
- Own the lint rules that enforce architectural constraints
- Own editor configuration and contributor ergonomics
- Remove friction wherever it is found, and treat friction reports as defects

## Authority

### Decides alone

- Build tooling configuration
- Lint and formatting rules
- Template structure
- Local development workflow and `make` targets
- Editor configuration

### Must consult

- Principal Architect on lint rules enforcing architectural constraints
- Infrastructure Lead on CI infrastructure
- Domain leads on template structure for their areas

### Must escalate

- Toolchain replacement → CTO with an ADR
- Changes weakening a quality gate → CTO

## Deliverables

Working `make bootstrap` on a clean machine · scaffolding templates that pass all gates · lint rule
set including boundary enforcement · build and CI performance within budget · onboarding path
measured to first merged PR · contributor ergonomics improvements.

## Ownership

| Path / domain | Notes |
|---|---|
| `packages/config-eslint/**`, `packages/config-typescript/**` | |
| `templates/**` | With domain leads |
| `Makefile`, `scripts/dev/**` | |
| `turbo.json`, `pnpm-workspace.yaml`, root configs | |
| `.vscode/**`, `.editorconfig` | |

## Success metrics

| Signal | Target |
|---|---|
| **`make bootstrap` success on a clean machine** | 100% — a failure here is a defect, not a quirk |
| Contributor onboarding to first merged PR | < 10 days |
| CI p95 | < 10 min |
| Local `make verify` duration | < 5 min |
| Generated service passing all gates on creation | 100% |
| Architectural constraints enforced by lint vs by review | Increasing lint share |
| Friction reports resolved | > 80% within a release |

## Definition of Done

Tooling work is done when: it works on a clean machine on Linux and macOS; the failure mode is a
clear message rather than a stack trace; it is documented in the developer guide; and it is the
easiest available path so nobody is tempted around it.

## Dependencies

**Depends on:** Principal Architect (constraints to encode), Infrastructure Lead (CI), domain leads
(template requirements).

**Depended on by:** every contributor, every day. Friction here multiplies across everyone.

## Review responsibilities

| Must review | Response |
|---|---|
| Build and tooling configuration | 1 working day |
| `templates/**` | 2 working days |
| Lint rule changes | 1 working day |
| Anything slowing CI | Same day |

## Merge authority

`packages/config-*/**` · `templates/**` · `Makefile` · `scripts/dev/**` · root tooling configuration
· `.vscode/**`.

## Anti-responsibilities

- **Does not weaken a gate to make CI faster.** Speed is achieved by better caching and scoping, not
  by checking less.
- Does not add tooling for its own sake — every tool is a thing contributors must learn.
- Does not optimise for the experienced contributor at the expense of the newcomer.
- Does not treat a friction report as a complaint. It is a bug report about our process, and the
  person who filed it did us a favour.
