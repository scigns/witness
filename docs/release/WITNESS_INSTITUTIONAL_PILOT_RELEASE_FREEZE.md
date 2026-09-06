# Witness Institutional Pilot — Release Freeze

**Status:** Active — feature freeze in effect
**Owner:** Founder / Product Lead with Engineering
**Declared:** 2026-09-06
**Release basis:** `main` at (or after) `0.4.0` — "Controlled Commercial Settlement Release" per
`CHANGELOG.md` — plus everything merged since (Brand Book source of truth, branded commercial
website, MKT-04/05/06, branded email system). The next published version number is a release-manager
decision through the repository's normal changeset process (`pnpm version`); this document does not
assign one.

## Why

Getting Witness into real pilot clients' hands safely is now the priority, ahead of any further
roadmap expansion. This is a release programme, not a feature-development programme, until that
happens.

## What's frozen

No new features. From this declaration onward, a change is in scope only if it is one of:

- `RELEASE BLOCKER`
- `SECURITY BLOCKER`
- `CLIENT ACCESS BLOCKER`
- `DATA INTEGRITY BLOCKER`
- `DEPLOYMENT BLOCKER`
- `CRITICAL UX BLOCKER`
- `DOCUMENTATION REQUIRED FOR RELEASE`

Concretely, do not start: MKT-07 (Conversion), MKT-08 (Packaging), MKT-09 full build (a minimal
truthful Trust/Privacy page is release-scope per the release checklist; the full Trust Centre is
not), MKT-10 onward, new analytics, new pricing systems, new dashboards, new integrations, new AI
features.

## Release principle

A task is in scope only if its failure would prevent one of:

- a client understanding Witness (public website minimum);
- a client reaching the application;
- a client receiving an invitation;
- a client signing in;
- a client recovering access;
- a client entering the correct organisation;
- a client using the core evidence/decision workflow;
- support restoring service safely.

Everything else is deferred until after the pilot release. See
[`WITNESS_INSTITUTIONAL_PILOT_RELEASE_CANDIDATE.md`](WITNESS_INSTITUTIONAL_PILOT_RELEASE_CANDIDATE.md)
for the acceptance matrix and current readiness against these gates.
