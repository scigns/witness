# Deployment Guide

**Owner:** Infrastructure Lead & Documentation Lead
**Status:** Target state — **Phase 2 deliverable**
**Architecture:** [`DEPLOYMENT_ARCHITECTURE.md`](../../architecture/DEPLOYMENT_ARCHITECTURE.md)

> ⚠️ **Witness is pre-implementation.** There is nothing to deploy yet ([`STATUS.md`](../../STATUS.md)).
> This document specifies the deployment experience we are committing to build, so that operator
> requirements shape the software rather than being discovered afterwards.
>
> Publishing the target now is deliberate: it lets operators tell us it is wrong before we build it.

---

## Choose a profile

| Profile | Egress | Use when |
|---|---|---|
| **`sovereign`** *(default)* | **None** | Government, Indigenous organisation, air-gapped, or any deployment where data must not leave |
| `hybrid` | Allowlist only, per-tenant opt-in | You have an approved external model provider and have decided, deliberately, to use it |
| `development` | Permitted | Local development only — refused when `NODE_ENV=production` |

**A misconfigured profile refuses to start.** A `sovereign` instance with an external provider
configured exits with a clear error rather than running in a state you believe is safe and is not.

## Choose a topology

| Topology | Users | Meetings/yr | Resources |
|---|---|---|---|
| **Single node** *(recommended)* | < 100 | < 500 | 8 vCPU · 32 GB · 500 GB SSD |
| Single node, larger | < 1,000 | < 5,000 | 24 vCPU · 96 GB · 4 TB · 1 GPU |
| Kubernetes | < 10,000 | < 50,000 | Cluster + GPU node pool |

**Single-node Docker Compose is a first-class production target**, not a development convenience. Most
institutions should run it. Do not adopt Kubernetes because it seems more serious — adopt it when you
have outgrown one machine and have people who operate clusters.

**Without a GPU**, transcription runs 6–10× slower than realtime: a one-hour meeting takes 6–10 hours.
That is fine for overnight batch processing. We state it plainly because discovering it in production
would be a legitimate grievance.

## Single-node installation *(planned)*

```bash
# 1. Fetch the release bundle (or the offline bundle for air-gapped installs)
curl -LO https://github.com/scigns/witness/releases/latest/download/witness-bundle.tar.gz
curl -LO https://github.com/scigns/witness/releases/latest/download/witness-bundle.tar.gz.sig

# 2. Verify the signature. Do not skip this.
cosign verify-blob --signature witness-bundle.tar.gz.sig witness-bundle.tar.gz

tar xzf witness-bundle.tar.gz && cd witness

# 3. Configure
cp .env.example .env
$EDITOR .env          # set passwords, WITNESS_DATA_RESIDENCY, retention

# 4. Install
make install-single-node

# 5. Verify
make verify-deployment
make egress-test      # confirms zero external calls in the sovereign profile
```

## Air-gapped installation

The proof that our sovereignty claim is real rather than marketing.

```bash
# On a connected machine
make download-offline-bundle    # images, model weights, checksums

# Transfer by whatever means your policy allows, then on the target
make install-offline
```

Everything is included: container images as OCI archives, model weights checksum-pinned, all
dependencies vendored. There is no licence server, no telemetry endpoint and no update check — there
is nothing to disable, because none of it exists.

Security advisories reach air-gapped operators through the out-of-band process in
[`ADMIN_GUIDE.md`](ADMIN_GUIDE.md).

## Before production — the checklist

**Security**
- [ ] Every default password changed
- [ ] TLS configured with a real certificate
- [ ] Network policy restricting inbound access
- [ ] `make egress-test` passes
- [ ] [`SECURITY_HARDENING.md`](SECURITY_HARDENING.md) worked through

**Data**
- [ ] `WITNESS_DATA_RESIDENCY` set accurately — **it is shown to the people you record**
- [ ] Retention policy configured to your statutory obligations
- [ ] Backup target configured and reachable
- [ ] **A restore actually performed and verified.** An untested backup is a hypothesis

**Identity**
- [ ] Keycloak federated to your directory
- [ ] MFA enforced for administrative roles
- [ ] Roles assigned; least privilege verified

**Consent** — the part that is not technical
- [ ] Lawful basis determined **for your jurisdiction** (we do not give legal advice)
- [ ] Consent text reviewed, translated, and comprehension-tested
- [ ] Staff who obtain consent are trained — the interface cannot fix a bad conversation
- [ ] Withdrawal process tested end to end, including requests arriving outside the system

**Operations**
- [ ] Monitoring and alerting configured
- [ ] Runbooks accessible to on-call staff
- [ ] Recovery drill scheduled (quarterly)
- [ ] Upgrade and rollback rehearsed on non-production data

## Recovery objectives

| | Single node | Kubernetes |
|---|---|---|
| RPO | ≤ 24 h nightly, or ≤ 15 min with WAL shipping | ≤ 15 min |
| RTO | ≤ 8 h | ≤ 4 h |

**Back up:** PostgreSQL, object storage, the Keycloak realm, configuration, encryption keys.
**Do not back up:** Neo4j, OpenSearch, embeddings — they rebuild from the event log
([ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)).

This is deliberate and is the main operational dividend of the architecture: **you back up one database
and one object store**, not four stores requiring consistent snapshots.

⚠️ **When restoring, you must replay the erasure list.** A restore that skips this step resurrects
data that people withdrew. It is documented in the runbook, tested in the drill, and it is the single
most important step not to skip.

## Getting help

[Documentation issue](https://github.com/scigns/witness/issues/new?template=docs.yml) if this guide
failed you — that is our defect, not yours.
