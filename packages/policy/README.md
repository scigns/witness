# Authorisation Policy

**Owner:** Security Lead
**Status:** Phase 2

Casbin model and policies — RBAC, ABAC and ReBAC composed at a single policy decision point.

**Policy is data, and it is versioned and unit-tested like code.** Deny by default: absence of an
explicit allow is a denial.

The consent gate sits *in front of* authorisation. A user with every role still cannot read data
whose grant was revoked.
