# Coding Standards

**Owner:** Developer Experience Lead
**Status:** Active

Mechanical rules. Anything a tool can enforce is enforced by a tool — arguing about formatting in
review is a waste of two people's attention.

---

## Automated

| Concern | Tool | Config |
|---|---|---|
| Formatting | Prettier | `.prettierrc.json` |
| Linting | ESLint (flat config) | `packages/config-eslint` |
| Types | TypeScript strict | `tsconfig.base.json` |
| Layering | `eslint-plugin-boundaries` | `packages/config-eslint` |
| Commits | commitlint | `commitlint.config.js` |
| Markdown | markdownlint-cli2 | `.markdownlint-cli2.jsonc` |

**Prettier decides formatting. There is no style debate.** If you disagree, change the config in its
own pull request.

## TypeScript

Strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
`noPropertyAccessFromIndexSignature`. These catch real bugs and are not negotiable per-package.

| Rule | Why |
|---|---|
| **No `any`** | Use `unknown` and narrow. `any` disables the tool we are paying for |
| **No `!` non-null assertion** | Handle the null case. If it is genuinely impossible, assert with a message |
| **No `@ts-ignore`** | `@ts-expect-error` with a comment explaining why, or fix it |
| **Named exports only** | Default exports break refactoring tools and make imports inconsistent |
| **`import type`** | `verbatimModuleSyntax` requires it; keeps runtime imports honest |
| **`readonly` by default** | Mutation should be deliberate and visible |
| **Discriminated unions over optional fields** | Makes illegal states unrepresentable |

## Naming

| Thing | Convention | Example |
|---|---|---|
| File | `kebab-case.ts` | `consent-grant.ts` |
| Test | `*.spec.ts`, `*.integration.spec.ts` | `consent-grant.spec.ts` |
| Class, type, interface | `PascalCase` | `ConsentGrant` |
| Function, variable | `camelCase` | `revokeConsent` |
| Constant | `SCREAMING_SNAKE_CASE` | `MAX_TRAVERSAL_DEPTH` |
| Port interface | `<Concept>Port` | `GraphPort` |
| Adapter | `<Impl><Concept>Adapter` | `Neo4jGraphAdapter` |
| Event | `<Aggregate><PastTenseVerb>` | `ConsentGrantRevoked` |
| Command | `<Imperative><Aggregate>` | `RevokeConsentGrant` |

**No abbreviations** except universally understood ones (`id`, `url`, `http`, `api`, `db`). `usrCnsntGrnt`
saves eight keystrokes once and costs comprehension forever.

**Use the ubiquitous language.** If archivists say "assertion", the code says `Assertion`. Every
translation between our vocabulary and our stakeholders' is a place misunderstanding hides.

## File structure

```
services/consent/
  src/
    domain/           # pure — no framework imports
    application/      # use cases, port interfaces
    adapters/
      inbound/        # HTTP, GraphQL, event consumers
      outbound/       # Prisma, NATS, external clients
    main.ts
  test/
    integration/
    adversarial/
```

One primary export per file. Co-locate tests with source (`foo.ts` / `foo.spec.ts`).

## Functions

- **Small.** If it does not fit on a screen, it is probably doing two things.
- **One level of abstraction per function.** Mixing "orchestrate the workflow" with "parse this
  string" makes both harder to read.
- **Prefer pure.** Side effects at the edges, pushed outward.
- **Parameter objects beyond three arguments**, so call sites are self-documenting.
- **No boolean parameters.** `save(user, true)` is unreadable. Use an options object or two functions.

## Imports

Ordered and grouped: node builtins → external → workspace (`@witness/*`) → relative. Enforced by
ESLint.

**No deep imports across package boundaries.** `@witness/domain` — not
`@witness/domain/src/consent/grant`. The package's public surface is its entry point.

## Comments

Comment **why**. Never **what**.

```ts
// eslint-disable-next-line <rule> -- <reason>     ← reason is mandatory
// TODO(#142): <description>                       ← issue number is mandatory
```

A `TODO` without an issue number fails lint. Untracked TODOs are how intentions become archaeology.

## Tests

- `describe` names the unit; `it` names the **behaviour**, not the method
- One assertion concept per test
- Arrange / Act / Assert, visually separated
- Fixtures via builders, not fixture files — builders make the relevant detail visible at the call site
- **No real data. Ever.** Not anonymised, not "just for a test"

```ts
it('refuses to process when the consent grant has been revoked', () => { ... });   // good
it('testConsentCheck2', () => { ... });                                            // no
```

## SQL

- Migrations are reversible, or ship with a tested forward-fix
- Expand / migrate / contract — never destructive in a single release
- Raw SQL is permitted where the ORM is insufficient, but it lives in the repository adapter and is
  reviewed with extra care
- **Parameterised queries only.** String concatenation into SQL or Cypher fails review immediately

## Frontend

- Server components by default; `'use client'` only where interactivity requires it
- **No hard-coded user-facing strings.** ICU message format, always
- Every interactive element keyboard-accessible; visible focus states
- Semantic HTML first; ARIA only where semantics are insufficient
- Bundle budget enforced in CI — a heavy dependency is a decision, not a convenience

## Python (workers, SDK)

PEP 8 via Ruff · type hints required, checked with mypy strict · Pydantic for boundary validation ·
pytest · dependencies pinned. Same layering discipline as TypeScript: models are pure, I/O at the
edges.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced. Scopes are the domain list in
`commitlint.config.js`.

```
feat(knowledge-graph): add bitemporal validity to entity assertions

Entities need both when a fact was true in the world and when we came to
believe it, so "what did we believe on date X?" is answerable in an audit.

Refs: #142
ADR: ADR-0011
```

Body explains **why**. Sign off with `git commit -s` (DCO).
