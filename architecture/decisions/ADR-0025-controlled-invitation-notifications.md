# ADR-0025: Controlled invitation notifications

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-09-02 |
| **Deciders** | Identity, Security, Product Operations |
| **Consulted** | Repository governance and pilot operators |
| **Informed** | Institutional administrators and invited users |
| **Supersedes** | None |
| **Related** | Issue #201; ADR-0007; ADR-0024 |
| **Principles engaged** | P1, P6, P7 |

## Context

Witness historically created an invited user, membership and role but sent no onboarding
notification. The email is not an authorization mechanism: authorization remains the existing
invitation, verified identity email and server-enforced membership/role.

## Decision

Administrator invitation creates a durable `pending` notification record after the authorization
transaction commits. Witness sends a plain-text onboarding message through the already-approved
Brevo SMTP relay on port 2525. The message names the organisation, invited email, role, activation
URL and support contact, but contains no credential or bearer token.

Delivery is independently `pending`, `sent` or `failed`. Failures preserve the user, membership,
role and audit history. Administrators may resend an existing notification; resend is keyed by the
organisation/user pair and cannot create duplicate authority records. SMTP message IDs are audit
metadata only.

Activation remains a verified OIDC sign-in with the exact invited email. The `/activate` page is
informational and directs the user to the existing secure sign-in flow.

## Consequences

### Positive

- Administrators get attributable delivery state and safe retry.
- Invited users receive purposeful onboarding instructions.
- Notification failure cannot remove access authority or corrupt membership state.

### Negative

- Production requires the existing SMTP credentials and a sender identity.
- Inbox delivery still needs human acceptance and is not asserted by SMTP acceptance alone.

### Neutral

- Keycloak password recovery remains a separate provider-owned mail flow.

### Risks accepted

- Email forwarding or compromise may disclose onboarding guidance, but no credential is included
  and verified identity authentication remains mandatory.

## Compliance and enforcement

CI covers notification state transitions, resend idempotency, token absence, and exact-email
activation guidance. Production acceptance requires traceable SMTP/Brevo evidence plus human inbox
and browser verification.

## Reversal

Disable notification delivery while preserving invitation authority and its delivery records. Do
not revert to public self-registration or make email possession an authorization primitive.

## References

- Issue #201
- [Client onboarding runbook](../../docs/operations/CLIENT_ONBOARDING_RUNBOOK.md)
- [Identity entry runbook](../../docs/operations/IDENTITY_ENTRY_RUNBOOK.md)
