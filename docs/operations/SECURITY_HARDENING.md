# Security Hardening

**Owner:** Security Lead
**Status:** Target state — **Phase 2 / Phase 7 deliverable**

> ⚠️ Pre-implementation. This specifies the hardened baseline being built toward.

The default configuration is intended to be the hardened one. This document covers what remains the
operator's responsibility, and what to verify rather than assume.

---

## Verify before production

**Egress** — the sovereignty claim

- [ ] `WITNESS_DEPLOYMENT_PROFILE=sovereign`
- [ ] `make egress-test` passes
- [ ] Network policy denies outbound by default — **do not rely on the application layer alone**
- [ ] Monitor `egress_denied_total`; any non-zero value means something tried

**Identity**

- [ ] Every default credential changed — Keycloak, Postgres, Neo4j, OpenSearch, MinIO
- [ ] MFA enforced for administrative roles
- [ ] Token lifetimes reviewed (15 min access default)
- [ ] Federated to your directory; local accounts limited to break-glass
- [ ] Break-glass accounts monitored and their use alerted

**Authorisation**

- [ ] Roles assigned on least privilege; review quarterly
- [ ] Sensitivity classifications correct for your data
- [ ] Community restrictions configured with the custodians, not on their behalf

**Data**

- [ ] Encryption at rest on every volume
- [ ] Backups encrypted; **keys stored separately from backups**
- [ ] TLS 1.3 with a real certificate
- [ ] Retention configured to your statutory obligations

**Audit**

- [ ] Audit log forwarding to your SIEM configured
- [ ] Chain verification scheduled; failure raises a page
- [ ] External anchoring configured — so an attacker with database access still cannot rewrite history
      undetectably

**Supply chain**

- [ ] Release signatures verified before install. Every time
- [ ] SBOM reviewed against your policy
- [ ] Image provenance attestation checked

## Network

Expose only the web application and API. Everything else — Postgres, Neo4j, OpenSearch, MinIO,
Keycloak admin, NATS — stays on an internal network with no route from outside.

The database should not be reachable from anywhere but the application. This is obvious and it is
still the most common finding in public-sector penetration tests.

## Keys

- Use your KMS if you have one. Otherwise the documented file-based store with strict permissions.
- **Rotate on a schedule, and test the rotation** — an untested rotation procedure fails at the worst
  moment.
- Back up keys **separately** from data. A backup you cannot decrypt is not a backup.

## What we are responsible for, and what you are

**Ours:** the software, its default configuration, the documentation, coordinated disclosure, and
making the secure path the easy path. Hold us to that.

**Yours:** your infrastructure, your network, your physical security, your staff, your configuration,
and your legal basis for recording.

If our documentation made it easy for you to misconfigure something, **that is in scope for a security
report** ([`SECURITY.md`](../../SECURITY.md)) and we want to hear about it.
