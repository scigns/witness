# Release Scripts

**Owner:** Release Manager
**Status:** Phase 2

Release preflight and packaging.

`preflight.sh` runs the checklist from
[`RELEASE_STRATEGY.md`](../../docs/engineering/RELEASE_STRATEGY.md): migrations tested both
directions on realistic volume, upgrade tested from previous stable **and** current LTS, rollback
tested, artefacts signed, SBOM published, **offline bundle verified**, and LTS backports assessed.

**Any role may halt a release.** A halt is the process working, not an escalation.
