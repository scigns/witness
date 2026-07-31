# Testing Strategy

**Owner:** QA Lead
**Status:** Active

---

## Position

We are building a system whose output is used as evidence. A defect here does not corrupt a shopping
cart — it corrupts an institution's memory, and it may not be discovered for years, by which point
the source recording may be gone and the people involved unreachable.

So: **untested code does not merge.** Not as a policy slogan — as a CI gate.

But coverage percentage is a poor proxy for confidence. We care about whether the tests would
*actually fail* if the code were wrong. A suite that passes when the implementation is broken is
worse than no suite, because it manufactures false confidence.

## Shape

Not a rigid pyramid — a distribution matched to where our risk actually lives.

```text
        ╱╲          E2E (few)             critical user journeys
       ╱──╲         Contract (many)       every API and event boundary
      ╱────╲        Integration (many)    every adapter against real infrastructure
     ╱──────╲       Unit (most)           all domain logic
    ╱────────╱      Invariant (always)    consent, provenance, isolation
```

The bottom band is unusual and it is the point: **invariant tests are not a layer, they are a
constant.** They run against every layer and assert the properties that define the product.

## Test types

| Type | Scope | Speed | Where | Requirement |
|---|---|---|---|---|
| **Unit** | Pure functions, domain logic, aggregates | < 10 ms | `*.spec.ts` beside source | **100% of new domain logic** |
| **Integration** | Adapters against real infrastructure | < 2 s | `*.integration.spec.ts` | Every adapter |
| **Contract** | API and event conformance to specs | < 1 s | `*.contract.spec.ts` | Every public boundary |
| **Invariant** | Consent, provenance, isolation, layering | Varies | `test/invariants/` | Always |
| **Adversarial** | Deliberate attempts to breach a control | Varies | `test/adversarial/` | Every control |
| **E2E** | Critical journeys through the real UI | < 60 s | `test/e2e/` | Critical paths only |
| **Performance** | Latency, throughput, rebuild time | Minutes | `test/performance/` | Every SLO |
| **Accessibility** | WCAG 2.2 AA | < 5 s | With component tests | Every UI component |
| **Evaluation** | Extraction and transcription quality | Minutes | `test/evaluation/` | Every model or prompt change |

## The tests that matter most

Ordinary projects have ordinary test suites. These are the ones specific to Witness, and they are
where review attention should concentrate.

### Invariant tests

Non-negotiable properties, asserted continuously:

```text
INV-1  No path reaches personal data without a valid ConsentedContext
INV-2  No Assertion exists without a complete ProvenanceChain
INV-3  Every projected graph node/edge resolves to ≥ 1 confirmed assertion
INV-4  No query returns data across a tenant boundary
INV-5  Community-restricted knowledge is unreachable by any role, including administrator
INV-6  packages/domain imports nothing from adapters or frameworks
INV-7  Projections rebuild from the event log to an identical state
INV-8  The audit chain verifies from genesis
```

**INV-7 is the test that validates [ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md).**
It drops every projection, rebuilds from the log, and asserts equivalence. If it is not passing, the
central architectural claim of the project is unverified.

### Adversarial tests

Tests written to *break* a control. These are expected to fail loudly if anyone weakens the system:

- Reach personal data through every entry point without consent
- Access another tenant's data via API, GraphQL, search, graph traversal, export
- Read community-restricted knowledge as a system administrator
- Create an assertion directly from extraction output, bypassing human review
- Forge an assertion via prompt injection in recorded speech (with a maintained injection corpus)
- Make an external network call in the `sovereign` profile
- Recover erased data after a revocation, from any store, cache or index

**A weakening of a control should break these tests.** That is their job. If someone "fixes" a
failing adversarial test by relaxing the assertion, that is the loudest possible signal in code
review.

### Evaluation tests

Model and prompt changes are behaviour changes and cannot be reviewed by reading a diff.

- Held-out fixture set with human-labelled ground truth, per language
- Metrics: precision, recall and F1 per assertion type; WER and DER for transcription
- **A model or prompt change cannot merge without an evaluation delta report** in the PR
- Regression beyond threshold blocks merge
- Results published per release, **including where they are poor** — particularly for low-resource
  languages, where hiding a bad number would betray the users most affected

## Rules

1. **Test the requirement, not the implementation.** If a refactor that preserves behaviour breaks
   your test, the test was wrong.
2. **No mocking what you do not own.** Adapters are tested against real infrastructure via
   Testcontainers. A mocked Neo4j proves nothing about Neo4j.
3. **Deterministic or deleted.** A flaky test is worse than no test — it trains people to ignore red.
   Flaky tests are quarantined within one day and fixed or deleted within a week.
4. **Fast enough to run.** Unit suite under 30 seconds locally. A suite nobody runs is decoration.
5. **Synthetic fixtures only.** Never real recordings, real transcripts or real personal data. Not
   anonymised, not "just for a test". Fixtures live in [`examples/`](../../examples/).
6. **Failure messages must diagnose.** `expected true to be false` wastes the next person's hour.
7. **Test the error paths.** Most production incidents happen in code paths nobody tested because
   they were "the unhappy path".

## Coverage

| Scope | Requirement |
|---|---|
| `packages/domain` | **100%** of new logic — enforced |
| Application layer | ≥ 90% |
| Adapters | ≥ 80% |
| Overall | Must not decrease |

Coverage is a **floor, not a goal.** 100% coverage with assertions that cannot fail is worse than 70%
with tests that catch real defects. Reviewers assess test quality; CI only assesses quantity, and it
cannot tell the difference.

## Tooling

Vitest (unit, integration) · Testcontainers (real infrastructure) · Pact or spec-driven contract
tests · Playwright (E2E) · axe-core (accessibility) · k6 (performance) · custom harness (evaluation).

## In CI

| Stage | Runs | Blocking |
|---|---|---|
| Pre-commit | Lint, format, affected unit tests | Yes |
| Pull request | Unit, integration, contract, invariant, adversarial, a11y | Yes |
| Pull request (UI) | Bundle budget, Lighthouse | Yes |
| Merge to `develop` | Above plus E2E | Yes |
| Nightly | Performance, full evaluation, full projection rebuild | Alerts |
| Pre-release | Everything, plus upgrade, rollback and recovery drills | Yes |

## When a test fails in CI

**Fix the cause.** Do not retry, do not skip, do not mark it flaky to get green. If a test is
genuinely wrong, fix the test in its own commit with an explanation of why it was wrong.

Skipping a test to unblock a merge is how a suite dies — not all at once, but one urgent Friday at a
time.
