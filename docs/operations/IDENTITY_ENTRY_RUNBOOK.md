# Identity entry runbook

**Status:** Implemented in application; production Keycloak email delivery requires operator configuration

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
The expected sender is an approved Witness system mailbox, such as `hello@buildwithwitness.com`.

## Witness linking rules

After a verified OIDC callback, Witness links the identity only to an existing invited Witness user.
Self-registration therefore creates an identity at Keycloak but does not grant access to an existing
Witness organisation. An uninvited user receives a safe message explaining that an administrator
must grant organisation access; matching an email domain never auto-joins an organisation.

No registration or password reset can grant an organisation role, platform role, or
`payment:settle` authority.

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
