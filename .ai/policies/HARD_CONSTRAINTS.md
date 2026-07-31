# Hard Constraints

**Owner:** CTO, Security Lead, Governance Lead
**Status:** Active — **binding on every contributor, human or AI**

Violating any constraint here invalidates the contribution regardless of its quality. These are not
guidelines. They are the properties that make Witness what it claims to be.

---

## Never

1. **Never create a code path that reaches personal data without a `ConsentedContext`.**
   If a repository method returning personal data does not require one, that is a bug in the type
   signature, not a convenience.

2. **Never create an assertion without a complete provenance chain.**
   `ProvenanceChain` is non-nullable. There is no "unknown" variant and no default.

3. **Never let model output become institutional record without human confirmation.**
   Not for high confidence. Not for low-stakes assertion types. Not for throughput.

4. **Never weaken or delete an invariant or adversarial test to make a change pass.**
   Those tests failing is the system working. A weakened assertion is the loudest possible signal in
   code review.

5. **Never introduce an outbound network call reachable in the `sovereign` profile.**
   No telemetry, no analytics, no update check, no model API, no CDN, no font host.

6. **Never allow any role — including system administrator — to read community-restricted knowledge.**
   There is no break-glass. There is no support exception.

7. **Never commit a secret**, in any form, including in a test fixture, a comment or an example.

8. **Never use real recordings, transcripts, personal data or institutional content** anywhere —
   including tests, fixtures, documentation, examples or prompts. Not anonymised. Not redacted.

9. **Never train, fine-tune or evaluate a model on user data from any Witness deployment.**
   Not aggregated, not anonymised, not with consent. Any qualification here becomes a loophole.

10. **Never write to a projection store from application code.**
    Neo4j, OpenSearch and pgvector are written only by their projectors. Application services hold
    read-only credentials.

11. **Never import infrastructure into `packages/domain`.**
    No framework, no ORM, no HTTP, no filesystem, no clock, no randomness.

12. **Never publish an event without the transactional outbox.**
    Direct broker publishing bypasses the transaction and guarantees eventual divergence.

13. **Never bypass the policy decision point** for an authorisation decision.

14. **Never disable a CI gate to make a build pass.**
    If a gate is wrong, change the gate deliberately in its own pull request, with reasoning.

15. **Never merge your own pull request.**

---

## Always

1. **Always update documentation in the same pull request** as the behaviour change.
2. **Always write an ADR** for a decision that is expensive to reverse.
3. **Always make event consumers idempotent**, keyed on the CloudEvents `id`.
4. **Always parameterise queries.** No string concatenation into SQL or Cypher.
5. **Always parse model output against a strict schema.** Never treat it as instruction.
6. **Always fail closed.** If a policy decision cannot be made, deny.
7. **Always record the model ID, version and prompt hash** on every extraction.
8. **Always bound traversals, queries and result sets.**
9. **Always externalise user-facing strings.**
10. **Always sign off commits** (`git commit -s`) — DCO.

---

## Where these come from

| Constraint | Source |
|---|---|
| 1, 6 | [ADR-0008](../../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md), [ADR-0019](../../architecture/decisions/ADR-0019-indigenous-data-sovereignty.md), principles P2 and P5 |
| 2, 3 | [ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md), principles P3 and P4 |
| 5, 9 | [ADR-0009](../../architecture/decisions/ADR-0009-ai-abstraction-and-model-sovereignty.md), principle P1 |
| 10 | [ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md) |
| 11 | [ADR-0003](../../architecture/decisions/ADR-0003-hexagonal-ddd-clean-architecture.md) |
| 12 | [ADR-0005](../../architecture/decisions/ADR-0005-event-driven-backbone.md) |

If you believe a constraint here is wrong, the correct response is an ADR proposing its change — not
an exception in your pull request. Constraints 1, 2, 3, 5, 6 and 9 additionally require Steering
Committee approval and are subject to the Governance Lead's absolute veto.
