# Identity & Tenancy

**Owner:** Security Lead · Backend Lead
**Status:** Reserved — Phase 2 as a standalone service. Not built as a separate deployable; this
directory contains only this planning document. **The tenancy model itself is real and running
today** — Organisation/Workspace/OrganisationMembership/WorkspaceMembership/RoleAssignment live in
`packages/domain` and `services/api-gateway`, ratified in
[ADR-0028](../../architecture/decisions/ADR-0028-organisation-workspace-session-participant-model.md).
One claim below is stale: tenant isolation today is enforced in the application and repository
layers, not PostgreSQL row-level security — RLS remains a tracked, deferred item (see
`architecture/DATA_MODEL.md` §4), not yet implemented as this document assumed.

Organisations, workspaces, users, roles and groups. Keycloak owns authentication; this service owns
the tenancy model.

`user_account` deliberately holds **no credential** — only the OIDC `sub`. Changing IdP therefore
requires no credential migration.

Invariant: a request acts within exactly one tenant. Enforced by row-level security *and* repository
filtering, because one layer will eventually be misconfigured.
