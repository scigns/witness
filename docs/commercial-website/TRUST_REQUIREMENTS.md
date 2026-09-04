# Witness Commercial Website Trust Requirements

**Owner:** Security, Privacy, Operations and Product
**Status:** Evidence inventory required; public trust centre not started
**Last reviewed:** 2026-09-02

## Publication rule

Every statement must be classified as deployed capability, supported configuration, planned roadmap
or aspiration and linked to evidence. Never claim SOC 2, ISO certification, government accreditation
or sovereign certification without documentary authority and human approval.

## Evidence domains

- Authentication, session handling, RBAC and tenant separation.
- Audit/provenance behaviour and secure development lifecycle.
- Encryption, backups, recovery, retention and vulnerability handling.
- Privacy, data ownership, subprocessors and data residency.
- Cloud, dedicated, customer-managed and jurisdiction-specific deployment support.
- Accessibility and service/status practices.
- Open-source licensing and procurement information.

## Audit observations

Strong internal evidence exists for Keycloak OIDC, application/server session controls, RBAC,
consent, audit invariants, private database topology, CI/security scanning, backups and sovereign
design. Important qualifications remain: database RLS is absent, API rate limiting is unenforced,
several deployment models are documented rather than commercially proven, and no public status or
trust surface exists.

MKT-09 must create a claim-evidence matrix and obtain domain-owner review before publishing pages.
Security-sensitive implementation detail must not be exposed merely to make the page appear thorough.
