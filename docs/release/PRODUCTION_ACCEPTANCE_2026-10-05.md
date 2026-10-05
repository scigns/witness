# Production acceptance — 2026-10-05

**Status:** BLOCKED — not client ready **Owner:** Engineering and release manager

This is an acceptance record, not deployment approval. Continue PR #266 on
`feat/commercial-runtime-readiness`, stacked on PR #264 (`feat/commercial-entitlements`). No
dependency was merged or flattened. Existing verification is retained in
[the runtime checkpoint](../handoffs/evidence/CODEX_RUNTIME_VERIFICATION_2026-10-05.txt).

## Release gates

PASS applies only to the scope explicitly described. Missing production proof is FAIL, not an
accepted risk. No deferred risk has been accepted by the release manager.

| Gate              | Status | Evidence / remaining condition                                                                                                                             |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUILD             | PASS   | Node 22 API and web production builds pass locally; deployed artifact remains older.                                                                       |
| TEST              | FAIL   | API regression and targeted live tests pass; see checkpoint. Required CI must pass at final candidate SHA.                                                 |
| SECURITY          | FAIL   | Full-history gitleaks: 465 commits, no leaks. Full production attack journey outstanding.                                                                  |
| DATABASE          | FAIL   | Isolated PostgreSQL checks pass; current production data/integrity inspection blocked.                                                                     |
| MIGRATION         | FAIL   | Additive reservation migration applied locally (44 total); fresh bootstrap/restart pass; production-compatible data rehearsal outstanding.                 |
| BACKUP            | FAIL   | Local protected dump verified. Current production database, identity and object protection evidence required.                                              |
| RESTORE           | FAIL   | Local dump restored into separate database: 44 migration records, 74 tables. Production backup restore and object recovery unproven.                       |
| AUTH              | FAIL   | Existing authentication unit evidence retained; real-session expiry/recovery/deep-link acceptance outstanding.                                             |
| RBAC              | FAIL   | Existing API boundary tests pass; complete browser/direct-API client acceptance outstanding.                                                               |
| TENANT ISOLATION  | FAIL   | Existing adversarial evidence retained; controlled production cross-organisation acceptance outstanding.                                                   |
| STORAGE           | FAIL   | Bounded object/inline reconciliation implemented; configured production transport and recovery unverified.                                                 |
| QUOTA             | FAIL   | Live contention, idempotency, commit/rollback and conservative expiry pass. Provider/crash end-to-end acceptance outstanding.                              |
| COMMERCIAL        | FAIL   | Catalogue-priced operator origination implemented; quoted/negotiated pricing and browser acceptance outstanding.                                           |
| PAYMENTS          | FAIL   | Existing transactional manual settlement retained; Live operator-issued invoice/settlement journey passes; production transport/browser proof outstanding. |
| PROVISIONING      | FAIL   | Desired isolation exists; Provider-neutral observed boundary implemented; actual infrastructure fulfilment unverified.                                     |
| OBSERVABILITY     | FAIL   | Public readiness reports build identity. Reservation/reconciliation failure signals added; host logs and alert delivery unverified.                        |
| EMAIL             | FAIL   | Production transport and controlled invite/recovery delivery not verified in this acceptance.                                                              |
| FRONTEND          | FAIL   | Build/lint pass; work-oriented shell and full viewport/browser states outstanding.                                                                         |
| ACCESSIBILITY     | FAIL   | Keyboard/axe/browser acceptance of final shell outstanding.                                                                                                |
| PUBLIC WEBSITE    | FAIL   | Claims, links and browser acceptance outstanding.                                                                                                          |
| CLIENT ACCEPTANCE | FAIL   | Mandatory complete synthetic paying-client journey has not completed.                                                                                      |
| ROLLBACK          | FAIL   | Existing script inspected; current production rollback images/backups not verified.                                                                        |

## Engineering changes and verified scope

Uploads reserve capacity in PostgreSQL before touching the storage provider. A per-organisation
transaction advisory lock serialises the decision. Capacity includes committed file bytes plus
RESERVED, WRITING and NEEDS_RECONCILIATION reservations. A committed file and its reservation state
change share one transaction. An `Idempotency-Key` UUID identifies a request; changed payloads
conflict, completed requests replay, and in-flight requests cannot start a second provider write.

Never-started expired leases can be released under the same lock. Expired or uncertain writers
remain charged and are fenced from committing. A timeout alone cannot establish that a remote write
stopped. Known domain rejection compensates completed objects; uncertain provider/commit outcomes
preserve bytes.

