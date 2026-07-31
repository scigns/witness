# Release Strategy

**Owner:** Release Manager
**Status:** Active
**Decision record:** [ADR-0017](../../architecture/decisions/ADR-0017-versioning-and-release-strategy.md)

---

## Cadence

| Line | Frequency | Support | Contents |
|---|---|---|---|
| **Stable** | Every 6 weeks | Until next stable | Features and fixes |
| **LTS** | Every 12 months | **24 months** | Security and critical fixes after cut |
| **Patch** | As needed | — | Security and critical fixes |

**Why LTS matters here.** Our users are public institutions. An upgrade means procurement, a change
advisory board, security review, a testing window and a budget line — measured in months. A release
policy designed for continuously-deployed SaaS would simply be ignored, and institutions would run
unpatched versions indefinitely. Meeting them where they are is a security measure, not a courtesy.

## Versioning

Semantic versioning. The **REST API contract** governs the platform major version — a breaking REST
change means a major release, without exception. The GraphQL BFF is not a public contract and does
not constrain versioning ([ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md)).

SDK and contract packages version independently via Changesets.

**Pre-1.0: minor versions may break.** Stated loudly rather than quietly, because pretending to be
stable before we are is how trust is lost early.

## Release checklist

Run by `scripts/release/preflight.sh`; the Release Manager owns the go/no-go.

**Code**
- [ ] All required CI checks green on `main`
- [ ] No P0 or P1 issues open against this release
- [ ] Full test suite including E2E, performance and evaluation
- [ ] **Projection rebuild-from-log test passes** (validates ADR-0011)
- [ ] Adversarial security suite passes
- [ ] Zero-egress verification passes in the sovereign profile

**Migration and recovery**
- [ ] Migrations tested forward **and** backward on a realistic data volume
- [ ] Migration duration measured and documented
- [ ] Upgrade tested from the previous stable **and** from the current LTS
- [ ] Rollback tested — not assumed
- [ ] Backup and restore drill passed

**Supply chain**
- [ ] SBOM generated (CycloneDX)
- [ ] Artefacts and images signed (cosign)
- [ ] Provenance attestation generated
- [ ] Dependency scan clean, or exceptions documented with expiry
- [ ] Offline install bundle built and verified air-gapped

**Documentation**
- [ ] Changelog curated — not just generated
- [ ] Upgrade notes written, including **operator actions required**
- [ ] Breaking changes documented with a migration path
- [ ] `STATUS.md` and `ROADMAP.md` current
- [ ] Known issues and limitations published honestly

**Security and support**
- [ ] Security fixes backported to **all supported LTS lines** — this is part of the fix's
      definition of done, never a follow-up task
- [ ] Advisories drafted for any disclosed vulnerability

## Changelog

Generated from Conventional Commits, then **curated by a human**. A raw commit log is not release
notes; operators need to know what to do, not what we typed.

Changes affecting **consent, provenance, data sovereignty, security or migration** get their own
called-out section regardless of size, because they carry obligations for operators. Format in
[`CHANGELOG.md`](../../CHANGELOG.md).

## Artefacts

| Artefact | Destination |
|---|---|
| Container images | GHCR + offline OCI bundle |
| npm packages (SDK, contracts) | npm |
| Python package (SDK) | PyPI |
| Helm chart | OCI registry |
| **Offline install bundle** | Release assets, checksummed and signed |
| SBOM, signatures, attestations | Release assets |

The offline bundle ships with **every** release. Air-gapped operators are not second-class, and a
bundle produced only on request is one that is never tested.

## Hotfix

1. Branch `hotfix/<issue>` from `main`
2. Minimal fix, with a test that fails without it
3. Expedited review — Security Lead may merge without the usual window for an active incident
4. Tag, release
5. **Back-merge to `develop` and all supported LTS lines immediately**

A hotfix that is not back-merged reappears as a regression in the next release. This should only
ever happen to us once.

## Deprecation

| Surface | Notice |
|---|---|
| REST API | 12 months minimum, plus one LTS cycle |
| Event schema | One major version, published in parallel |
| Configuration | 2 stable releases, with a warning logged |
| Feature | 2 stable releases, announced in release notes |

Deprecations are announced in release notes, logged at runtime with a clear migration path, and
tracked to removal. **We do not remove things silently**, and we do not shorten a notice period
because it is inconvenient.

## Release roles

| Role | Responsibility |
|---|---|
| **Release Manager** | Owns the process, the checklist and the go/no-go |
| **Security Lead** | Signs off supply chain and advisories |
| **Documentation Lead** | Signs off changelog and upgrade notes |
| **CTO** | Final approval for major releases and LTS cuts |

**Any of these may halt a release.** A halt is not an escalation or a failure — it is the process
working. We would far rather slip a date than ship something an operator cannot safely upgrade to.
