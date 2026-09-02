# Keycloak recovery email operations

**Status:** Production P0 recovery control

**Owner:** Witness Platform Operations

Witness password recovery is provider-native. The API redirects the user into Keycloak; Keycloak,
not the Witness API, generates the reset action email. Cloudflare Email Routing only receives and
forwards mail after the sender has successfully submitted it.

## Current production finding

As of 2026-09-02, `hello@buildwithwitness.com` receives independently sent email correctly, but a
Forgot password request through Witness does not produce a reset email. Therefore Cloudflare
forwarding is not the current fault domain. Reset-email delivery is `FAIL` until the production
Keycloak path is repaired and accepted.

The canonical controlled recovery identity is:

`hello@buildwithwitness.com`

Do not use `witness-test@buildwithwitness.com`; it is not provisioned.

## Why deploy success is insufficient

The versioned realm enables registration, password reset and email verification, but realm import
does not overwrite an existing production realm. SMTP is stored on the Keycloak realm. A successful
direct Brevo SMTP transport test also does not prove that Keycloak has the same configuration.

Use the governed diagnostic:

```bash
WITNESS_ENV_FILE=/home/witness/witness/.env \
  bash scripts/pilot/reconcile-keycloak-email.sh check
```

The command prints only safe state:

- whether an SMTP map exists;
- SMTP host, port, sender and TLS-mode metadata;
- whether the exact canonical recovery identity exists and is enabled/verified.

It never prints the SMTP user/password, Keycloak user ID, reset token, reset URL or password.

## Secret-backed configuration contract

For an SMTP-enabled deployment provide these values in the production secret environment, never in
Git:

```text
KEYCLOAK_SMTP_HOST=smtp-relay.brevo.com
KEYCLOAK_SMTP_PORT=2525
KEYCLOAK_SMTP_FROM=hello@buildwithwitness.com
KEYCLOAK_SMTP_STARTTLS=true
KEYCLOAK_SMTP_SSL=false
KEYCLOAK_SMTP_USER=<secret>
KEYCLOAK_SMTP_PASSWORD=<secret>
WITNESS_KEYCLOAK_RECOVERY_TEST_EMAIL=hello@buildwithwitness.com
```

Witness operations may continue to supply the existing `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY`
secret names instead of the two generic Keycloak credential variables. The reconciliation script
supports both forms. Do not create a new SMTP key merely to rename a secret.

The sender must be an identity the configured SMTP provider permits. Do not assume that the
recovery recipient and SMTP sender must be the same address.

## Apply reconciliation

After the safe diagnostic identifies missing/stale SMTP configuration and the approved secret values
are present, run:

```bash
WITNESS_ENV_FILE=/home/witness/witness/.env \
  bash scripts/pilot/reconcile-keycloak-email.sh apply
```

This patches only the realm `smtpServer` configuration. It does not reset the database, recreate the
realm, change DNS, change Cloudflare routing, create a Keycloak user or alter Witness roles.

If the diagnostic reports `recovery_identity=absent` or `present_not_ready`, repair the exact
Keycloak identity through the approved identity administration path. Do not weaken Keycloak account
enumeration protections merely to make diagnosis easier.

## Acceptance after repair

1. Open `https://app.buildwithwitness.com/signin`.
2. Select **Forgot password?**.
3. Submit `hello@buildwithwitness.com`.
4. Confirm the response remains generic/non-enumerating.
5. Confirm a reset email reaches the forwarding destination.
6. Open the reset link without copying it into logs/issues/chat.
7. Change the test password.
8. Sign in through the normal OIDC flow.
9. Confirm the old password is rejected where applicable.
10. Confirm the used reset link cannot be replayed.

Record only PASS/FAIL and safe correlation identifiers.

Do not declare authentication GREEN until the complete sequence passes.
