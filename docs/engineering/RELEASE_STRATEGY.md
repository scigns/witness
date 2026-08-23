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

## Release classes

Witness uses different release gates for different maturity and support
commitments. A version number is not, by itself, a statement of production
readiness.

### Institutional Pilot

A pre-1.0 Institutional Pilot release is a controlled release for supervised
institutional evaluation. It is not a Stable or LTS release and does not
authorise sensitive institutional data by itself.

Deployment-specific restrictions in
[`PILOT_1_READINESS.md`](../operations/PILOT_1_READINESS.md) remain
authoritative.

The Release Manager must confirm:

- [ ] release is cut from clean, synchronised `main`
- [ ] package version and curated changelog agree
- [ ] no P0 or P1 blockers are open against the release
- [ ] required CI, Security and CodeQL checks are green on the release commit
- [ ] unit, integration and contract tests required by the current build are green
- [ ] invariant and adversarial suites are green
- [ ] zero-egress verification passes where the deployment profile requires it
- [ ] the exact release candidate SHA deployed successfully
- [ ] live health/readiness verification passed
- [ ] `STATUS.md`, `ROADMAP.md` and release notes describe the current state
- [ ] known limitations and deferred capabilities are stated explicitly
- [ ] backup and rollback status appropriate to the pilot deployment is documented
- [ ] deployment-specific readiness restrictions have not been bypassed
- [ ] Release Manager has made an explicit go/no-go decision

An Institutional Pilot release does **not** claim general production
readiness, regulatory certification, Stable/LTS support, or authorisation for
sensitive institutional data.

### Stable

A Stable release requires the Institutional Pilot controls above plus the
full production release evidence appropriate to supported institutional
operation:

**Code and evaluation**

- [ ] All required CI checks green on `main`
- [ ] No P0 or P1 issues open against this release
- [ ] Full applicable E2E, performance and evaluation suites pass
- [ ] Projection rebuild-from-log test passes where ADR-0011 is implemented
- [ ] Adversarial security suite passes
- [ ] Zero-egress verification passes in the sovereign profile

**Migration and recovery**

- [ ] Migrations tested forward and backward on realistic data volume
- [ ] Migration duration measured and documented
- [ ] Upgrade tested from the previous supported Stable release
- [ ] Rollback tested — not assumed
- [ ] Backup and independent restore drill passed

**Supply chain**

- [ ] SBOM generated (CycloneDX)
- [ ] Artefacts and images signed (cosign)
- [ ] Provenance attestation generated
- [ ] Dependency scan clean, or exceptions documented with expiry
- [ ] Offline install bundle built and verified air-gapped

**Documentation**

- [ ] Changelog curated — not just generated
- [ ] Upgrade notes written, including operator actions required
- [ ] Breaking changes documented with a migration path
- [ ] `STATUS.md` and `ROADMAP.md` current
- [ ] Known issues and limitations published honestly

### LTS

An LTS release satisfies every Stable gate and additionally requires:

- [ ] upgrade testing from the currently supported LTS line
- [ ] security fixes assessed for all supported LTS lines
- [ ] required backports completed
- [ ] support period and operator obligations published
- [ ] CTO approval for the LTS cut

### Patch and hotfix

Patch and hotfix releases use the gate of the release line they modify.
Incident response may shorten review time, but does not permit required
security, recovery or support evidence to be fabricated or silently waived.

## Automated preflight

Run `scripts/release/preflight.sh`; the Release Manager owns the final
go/no-go.

The script verifies only the controls it can establish locally and
deterministically. It is **not evidence** for deployment, GitHub CI status,
human approval, migration drills, SBOM/signing, provenance attestation or
offline-bundle verification unless it explicitly performs and reports those
checks.

For pre-1.0 versions the default release class is `institutional-pilot`.
Stable and LTS releases must not be represented as compliant until their
additional evidence has actually been produced.

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
