# Identity entry runbook

**Status:** Implemented and deployed; production email delivery is configured; recovery acceptance
remains pending

**Owner:** Witness Platform Operations

Witness delegates credentials to Keycloak. The application does not store passwords or implement a
parallel reset system.

## User-facing entry points

The production sign-in page is:

`https://app.buildwithwitness.com/signin`

It exposes:

- **Sign in** — normal OIDC authorization-code-with-PKCE;
- **Forgot password?** — provider-native Keycloak reset-credentials flow;
- **New to Witness? Create account** — provider-native Keycloak registration flow.

The API routes are `GET /api/v1/auth/login`, `GET /api/v1/auth/forgot-password`, and
`GET /api/v1/auth/register`. They only redirect to the configured OIDC provider; they do not accept
passwords or create platform authority.

## Keycloak realm settings

The versioned realm definition enables `registrationAllowed`, `resetPasswordAllowed`, and
`verifyEmail`. On an existing production realm, these settings must be applied through the approved
Keycloak administration mechanism; importing the file does not overwrite an already-initialised
realm.

Password reset and email verification require Keycloak SMTP to be configured through the production
secret/configuration process. Never place SMTP credentials in Witness source, logs, or this runbook.
Production Brevo SMTP transport over port 2525 has been demonstrated through STARTTLS, authenticated
submission, and provider acceptance. End-to-end mailbox delivery remains a human acceptance step.

The canonical controlled recovery identity is `hello@buildwithwitness.com`. This is a Cloudflare
Email Routing alias forwarding to the approved destination; it is not an independent mailbox.
Do not use or document `witness-test@buildwithwitness.com` as a recovery identity unless that address
is explicitly provisioned in a future controlled test environment.

The expected sender is an approved Witness system identity such as `hello@buildwithwitness.com` or
another deployment-approved sender configured in Keycloak SMTP. Sender identity and
recovery-recipient identity are distinct concerns and must not be inferred from one another.

The realm definition also sets `"emailTheme": "witness"`
(`infrastructure/docker/keycloak-theme/witness/`), which rebrands these emails to the Brand Book —
see `docs/brand/EMAIL_SYSTEM.md` for what was changed and how it was verified against a real
Keycloak instance. Like the settings above, this has no effect on an already-initialised production
realm until applied through the same approved Keycloak administration mechanism.

## Witness linking rules

After a verified OIDC callback, Witness links the identity only to an existing invited Witness user.
Self-registration therefore creates an identity at Keycloak but does not grant access to an existing
Witness organisation. An uninvited user receives a safe message explaining that an administrator
must grant organisation access; matching an email domain never auto-joins an organisation.

No registration or password reset can grant an organisation role, platform role, or
`payment:settle` authority.

## Controlled production recovery acceptance

Use `hello@buildwithwitness.com` for the controlled human acceptance flow unless a separately approved
synthetic identity has been provisioned.

1. Open the production sign-in page.
2. Use **Create account** if the identity does not exist, or **Forgot password?** if it does.
3. Confirm the generic recovery response does not disclose whether an account exists.
4. Confirm the recovery email reaches the forwarding destination for `hello@buildwithwitness.com`.
5. Open the reset link without copying the link or token into logs, issues, chat, or test output.
6. Set a test-only password.
7. Sign in through the normal production OIDC flow.
8. Confirm the previous password is rejected where applicable.
9. Confirm the used reset link cannot be replayed.
10. Record only PASS/FAIL evidence and safe correlation identifiers; never record credentials,
    authorization codes, reset tokens, or the reset URL.

Human acceptance is not complete until receipt, reset-link use, password change, post-reset login,
and replay rejection have all been observed.

## Current operator onboarding

For `hello@buildwithwitness.com`:

1. Open the production sign-in page.
2. Use **Create account** if the identity does not exist, or **Forgot password?** if it does.
3. Complete Keycloak email verification and normal OIDC sign-in.
4. Have an administrator invite the resulting email to the required organisation, if needed.
5. Verify the Witness account is active and linked before using the separately approved platform
   role recovery procedure.

Platform recovery remains an explicit operator command and is never triggered by sign-in or account
creation.
