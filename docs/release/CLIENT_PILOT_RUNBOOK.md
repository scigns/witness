# Client Pilot Runbook

**Status:** Active
**Owner:** Operations with Product

This is an index, not a new procedure. Every answer below points at the existing, detailed
operational doc — writing a second copy would just be something else to keep in sync. Use this page
to find the right doc fast during a pilot; read the linked section for the actual steps.

## How to invite a client

Create the organisation, assign a profile and the first admin, then add each user —
[`CLIENT_ONBOARDING_RUNBOOK.md`](../operations/CLIENT_ONBOARDING_RUNBOOK.md) §1 and §4. The
invitation itself creates a database record only — see `docs/brand/EMAIL_SYSTEM.md`'s audit — the
invited person still activates through
[`IDENTITY_ENTRY_RUNBOOK.md`](../operations/IDENTITY_ENTRY_RUNBOOK.md)'s provider-native flow.

## How to resend an invitation

`POST /organisations/:organisationId/users/:userId/invitation/resend` —
`services/api-gateway/src/organisation-invitations/organisation-invitations.controller.ts`.

## How to reset access safely

Provider-native "Forgot password?" — never a Witness-side password reset —
[`IDENTITY_ENTRY_RUNBOOK.md`](../operations/IDENTITY_ENTRY_RUNBOOK.md). For a platform-role recovery
rather than a password, see
[`PLATFORM_ROLE_MANAGEMENT_RUNBOOK.md`](../operations/PLATFORM_ROLE_MANAGEMENT_RUNBOOK.md).

## How to confirm organisation membership

[`CLIENT_ONBOARDING_RUNBOOK.md`](../operations/CLIENT_ONBOARDING_RUNBOOK.md) §5 "Verify
permissions."

## How to check API/app health

[`PILOT_OPERATIONS.md`](../operations/PILOT_OPERATIONS.md) §"Health" and §"Verification you can run
against the deployment."

## How to identify an email delivery failure

[`EMAIL_OPERATIONS.md`](../operations/EMAIL_OPERATIONS.md) for routing/sender questions;
[`KEYCLOAK_RECOVERY_EMAIL.md`](../operations/KEYCLOAK_RECOVERY_EMAIL.md) specifically for
password-reset/verification email not arriving. Read `docs/brand/EMAIL_SYSTEM.md` first if the
question is about branding rather than delivery — they're different failure modes.

## How to rollback

[`PILOT_OPERATIONS.md`](../operations/PILOT_OPERATIONS.md) §"Rollback" for the deployed
image/version; [`PHASE3C_BACKUP_AND_ROLLBACK.md`](../operations/PHASE3C_BACKUP_AND_ROLLBACK.md) for
the fuller backup inventory and Keycloak/Cloudflare rollback order.

## How to escalate an incident

[`INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — severity, response and notification.

## Before inviting a real client

Run [`PILOT_LAUNCH_CHECKLIST.md`](../operations/PILOT_LAUNCH_CHECKLIST.md) and this release's
[`WITNESS_INSTITUTIONAL_PILOT_RELEASE_CANDIDATE.md`](WITNESS_INSTITUTIONAL_PILOT_RELEASE_CANDIDATE.md)
acceptance matrix — the client journey gates in the latter (invitation → login → session → logout →
password reset → core workflow → tenant isolation) require an approved synthetic account and are
explicitly gated on human execution, not something to skip because this index exists.
