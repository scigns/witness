# Code Conventions (condensed)

**Owner:** Developer Experience Lead
**Status:** Active
**Full version:** [`docs/engineering/CODING_STANDARDS.md`](../../docs/engineering/CODING_STANDARDS.md)
and [`docs/engineering/ENGINEERING_GUIDE.md`](../../docs/engineering/ENGINEERING_GUIDE.md)

---

## TypeScript

- Strict mode. **No `any`** — use `unknown` and narrow. **No `!`** — handle the null case.
- **No `@ts-ignore`** — `@ts-expect-error` with a comment, or fix it.
- Named exports only. `import type` for types. `readonly` by default.
- **Value objects over primitives:** `TenantId`, not `string`.
- **Discriminated unions over optional fields** — make illegal states unrepresentable.

## Naming

| Thing | Convention |
|---|---|
| File | `kebab-case.ts` |
| Class, type | `PascalCase` |
| Function, variable | `camelCase` |
| Constant | `SCREAMING_SNAKE_CASE` |
| Port | `<Concept>Port` |
| Adapter | `<Impl><Concept>Adapter` |
| Event | `<Aggregate><PastTenseVerb>` |
| Command | `<Imperative><Aggregate>` |

Use the **ubiquitous language**. If archivists say "assertion", the code says `Assertion`.

## Errors

- **Domain errors are values**, not exceptions — they are expected outcomes.
- **Infrastructure failures are exceptions**, handled at the adapter with retry.
- Never swallow. Never lose the cause (`{ cause }`). Never leak internals to a caller.

## Comments

Comment **why**, never **what**. A `TODO` without an issue number fails lint.

```ts
// NATS may redeliver after a consumer ack timeout, so we count distinct
// event IDs rather than deliveries — see ADR-0005 on at-least-once.
```

## Tests

- Name the **behaviour**: `it('refuses to process when the consent grant has been revoked')`
- Test the **requirement**, not the implementation. A behaviour-preserving refactor must not break it.
- No mocking what you do not own — adapters test against real infrastructure.
- **Synthetic fixtures only.** Never real data, under any justification.
- Failure messages must diagnose. `expected true to be false` wastes the next person's hour.

## Commits

Conventional Commits, signed off (`git commit -s`). Body explains **why**.

```
feat(knowledge-graph): add bitemporal validity to entity assertions

Entities need both when a fact was true in the world and when we came to
believe it, so "what did we believe on date X?" is answerable in an audit.

Refs: #142
ADR: ADR-0011
```
