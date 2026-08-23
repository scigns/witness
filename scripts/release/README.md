# Release Scripts

**Owner:** Release Manager
**Status:** Phase 2

Release preflight and packaging.

`preflight.sh` performs the deterministic local checks described in
[`RELEASE_STRATEGY.md`](../../docs/engineering/RELEASE_STRATEGY.md).

It does **not** by itself prove deployment success, GitHub CI status, human
approval, migration or recovery drills, SBOM generation, artefact signing,
provenance attestation, offline-bundle verification, or LTS backport
completion unless those checks are explicitly implemented and reported by the
script.

For pre-1.0 platform versions, the default release class is
`institutional-pilot`.

Institutional Pilot releases are controlled, supervised evaluation releases.
They do not claim general production readiness, Stable/LTS support, regulatory
certification, or authorisation for sensitive institutional data. The
deployment-specific readiness decision remains authoritative.

Stable and LTS releases retain the stronger migration, recovery, supply-chain,
signing, provenance, offline-distribution and support requirements defined in
the release strategy.

**Any role may halt a release.** A halt is the process working, not an escalation.
