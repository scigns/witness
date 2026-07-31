# ADR-0015: Branching and integration strategy

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | CTO, Release Manager, Developer Experience Lead |
| **Related** | ADR-0001, ADR-0017 |
| **Principles engaged** | P6 |

## Context

Witness has around thirty domains of work — architecture, product, research, frontend, backend,
knowledge graph, AI platform, security, governance, infrastructure and so on — each with a named
owner, distinct review requirements and different definitions of done.

Two failure modes to avoid. **Full GitFlow** with long-lived feature branches produces painful
integration and merge conflicts that grow with branch age; it is widely regarded as a poor fit for
continuous delivery. **Pure trunk-based development** with everything straight to `main` gives no
place for a domain lead to integrate and validate a coherent body of work before it reaches the
release line, and no natural home for the review specialisation our domains require.

We also have an unusual contributor mix: humans and AI agents, working in parallel across many
domains, where an agent's work needs a clear integration point and an accountable human reviewer.

## Decision

> We will use **trunk-based development with `main` as the always-releasable trunk**, plus
> **long-lived domain integration branches** that serve as owned, reviewed staging areas — not as
> parallel forks.

```text
main                    ← always releasable, protected, tagged for release
 └── develop            ← continuous integration of all domains
      └── <domain>      ← long-lived integration branch, one named owner
           └── <type>/<domain>/<issue>-<slug>   ← short-lived, < 5 days
```

**Domain branches never diverge.** They rebase or merge from `develop` at least daily, automated. A
domain branch more than 50 commits behind `develop` raises an alert; more than 200 behind fails CI.
This is the mechanism that keeps them integration lanes rather than forks.

Working branches are short-lived — target under five days, hard limit fourteen with an explanation.

Full branch inventory, owners and rules: [`docs/engineering/BRANCH_STRATEGY.md`](../../docs/engineering/BRANCH_STRATEGY.md).

## Options considered

### Option A — Pure trunk-based, everything to `main`

**Pros:** simplest; smallest integration risk; the industry's best-evidenced practice for delivery
performance.
**Cons:** no natural integration point for a domain lead to validate a coherent body of work; no
structural place for specialised review (a knowledge graph change needs KG Lead review, an infra
change needs a different reviewer); with many parallel AI-assisted contributions, `main` would take
a stream of loosely-related commits with no owner assembling them.

### Option B — GitFlow with release and hotfix branches

**Pros:** familiar; explicit release preparation.
**Cons:** long-lived divergent branches, painful merges, slow feedback. Poor fit for continuous
delivery. Rejected.

### Option C — Trunk-based with long-lived domain integration branches *(chosen)*

**Pros:** each domain has an owner and a validation point; specialised review is structural; `main`
stays releasable; work is visible early; maps cleanly to CODEOWNERS and to role charters.
**Cons:** more branches to keep current; divergence risk if discipline lapses; contributors must
know which domain branch to target.

### Option D — Branch per release train

Considered and rejected — our release cadence is time-based with LTS lines (ADR-0017), and release
branches are cut from `main` at release time rather than maintained continuously.

## Consequences

### Positive

- Every domain has a named owner with merge authority over their area.
- Specialised review is enforced by branch protection plus CODEOWNERS rather than by remembering.
- `main` is always releasable, so a release is a tag rather than a project.
- AI-assisted contributions have a clear integration point and an accountable human reviewer.
- Work in progress is visible on a domain branch before it reaches `develop`.

### Negative

- **Thirty branches is a lot of branches.** Real cognitive overhead, and a new contributor needs
  guidance to pick the right one.
- Automated syncing is required; without it this degrades into GitFlow's problems within months.
- Two merge hops (working → domain → develop → main) means more steps between writing code and
  releasing it.
- Some changes are genuinely cross-domain and have no single natural home. Rule: target the domain
  of the primary owner and request review from the others.

### Risks accepted

That domain branches become stale forks despite the automation — the exact failure this design is
meant to prevent. Signals: divergence alerts firing regularly; merge conflicts at domain → develop.
Response: if a domain branch is chronically stale, retire it and work directly on `develop`. Not
every domain needs a branch, and we should be willing to delete ones that are not earning their keep.

## Compliance and enforcement

- Branch protection on `main`, `develop` and all domain branches: no direct pushes, required
  reviews, required status checks, linear history.
- Automated daily sync from `develop` into every domain branch; divergence beyond thresholds warns
  then fails.
- Branch naming is validated in CI.
- Stale branch detection: working branches over 14 days old are flagged to their owner.
- CODEOWNERS enforces domain-specific review requirements.

## Reversal

Collapsing to pure trunk-based is straightforward — merge everything to `develop`, delete the domain
branches, move review specialisation entirely to CODEOWNERS. About a day of work. We would do this if
the overhead demonstrably exceeded the benefit, and we should be honest with ourselves about that at
the six-month review rather than defending the structure out of sunk cost.

## References

- [`docs/engineering/BRANCH_STRATEGY.md`](../../docs/engineering/BRANCH_STRATEGY.md) · [Trunk Based
  Development](https://trunkbaseddevelopment.com/) · Forsgren, Humble & Kim, *Accelerate* (2018)
