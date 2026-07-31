# Identity & Tenancy

**Owner:** Security Lead · Backend Lead
**Status:** Phase 2

Organisations, workspaces, users, roles and groups. Keycloak owns authentication; this service owns
the tenancy model.

`user_account` deliberately holds **no credential** — only the OIDC `sub`. Changing IdP therefore
requires no credential migration.

Invariant: a request acts within exactly one tenant. Enforced by row-level security *and* repository
filtering, because one layer will eventually be misconfigured.
