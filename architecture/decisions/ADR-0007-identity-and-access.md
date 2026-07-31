# ADR-0007: Identity with Keycloak, authorisation with Casbin

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Security Lead, Backend Lead, Infrastructure Lead |
| **Related** | ADR-0008 (consent gate sits in front of this) |
| **Principles engaged** | P1 (sovereignty), P7 |

## Context

Every institution deploying Witness already has an identity system — Entra ID, an LDAP directory, a
national SSO, or several. Asking them to manage a second set of credentials is both a security
regression and an adoption blocker.

Authorisation is genuinely complex here. A decision to allow or deny depends on: the user's role,
their tenant, the resource's sensitivity class, whether a community restriction applies, whether the
user is a member of that community, whether they participated in the session, whether consent covers
the purpose, and the deployment profile. Expressing that in scattered conditional logic is how
privacy incidents happen — and our worst-case incident is exposure of culturally restricted knowledge,
which is irreversible.

## Decision

> We will use **Keycloak** as the identity provider, federating to whatever the institution already
> runs, and **Casbin** as a single policy decision point composing RBAC, ABAC and ReBAC.

Authentication: OIDC authorisation code with PKCE. Services validate JWTs locally against cached
JWKS. Authorisation: every access decision goes through one PDP; **absence of an explicit allow is a
deny**.

## Options considered

### Identity

**Option A — Keycloak *(chosen)*.** The reference open-source IdP for government. OIDC, SAML, LDAP/AD
federation, identity brokering, step-up authentication. Apache-2.0, Red Hat backed, CNCF incubating.
*Cons:* heavy — a meaningful share of the platform's total operational complexity is Keycloak's; JVM
tuning; upgrades occasionally require attention.

**Option B — Build our own.** Rejected without much deliberation. Rolling authentication for a system
holding community testimony would be professional negligence.

**Option C — Zitadel or Authentik.** Lighter, more modern, good developer experience. *Cons:* less
proven in government federation scenarios; smaller ecosystem; less likely to be already trusted by a
procurement office. Kept as alternative bindings behind `IdentityProviderPort` for small deployments.

**Option D — Hosted (Auth0, Clerk, WorkOS).** Rejected outright — violates P1.

### Authorisation

**Option A — Casbin *(chosen)*.** Policy as data, not code. Supports RBAC + ABAC + ReBAC in one model.
Policies are versioned files, unit-testable in isolation. Apache-2.0, mature, multi-language.
*Cons:* the model/matcher syntax is terse and has a learning curve; complex policies can be hard to
read; performance requires attention with large policy sets.

**Option B — Open Policy Agent / Rego.** More powerful, CNCF graduated, widely adopted.
*Cons:* another service to run, or an embedded WASM runtime; Rego is a harder language to learn than
Casbin's matcher; heavier for our scale. Strong alternative — the reason we did not choose it is
operability, and if our policy complexity outgrows Casbin, OPA is where we go.

**Option C — Application-level checks.** Rejected. This is the option that produces incidents.

**Option D — Postgres row-level security alone.** We *do* use RLS — as the second layer of defence in
depth for tenant isolation. It cannot express community restriction, consent scope or graph
relationships, so it is a complement, not a replacement.

## Consequences

### Positive

- Institutions keep their existing identity infrastructure; no second credential store.
- One place to reason about, review and test authorisation, rather than hundreds of call sites.
- Policy changes do not require code changes or a deployment.
- Policies are unit-tested; we can assert "a community-restricted node is invisible to a
  non-member administrator" as an executable test.
- Deny-by-default is structural.

### Negative

- Keycloak is a substantial operational burden for a small operator. Mitigated by realm-as-code,
  shipped configuration and detailed runbooks — but the burden is real and we should say so.
- Casbin's syntax is unfriendly; policy authoring will concentrate in a few people, which is a bus
  factor risk.
- A central PDP is on the hot path of every request; it must be fast and highly available. It is
  in-process with a cached policy set, and we accept the resulting cache-invalidation complexity.

### Risks accepted

- **Fail-closed availability cost:** if policy evaluation fails, we deny. A PDP bug becomes an
  outage rather than a breach. That is the correct trade for this product, and it is a deliberate
  acceptance of reduced availability in favour of correctness.
- Policy complexity growth outrunning Casbin's readability. Signal: policy files nobody can review
  confidently. Response: migrate to OPA.

## Compliance and enforcement

- Every API endpoint declares its authorisation requirement; an endpoint without one fails an
  architecture fitness test.
- Policy files are versioned, reviewed by the Security Lead via CODEOWNERS, and unit-tested.
- **Adversarial test suite** in CI: cross-tenant access, community restriction bypass, privilege
  escalation via role composition, and sensitivity-downgrade attempts. These tests are expected to
  fail loudly if anyone weakens the model.
- No service holds a database superuser credential.
- JWT validation is centralised in a shared guard; hand-rolled token parsing fails review.

## Reversal

`IdentityProviderPort` and `AuthorizationPort` make substitution an adapter change. Swapping Keycloak
for Zitadel: roughly one to two weeks plus user migration (external subject IDs change, which is the
painful part). Swapping Casbin for OPA: one to two weeks, plus policy translation.

## References

- [Keycloak](https://www.keycloak.org/) · [Casbin](https://casbin.org/) · [OPA](https://www.openpolicyagent.org/)
- [`SECURITY_ARCHITECTURE.md`](../SECURITY_ARCHITECTURE.md)
