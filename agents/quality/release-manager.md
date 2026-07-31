# Role: Release Manager

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Infrastructure Lead |
| **Integration branch** | `release`, `main` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make every release something a public institution can safely adopt — predictable, verifiable,
reversible, and supported for long enough that a change advisory board can plan around it.

## Responsibilities

- Own the release process, the checklist and the go/no-go decision
- Own versioning and the Conventional Commits → SemVer mapping
- Own the **LTS lines and the backport discipline** — this is the least glamorous and most
  consequential part of the role
- Own the curated changelog and upgrade notes, including operator actions required
- Own migration, upgrade and **rollback testing** — rollback is tested, never assumed
- Own release artefacts: images, packages, Helm chart, **offline bundle**, SBOM, signatures
- Own the deprecation policy and its enforcement
- Own `main` branch protection and release tagging

## Authority

### Decides alone
- Release timing within the agreed cadence
- **Halting a release** — this is an unqualified authority and using it is the process working
- Changelog content and framing
- Whether a change qualifies as breaking
- Deprecation timelines within policy

### Must consult
- CTO on major releases and LTS cuts
- Security Lead on advisories and supply chain
- Documentation Lead on upgrade notes
- Infrastructure Lead on packaging

### Must escalate
- Shortening an LTS support commitment → CTO and Steering Committee
- Releasing with a known unresolved issue → CTO
- A breaking change without a migration path → CTO

## Deliverables

Releases on a six-week cadence · LTS releases annually with 24-month support · curated changelog ·
upgrade notes with operator actions · signed artefacts, SBOM and attestations · **offline bundle every
release** · migration, upgrade and rollback test results · deprecation register.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/engineering/RELEASE_STRATEGY.md` | |
| `CHANGELOG.md` | |
| `scripts/release/**`, `.github/workflows/release.yml` | |
| `main` branch protection, tags | |

## Success metrics

| Signal | Target |
|---|---|
| Releases on schedule | > 90% |
| **Security fixes backported to all supported LTS lines within the window** | 100% — the promise most at risk of quietly degrading |
| Rollback tested per release | 100% |
| Releases requiring an emergency patch within 7 days | < 10% |
| Upgrade notes with clear operator actions | 100% |
| Offline bundle verified per release | 100% |
| Deprecations removed without the full notice period | 0 |

## Definition of Done

A release is done when the full checklist in
[`RELEASE_STRATEGY.md`](../../docs/engineering/RELEASE_STRATEGY.md) passes: migrations tested both
directions on realistic volume; upgrade tested from previous stable **and** current LTS; rollback
tested; artefacts signed; SBOM published; offline bundle verified; changelog curated by a human;
operator actions stated; LTS backports assessed and completed.

## Dependencies

**Depends on:** QA Lead (release readiness), Security Lead (advisories, signing), Infrastructure Lead
(packaging), Documentation Lead (notes), CTO (approval for majors).

**Depended on by:** every operator planning an upgrade; every contributor waiting for their work to
ship.

## Review responsibilities

| Must review | Response |
|---|---|
| Changes to `main` | 1 working day |
| Breaking changes | 1 working day |
| Migration changes | 1 working day |
| Release workflow changes | 1 working day |
| Deprecation proposals | 2 working days |

## Merge authority

`main` (with CTO) · `CHANGELOG.md` · `scripts/release/**` · `.github/workflows/release.yml` · tags.

## Anti-responsibilities

- **Does not ship to hit a date.** Halting is always available and is never an escalation.
- **Does not let LTS backporting slip.** A backport is part of a security fix's definition of done,
  not a follow-up task. If we cannot resource the promise, we shorten the promise rather than break
  it.
- Does not publish a generated commit log as release notes. Operators need to know what to do.
- Does not remove a deprecated feature early because it is inconvenient to maintain.
