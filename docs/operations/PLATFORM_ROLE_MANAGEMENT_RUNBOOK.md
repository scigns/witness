# Platform role management runbook

**Status:** Implemented; production provisioning requires separate approval

**Owner:** Witness Platform Operations

Platform authority is the global authority to operate Witness itself. It is represented by the
existing `RoleAssignment` model with `scopeType = platform`, no organisation or workspace ID, and
currently the `admin` role. Platform-only capabilities such as commercial settlement resolve from
this scope when their separately approved feature policy is installed.

**Platform authority is not an organisation entitlement.** An organisation administrator manages
their institution only. Organisation membership and platform authority are independent records;
granting or revoking one does not create, remove, or change the other.

## Initial bootstrap administrator

On a new empty deployment, `pnpm --filter @witness/api bootstrap` creates the first organisation,
its invited administrator, and the first platform-scoped administrator. Bootstrap refuses to run
after any organisation exists and is not a post-bootstrap role-management command.

The invited identity becomes usable only after normal sign-in with a verified OIDC email links the
external identity and activates the Witness user.

## Prerequisites for normal commands

Obtain a short-lived Witness session through normal OIDC authentication as an existing platform
administrator. Do not place the token in shell history or documentation. Supply it through the
operator's protected environment as `WITNESS_SESSION_TOKEN`, with `WITNESS_API_URL` set to the API
origin.

List current assignments:

```bash
pnpm --filter @witness/api platform-role list
```

The underlying authenticated route is `GET /api/v1/platform/role-assignments`. It returns safe user,
account-state, OIDC-link and role facts; never tokens or provider subjects.

## Normal grant

The target must already be an active Witness user with an identity link created by a verified OIDC
sign-in. The command does not create or verify an identity.

```bash
pnpm --filter @witness/api platform-role grant \
  --email founder@example.com \
  --role admin \
  --reason "Board-approved initial commercial operator"
```

This calls `POST /api/v1/platform/role-assignments`. Repeating the same grant is idempotent. An
ordinary organisation administrator, unauthenticated caller, or development-header identity is
denied.

## Normal revocation

List assignments to obtain the target user ID, confirm another usable platform administrator exists,
then run:

```bash
pnpm --filter @witness/api platform-role revoke \
  --user-id 00000000-0000-4000-8000-000000000000 \
  --reason "Platform authority is no longer required"
```

This calls `DELETE /api/v1/platform/role-assignments/:userId`. It removes only the platform
assignment. The account and all organisation memberships remain unchanged. The service refuses to
remove the last active, OIDC-linked platform administrator.

After revocation, verify the former operator receives `403` from the list route. Once the separately
approved settlement feature is installed, also verify they cannot resolve `payment:settle`. Verify
their ordinary organisation access separately.

## Controlled recovery provisioning

Recovery is for the administrative dead end where organisations exist but no usable platform
administrator remains. It is intentionally not an HTTP route and does not run at application startup.
Run it only on the application host, through the reviewed container/CLI process, after explicit
approval:

```bash
pnpm --filter @witness/api platform-role recover \
  --email founder@example.com \
  --role admin \
  --reason "No usable bootstrap platform administrator" \
  --confirm RECOVER_PLATFORM_ADMIN
```

Recovery fails closed when any active, OIDC-linked platform administrator exists. The named target
must already exist, be active, and have a linked verified OIDC identity. It does not create a
Keycloak user, verify email, activate an account, or accept a development identity. The explicit
confirmation phrase is mandatory and the command serialises with normal mutations.

## Audit and verification

Every effective change is written through the existing hash-chained audit mechanism on the role
assignment subject:

- `platform_role.granted`
- `platform_role.revoked`
- `platform_role.recovered`

Events record target, role, previous/resulting state, actor or recovery operator, reason and time.
They never record tokens, credentials, provider subjects, or OIDC secrets.

To verify authority without settling an invoice:

1. authenticate normally through OIDC;
2. call `GET /api/v1/platform/role-assignments` and expect `200`;
3. confirm an organisation-only administrator receives `403`;
4. after the settlement feature is separately approved and installed, use settlement-context access,
   without submitting a settlement, to confirm `payment:settle`;
5. verify development-header impersonation receives `401`.

For safe rotation, grant and verify the replacement first, then revoke the outgoing operator. If all
operators are lost, use the separately approved recovery procedure above.
