# Engineering Guide

**Owner:** Principal Architect
**Status:** Active

How we write code at Witness. Process lives in the other documents in this directory; this one is
about the code itself.

---

## The five rules that matter most

1. **The domain layer imports nothing.** No framework, no ORM, no HTTP, no clock, no randomness.
   Enforced by lint, not by discipline.
2. **Provenance and consent are structural.** If you can construct an assertion without provenance,
   or reach personal data without a `ConsentedContext`, that is a bug in the types, not in your code.
3. **Write for the stranger in 2036.** They have no context, no Slack history, and no access to you.
   Legibility beats cleverness every time.
4. **Errors are values in the domain, exceptions at the boundary.** No silent failure. Ever.
5. **If it is not tested, it does not work.** You may believe otherwise. You are welcome to be
   surprised.

## Layering

```
adapters  →  application  →  domain
(infra)      (use cases)     (pure)
```

| Layer | Contains | May import |
|---|---|---|
| **Domain** | Aggregates, entities, value objects, domain events, invariants, policies | Standard library, other domain code |
| **Application** | Command and query handlers, orchestration, transactions, port interfaces | Domain |
| **Adapters** | HTTP, GraphQL, Prisma, NATS, LiteLLM, Neo4j, filesystem | Application, domain |

**Ports are defined in the application layer, implemented in adapters.** The dependency inversion is
the whole point: the application says what it needs, infrastructure provides it.

### When to define a port

A port is justified when it crosses a **technology boundary we might replace** — the graph store, the
model provider, the ASR engine, the object store.

A port is *not* justified for every collaborator. An interface with exactly one implementation that
will never have another is ceremony, and we call that out in review. This is a real failure mode of
hexagonal architecture and we would rather name it than pretend it does not happen.

## Domain modelling

**Make illegal states unrepresentable.**

```ts
// No. Every consumer must now remember to check.
type Assertion = { provenance?: ProvenanceChain };

// Yes. The compiler enforces the invariant.
class Assertion {
  private constructor(
    readonly id: AssertionId,
    readonly provenance: ProvenanceChain,   // not optional, ever
    // ...
  ) {}
}
```

- **Value objects over primitives.** `TenantId`, not `string`. This prevents an entire class of
  argument-order bug that is otherwise invisible until production.
- **Aggregates enforce their own invariants.** An aggregate that permits an invalid state is not an
  aggregate.
- **Distinct types for distinct concepts.** `CandidateAssertion` and `Assertion` are different types,
  not a status field — so the compiler prevents a candidate being used where a confirmed assertion is
  required ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)).
- **Time and identity are injected.** `Clock` and `IdGenerator` are ports. A domain that calls
  `new Date()` cannot be tested deterministically.

## Errors

**Domain errors are values.** They are expected outcomes, not exceptional conditions:

```ts
type ConsentDecision =
  | { allowed: true; context: ConsentedContext }
  | { allowed: false; reason: 'no_grant' | 'revoked' | 'expired' | 'out_of_scope' };
```

**Infrastructure failures are exceptions**, handled at the adapter with retry and backoff.

Rules:
- Never swallow an error. A `catch` that logs and continues must say why in a comment.
- Never lose the cause. Wrap with `{ cause }`.
- Error messages must help the person debugging at 3am. `Error: failed` does not.
- Never leak internal detail to an API caller — log it, return something safe.

## Asynchronous work

- **Every event consumer is idempotent**, keyed on the CloudEvents `id`. At-least-once delivery is
  assumed; exactly-once is a fiction.
- **Publish through the outbox.** Direct broker publishing bypasses the transaction and guarantees
  eventual divergence between state and events. Caught by lint.
- **Assume out-of-order delivery** across aggregates. Ordering holds per aggregate only.
- **Everything is resumable.** A four-hour transcription cannot restart from zero on a transient
  failure.

## Observability

Instrument as you write, not afterwards.

- Traces via `packages/observability`. Direct OTel SDK imports in services fail lint.
- **Structured logging with a field allowlist, not a denylist.** A denylist eventually misses a field
  and puts utterance text in a log — a privacy incident through the observability path.
- `console.log` fails lint. Use the logger.
- Every new async path emits a metric. If you cannot tell whether it is working from telemetry alone,
  it is not finished.

## Performance

- **Measure before optimising.** "This looks slow" is a hypothesis.
- **No unbounded anything** on a request path: no unbounded query, traversal, allocation or
  pagination. Every list has a limit; every traversal has a depth cap.
- N+1 queries are a review-blocking defect, not a nit.
- Cache deliberately, with a documented invalidation strategy. Caching on a security boundary
  (consent decisions) needs particular care — see [ADR-0008](../../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md).

## Comments

Comment **why**, never **what**. The code says what.

```ts
// Bad: increment the counter
counter++;

// Good: NATS may redeliver after a consumer ack timeout, so we count
// distinct event IDs rather than deliveries — see ADR-0005 on at-least-once.
```

A comment explaining a non-obvious constraint, a workaround, or a link to an ADR is worth ten
explaining syntax. If code needs a comment to be understood, first ask whether it could be clearer.

## Dependencies

Every new dependency needs an entry in
[`docs/research/OSS_EVALUATION.md`](../research/OSS_EVALUATION.md), including a **replacement
strategy**. If you cannot describe how we would remove it, we are not adding it.

Prefer: the standard library → an existing dependency → a small focused package → a large framework.

## Language conventions

TypeScript, strict mode, no `any` (`unknown` plus narrowing instead). No non-null assertions (`!`) —
handle the null case. Named exports only. `import type` for types. Full detail:
[`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## What gets rejected in review

- Business logic in a controller or a Prisma model
- A domain class importing anything from a framework
- `any`, `!`, or a `@ts-ignore` without a comment explaining why
- A caught error that is logged and ignored without explanation
- A test that asserts the implementation rather than the requirement
- A user-facing string hard-coded in a component
- A new endpoint with no declared authorisation requirement
- A commented-out block of code (git remembers it; delete it)
- A `TODO` with no issue number
- "We'll clean this up later" without an entry in [`TECH_DEBT.md`](TECH_DEBT.md)
