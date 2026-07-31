# Role: QA Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Backend Lead |
| **Integration branch** | `testing`, `performance` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make sure our tests would actually fail if the code were wrong — and own the invariant and
adversarial suites that encode what Witness promises.

Coverage percentage is a poor proxy for confidence. This role exists because CI can measure quantity
and only a person can assess whether a test is worth having.

## Responsibilities

- Own the testing strategy and its enforcement
- Own the **invariant suite** (INV-1 to INV-8) — consent, provenance, isolation, layering, rebuild
- Own the **adversarial suite** with the Security Lead — tests written to break our controls
- Own test infrastructure: Testcontainers, fixtures, harnesses, determinism
- Own the synthetic fixture sets, and guard the rule that no real data is ever used
- Own performance testing and the SLO regression suite
- Own the evaluation harness with the AI Lead
- Own flaky test policy and enforce it — quarantine in a day, fix or delete in a week
- Assess **test quality** in review, which no automated gate can do

## Authority

### Decides alone

- Test strategy, structure and tooling
- Coverage requirements above the minimum
- Quarantining or deleting a flaky test
- Fixture design
- Blocking a merge on inadequate test quality

### Must consult

- Security Lead on adversarial test design
- AI Lead on evaluation methodology
- Domain leads on domain-specific test requirements
- Infrastructure Lead on CI test execution

### Must escalate

- Coverage or quality standards being routinely bypassed → CTO
- An invariant that cannot be tested → Principal Architect
- Performance regressions breaching an SLO → CTO

## Deliverables

Testing strategy · invariant suite · adversarial suite (with Security Lead) · test infrastructure and
fixtures · performance baselines and regression suite · evaluation harness (with AI Lead) · flaky
test register · per-release quality report.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/engineering/TESTING_STRATEGY.md` | |
| `test/invariants/**` | |
| `test/adversarial/**` | With Security Lead |
| `test/performance/**`, `test/evaluation/**` | |
| Fixture sets in `examples/**` | With Research Lead |

## Success metrics

| Signal | Target |
|---|---|
| **Invariant suite passing** | Always — these encode the product's promises |
| **Adversarial suite passing** | Always |
| Flaky tests in the suite | 0 (quarantine ≤ 1 day, resolve ≤ 1 week) |
| Escaped defects per release | Trending down |
| Unit suite local duration | < 30 s |
| Domain layer coverage | 100% of new logic |
| Real data found in fixtures | 0 — a single instance is a serious incident |
| Tests that pass with the implementation broken | Found and removed |

## Definition of Done

Beyond the standard DoD: tests assert the requirement rather than the implementation; error paths are
covered; adapters are tested against real infrastructure not mocks; failure messages diagnose the
problem; tests are deterministic; fixtures are synthetic.

## Dependencies

**Depends on:** Security Lead (threat model for adversarial tests), AI Lead (evaluation), domain
leads (testability), Infrastructure Lead (CI capacity).

**Depended on by:** every contributor for confidence; Release Manager for release readiness.

## Review responsibilities

| Must review | Response |
|---|---|
| `test/**` infrastructure | 1 working day |
| Invariant and adversarial test changes | Same day — **especially any weakening of an assertion** |
| Test quality on significant PRs | 2 working days |
| Performance-sensitive changes | 2 working days |

## Merge authority

`docs/engineering/TESTING_STRATEGY.md` · `test/**` · fixture sets (with Research Lead) · evaluation
harness (with AI Lead).

## Anti-responsibilities

- **Does not own quality.** Everyone owns quality. This role owns the *system for verifying* it — a
  QA function that becomes the quality gate for others is how everyone else stops caring.
- Does not accept coverage as evidence of confidence.
- Does not allow a test to be skipped to unblock a merge. That is how a suite dies, one urgent Friday
  at a time.
- Does not permit real data in fixtures under any justification.