Platform operators can inspect accounting and object inventories on the commercial configuration
page. Reports detect orphan objects, missing objects, size mismatches, invalid organisation keys and
stuck leases. Inspection is observational and bounded, never deletes evidence, and records a report
hash in the audit chain. Cleanup releases only expired never-started leases. Customer usage shows
reserved capacity separately. Database overhead, backups, logs, caches and temporary bytes are
operational metrics, not included customer file quota.

## Deployment identity and access blocker

External `https://api.buildwithwitness.com/ready` returned healthy PostgreSQL and Keycloak with
build `0a273631087550f898a85c1e917a772fb8a22d20`, version `0.4.0`. This is the observed production
version, not this branch. No production change was made.

**HUMAN ACTION REQUIRED:** Load the approved production SSH key or restore the approved access path.

- Why: `witness-prod-claude` rejected authentication with `Permission denied (publickey)`.
- Command: `ssh -o BatchMode=yes witness-prod-claude true`.
- Expected: exit 0, allowing read-only host/config/backup inspection first.

Follow existing `scripts/pilot/deploy.sh` and `.github/workflows/deploy.yml` only after all gates
pass. Release governance requires a clean main release, dependency reviews and explicit
release-manager go/no-go; see [release strategy](../engineering/RELEASE_STRATEGY.md).

## Backup rehearsal evidence

The local acceptance schema `codex_runtime_20261005` was dumped using PostgreSQL custom format and
restored with `pg_restore --no-owner --exit-on-error` into `codex_restore_20261005`. Migration/table
counts were checked after restore. Private artifacts remain outside Git under
`/private/tmp/witness-acceptance-20261005` (directory 700, dump 600).

Dump SHA-256: `1a36c82d8d2f731d5814f20a32139ff75b75be90f9a266b3dc4913fbb28b07cc`. This is a
schema/test-data rehearsal, not a production recovery guarantee. Production RPO and RTO are not
established by this test; no contractual SLA is asserted.

R2 S3 bucket versioning and S3 Object Lock are not supported according to
[Cloudflare's compatibility documentation](https://developers.cloudflare.com/r2/api/s3/api/). Do not
count either as a backup. Require an independently recoverable object copy or verified existing
protection strategy, with retention/access controls and a tested restore, before release.

## Next required acceptance work

Close provider failure/crash and reconciliation integration coverage; finish observed provisioning
and operator origination; verify supported subscription lifecycle; complete authenticated shell QA
and public claims audit; automate the full synthetic operator/admin/member journey. Then inspect the
host, restore protected production backups in non-production, verify email and alerts, obtain
release approval, record immutable artifact identity and rollback commands, deploy and repeat the
synthetic production smoke.

## Additional acceptance evidence

An empty local database `codex_fresh_20261005` accepted all 44 migrations and initial platform
bootstrap. Bootstrap now resolves allocation from ResourceProfile rather than a fixed legacy quota.
The application started twice against that database, returned healthy status and retained its
organisation. This proves local fresh install/restart, not production identity-provider integration.

The synthetic PostgreSQL client journey creates two organisations, applies authorised resource
configuration, issues a catalogue-priced invoice, rejects amount tampering, settles/replays one
payment and receipt, activates entitlements, creates a workspace, uploads content and enforces its
quota. Organisation administrators fail platform settlement/override/operator permissions and
cross-organisation resource access. Synthetic financial history is retained in the disposable
acceptance database. The browser, invite, OIDC and production transport portions remain FAIL.

Operator origination uses the existing commercial request, invoice and settlement services. The
[first-client runbook](../operations/FIRST_CLIENT_ONBOARDING.md) documents the supported path and
explicitly blocks quoted prices and unverified infrastructure promises. Observed provisioning
requires matching isolation, profile and complete configuration fingerprint plus provider evidence
before READY. Existing tenant metadata alone cannot satisfy this check.

Storage hardening rejects foreign session/agenda associations before reserving bytes. Every object
reader, including background transcription, verifies the exact organisation/kind/record key; deletion
checks the same ownership. Upload filenames reject traversal/control characters and download headers
encode Unicode safely. Public capture authorisation now precedes multipart buffering. Configured
attachment limits and bounded field/part counts apply at the parser.

CI run 37263717351 at `3e2f008` failed documentation headers, a whitespace-sensitive brand assertion,
and live participant cleanup missing the reservation FK. These have been corrected and targeted
checks pass; final candidate CI remains required. GitHub environment `pilot` currently reports no
protection rules. An explicit release-manager go/no-go is required by repository governance; do not
merge into the automatic deployment path before enforcing that approval and verifying rollback.
