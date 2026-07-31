# ADR-0017: Versioning and release strategy

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Release Manager, CTO, Open Source Lead |
| **Related** | ADR-0006, ADR-0015 |
| **Principles engaged** | P6 (decades) |

## Context

Our users are public institutions. They do not upgrade software the way startups do. Procurement,
change advisory boards, security review, testing windows and budget cycles mean an upgrade is a
project measured in months. A release policy designed for continuously-deployed SaaS would simply be
ignored, and institutions would run unpatched versions indefinitely — which is worse for everyone
than a policy that meets them where they are.

At the same time, we need to move fast during early development, and our monorepo contains packages
with genuinely different audiences: the platform, the SDKs, and the contracts.

## Decision

> We will use **semantic versioning** for all published packages, **time-based platform releases**
> every six weeks, and an **LTS release every 12 months supported for 24 months**.

| Line | Cadence | Support | Contents |
|---|---|---|---|
| **Stable** | Every 6 weeks | Until the next stable | Features, fixes |
| **LTS** | Every 12 months | **24 months** | Security and critical fixes only after cut |
| **Patch** | As needed | — | Security and critical bug fixes |

`main` is always releasable (ADR-0015). A release is a tag plus a checklist, not a project.

**Versioning scope.** The **REST API** contract governs the platform major version — a breaking REST
change means a major release, full stop. The GraphQL BFF is not a public contract and does not
constrain versioning (ADR-0006). SDK and contract packages version independently via Changesets.

**Pre-1.0:** minor versions may break. This is stated loudly, and we will not pretend otherwise to
seem stable.

## Options considered

### Option A — Continuous delivery, no versioned releases
**Pros:** simplest; always current.
**Cons:** impossible for institutional operators to consume. They need a named, tested, documented
artefact they can put through change control. Rejected.

### Option B — SemVer with feature-based releases ("ship when ready")
**Pros:** releases are meaningful.
**Cons:** unpredictable timing makes operator planning impossible, and it creates pressure to cram
features in before a cut. Time-based releases with whatever is ready avoids both.

### Option C — Time-based releases with an LTS line *(chosen)*
**Pros:** operators can plan; the LTS line matches real institutional upgrade cycles; no incentive to
rush features; a six-week cadence keeps releases small and low-risk.
**Cons:** maintaining an LTS branch means backporting, which is genuine ongoing cost — for 24 months
per LTS, with two LTS lines overlapping at times.

### Option D — LTS only, annual releases
**Pros:** minimal release overhead.
**Cons:** twelve months is too slow for contributors and for institutions that do want to move.

## Consequences

### Positive
- Institutions can plan upgrades against a published schedule.
- LTS gives a genuine two-year runway, which is what a change advisory board needs.
- Small six-week releases are lower risk than large annual ones.
- Time-based cadence removes the "hold the release for my feature" argument entirely.
- SDK consumers get independent versioning and are not forced to move with the platform.

### Negative
- **LTS maintenance is a real, recurring cost.** Backporting security fixes to a branch up to two
  years old, with different dependency versions, is unglamorous work that must be resourced. If it is
  not, the LTS promise becomes a lie — and this is the most likely way this ADR fails in practice.
- Two active LTS lines at times means three branches receiving fixes.
- Release process overhead every six weeks.

### Risks accepted
That LTS backporting is under-resourced and the support promise quietly degrades. Signal: security
fixes landing on `main` but not on LTS within the stated window. Mitigation: LTS backport is part of
the security fix definition of done, not a follow-up task; the Release Manager owns it explicitly;
missed backports are tracked as incidents. **We would rather shorten the LTS promise than break it.**

## Compliance and enforcement

- Conventional Commits enforced by commitlint; they drive version computation and changelog.
- Changesets for package version management; a PR changing a published package without a changeset
  fails CI.
- **Breaking-change detection** on the REST spec; a breaking change without a major bump fails CI.
- Release checklist (`scripts/release/preflight.sh`) covers: migration test, rollback test, SBOM,
  signing, upgrade notes, LTS backport assessment.
- Security fixes are not considered done until backported to all supported LTS lines.
- Every release publishes: signed artefacts, SBOM, changelog, migration notes, and an explicit
  statement of operator actions required.

## Reversal

Shortening or dropping the LTS commitment is possible but would damage trust with the operators who
planned around it. If we must, we announce at least one full LTS cycle in advance. Lengthening is
always safe.

## References

- [Semantic Versioning 2.0.0](https://semver.org/) · [Keep a Changelog](https://keepachangelog.com/) · [Changesets](https://github.com/changesets/changesets)
- [`docs/engineering/RELEASE_STRATEGY.md`](../../docs/engineering/RELEASE_STRATEGY.md)
