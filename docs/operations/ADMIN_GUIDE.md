# Administrator Guide

**Owner:** Documentation Lead & Infrastructure Lead
**Status:** Target state — **Phase 2–6 deliverable**

> ⚠️ Witness is pre-implementation. This specifies the administration experience being built.

---

## What an administrator can and cannot do

Worth stating first, because it is unusual.

**Can:** configure tenants and workspaces · manage users and roles · set retention and disposal
policy · configure model and egress policy · view audit logs · run exports · manage consent
administration.

**Cannot:**

- **Read community-restricted knowledge.** There is no role that bypasses this and no break-glass
  mechanism ([ADR-0019](../../architecture/decisions/ADR-0019-indigenous-data-sovereignty.md)).
- **Process data without a recorded consent grant.** The system refuses.
- **Silently alter the audit log.** It is hash-chained and append-only.
- **Confirm assertions on behalf of reviewers.** Administrative authority is not domain authority.

If you are debugging an issue involving restricted knowledge, you will not be able to inspect the
data. Support procedures work around the control; the control does not bend for support. This is
deliberate — communities have extensive experience of assurances that held until they were
inconvenient.

## Core tasks

| Task | Notes |
|---|---|
| **Create a tenant** | Set data residency, deployment profile, retention defaults |
| **Configure consent** | Legal bases available, default expiry, capture methods, consent text per language |
| **Manage retention** | Per data class. Expiry is enforced by a scheduled job and emits events |
| **Handle a withdrawal** | Triggers erasure across every store, verified. **Monitor it to completion** |
| **Configure models** | Which models, and whether external providers are permitted per tenant |
| **Review the audit log** | Verify the hash chain; investigate access to sensitive material |
| **Run an export** | Audited. Restricted and non-exportable content is excluded |

## Consent administration

The highest-consequence area of the console.

- **Withdrawal requests must be actioned promptly**, including those arriving by phone, letter or
  through a community custodian. The SLO for propagation is 5 minutes once recorded; the delay that
  matters is how long it takes *you* to record it.
- **Watch the propagation dashboard** after a withdrawal. Verification runs automatically and fails
  loudly, but a failure needs a human.
- **Community delegations** must have their basis recorded — a council resolution, a customary role,
  a
  written protocol. Do not record a delegation you cannot evidence.

## Monitoring — the metrics that matter here

Beyond the usual golden signals:

| Metric | Alert | Why |
|---|---|---|
| `consent_revocation_propagation_seconds` | **Page** if p99 > 300 s | Our hardest guarantee |
| `audit_chain_verification_status` | **Page** on failure | Potential tampering |
| `egress_denied_total` | Warn on any non-zero in `sovereign` | Something tried to phone home |
| `projection_lag_events` | Warn > 1,000 · page > 10,000 | Users are seeing stale data |
| `review_queue_age_hours` | Warn | Human review is the known bottleneck |

Every alert has a runbook. An alert without one is a defect — please report it.

## Upgrades

1. Read the release notes, particularly **operator actions required**
2. Back up, and **verify the backup restores**
3. Apply on a non-production copy first
4. Run migrations as a separate, inspectable step
5. Verify, then keep the rollback path available until you are confident

**LTS releases** are supported 24 months. You do not need to upgrade every six weeks, and the release
policy is designed around the fact that you cannot.

## Air-gapped operations

**Security advisories** reach you out-of-band: subscribe to the advisory mailing list from a connected
machine, or check the repository's security advisories page on a regular cadence you define. This is
the one genuine disadvantage of air-gapped operation and it needs a named owner in your organisation.

**Updates** arrive as signed offline bundles. Verify the signature before applying. Always.

## Data subject requests

People you have recorded have rights, and many of them will never have an account.

| Request | How |
|---|---|
| What is recorded about me | Subject access report, in plain language |
| Show me the consent I gave | Including the original audio, if it was verbal |
| Correct something | Creates a new assertion, retracts the old — the history is preserved |
| Withdraw | Immediate. **No explanation required, no penalty** |
| Erase | Verified across every store |
| Who accessed my data | Access log for their own data |

**Withdrawal must be at least as easy as consenting.** If your process makes it harder, that is a
process problem on your side, and it undermines the lawful basis of everything downstream.
