# Production release reconciliation — 6 October 2026

**Owner:** Engineering and release manager

**Status:** NOT CLIENT READY — release held; no candidate approved, merged or deployed

## Independently verified state

SSH works through `witness-prod-claude`. Read-only evidence collected around 2026-10-05
23:56 UTC establishes that running containers, main and candidate are distinct.

| State                    | Identity / measurement                                                    | Evidence                                                                            |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Deployed API SHA/version | `0a273631087550f898a85c1e917a772fb8a22d20` / `0.4.0`                      | Public `/ready` and container environment agree                                     |
| Deployed API image       | `sha256:994f78c2266c52cd57d11fca42f8ff28643583605026e2ba29f2b6628989426b` | Container `.Image`; not mutable tag or cached Compose label                         |
| Deployed web image       | `sha256:a7bd28eb30fb553b27266b92c25efd42f9f85cdf857cdddde86493b380f10d3c` | Container `.Image`; exported archive passes gzip integrity                          |
| Deployed web Git SHA     | FAIL: not recoverable from inspected metadata                             | No OCI revision/runtime SHA; Next BUILD_ID `6ii1rcZHTEcfNlzhoRfk8` is not a Git SHA |
| Current main             | `d2771a29ff90677868993039d0511b8fe9ee028e`                                | Remote main and runner checkout agree                                               |
| Inspected candidate      | `ced2461e8fa44b612812095a167e845f18f6db33`                                | PR #266; CI/security PASS; subsequent rollback guard changes require CI             |
| PR #264 parent           | `c1e5cd2517b9733b117938e5078032d28802a2be`                                | Base main; narrow CI repair pushed to existing branch; revalidation pending         |
| PR #262 parallel feature | `b0688423b79bb410ab1e2823f907ff4c24daff2d`                                | Base main; not an ancestor of #266; excluded from this release scope                |
| Authoritative checkout   | `/home/witness/actions-runner/_work/witness/witness` at `d2771a2`         | API/web/Postgres/Keycloak Compose labels and Git inspection                         |
| Environment file         | `/home/witness/witness/.env`                                              | Compose label; secrets not printed/copied to Git                                    |
| Stale checkout           | `/home/witness/witness`                                                   | Not deployment authority; no pull/edit/build performed there                        |
| Compose project          | `witness-pilot`                                                           | Container labels                                                                    |
| Health/restarts          | API/web/Postgres/Keycloak healthy; each has zero restarts                 | Docker inspection                                                                   |
| Production DB            | 33 complete migrations; 12,352,535 bytes                                  | `_prisma_migrations` and `pg_database_size`                                         |
| Object storage           | 13 attachments, 6,770,941 declared bytes; 13/13 HEAD sizes match          | Aggregate SQL and bounded read-only provider check; no contents printed             |
| Public endpoints         | API `/health`, `/ready`, www, app `/workspaces`: HTTP 200                 | TLS verified; not authenticated acceptance                                          |

The running API's `loadConfig` validator passes. DB/object-store/SMTP credentials are configured
(presence checks only). SMTP delivery is not established. Neo4j is not configured. Current runner
Compose validation fails on required optional graph credentials. Candidate Compose profiles graph
services under `knowledge-graph`, allows inactive empty credentials, and validates against the
production environment read-only through stdin. No production source/config was edited.

## Protection and merge/deployment order

Legacy `Deploy pilot` workflow `333947257` is now **disabled_manually**: a reversible release hold
before any main merge. Main requires strict `CI gate`, `Secret scanning`, `Workflow hardening` and
`Zero-egress verification`, including administrators; force pushes/deletion are disabled. CI was
not weakened. Emergency operator recovery remains available using recorded images; do not re-enable
legacy arbitrary-main deployment to retry. The `pilot` environment has no reviewer protection and
no exact-SHA approval variable was found.

**MERGE ORDER — no merge authorised by this record:**

1. Repair/revalidate #264 (`feat/commercial-entitlements`, based on main `d2771a2`), then merge after
   required gates. Historic failures: whitespace-sensitive brand assertion and missing generated
   Prisma client after cached build restoration. Child fixes the assertion; candidate CI explicitly
   generates Prisma independently of Turbo cache. Do not bypass parent failures.
2. Reconcile/retarget #266 (`feat/commercial-runtime-readiness`, forked from #264 `215f350`;
   parent now `c1e5cd2`). Preserve
   parent history and validate the combined tree. Shell work is already in #266 (`2079a9d`, `74892bf`);
   no new shell branch is needed. #262 Help search is a parallel feature excluded from scope; shell
   Help links to support. Do not claim in-app search is included.
3. Review exact combined main SHA and release-manager go/no-go; record approved SHA/images/migrations.
   Re-enable only the hardened workflow after all critical gates pass.

**DEPLOYMENT ORDER:** approved main SHA → build API/web with that SHA → record immutable IDs →
capture running SHA/images/redacted Compose/ledger → immediate Witness/Keycloak backups → verify
both → installed Prisma `migrate deploy` from candidate API image → recreate API/web with
`--no-deps --no-build` → verify API SHA/web `/api/build-identity` → production-safe client acceptance.
No intermediate dependency deployments or graph worker startup. Postgres/Keycloak are not recreated.

## Production backup restore rehearsal

| Backup   | UTC timestamp       | Size          | SHA-256                                                            |
| -------- | ------------------- | ------------- | ------------------------------------------------------------------ |
| Witness  | 2026-10-05 03:00:01 | 259,824 bytes | `7f60fcf298c867541631989c63d70722a144c5ce66a69beb3bd5108c8c773403` |
| Keycloak | 2026-10-05 03:00:01 | 210,757 bytes | `4a8eb0e7cecbf196959286286756cd1acf48065082dc7d6786aa7bb2b9dca7a0` |

Both exist, are mode 600, were about 21 hours old, pass server/local checksum checks and
`pg_restore --list`. Protected local copies remain under `/private/tmp/witness-release-20261006`
(directory 700); never commit or attach them. Both restored using `pg_restore --no-owner --no-acl
--exit-on-error` into separate databases in local `witness-release-db-20261006` on an internal Docker
network. PostgreSQL starts and accepts queries. Witness has all 33 migration rows and critical
organisation/subscription/evidence_attachment/audit_event/auth_session tables. Keycloak has
realm/user_entity/client tables. No production database was restored, overwritten or migrated.

This proves these production DB backups restore, not an RPO/RTO guarantee, live Keycloak login or
object recovery. DB dumps do not contain the 13 object attachments. Independent object backup/restore
remains **FAIL**; successful HEAD checks are availability proof only. Immediate pre-deploy backups
have not been taken because deployment remains blocked.

## Ledger-derived migration audit

All 33 production checksums match candidate files; no failed/rolled-back ledger rows were observed.
The following 12 are **unapplied in production**, established by the ledger. All applied successfully
to the isolated restored DB using installed Prisma 5.22 `migrate deploy`, resulting in 45 completed
migrations. Existing four organisations retain their quota values. Measured individual execution
was 1–82 ms locally; production concurrent lock times are unproven. All DDL needs a controlled
migration window/monitoring; no fixed downtime promise or automatic SQL reversal is implied.

| Migration                                                 | Schema change                                                          | Applied | Destructive                          | Reversible                                  | Backward compatibility                                                        | Candidate compatibility                | Downtime                 | Rollback implication                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ------- | ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `20260919090741_evidence_knowledge_graph`                 | Graph/provenance/outbox tables, FKs and seeds                          | NO      | No existing data deletion            | Conditional; drop loses new history         | Old code ignores tables; added constraints need review                        | Restore and integration PASS           | DDL locks; 82 ms locally | Keep new tables/history or restore exact old DB                       |
| `20260921003323_widen_candidate_status`                   | VARCHAR(16) → VARCHAR(32)                                              | NO      | No                                   | Only if all values fit 16                   | Older code may not understand new statuses                                    | Restore PASS                           | DDL lock; 2 ms           | Never narrow after longer values exist                                |
| `20260922105103_workspace_invitation_and_affiliation`     | Invitations/affiliation/authority links and FKs                        | NO      | No existing data deletion            | Conditional; preserve authority/history     | Old code lacks new invitation authority behaviour                             | Restore/live authority PASS            | DDL locks; 13 ms         | Keep schema; old image not feature-equivalent                         |
| `20260922122842_workspace_lifecycle_status`               | Status/version/updated_at with defaults                                | NO      | No                                   | Conditional; drop loses lifecycle history   | Old writes lack optimistic versioning                                         | Restore PASS                           | DDL locks; 2 ms          | Successful SQL is not behavioural compatibility                       |
| `20260923073459_session_join_link`                        | Join tables; drops FK/default, renames constraints                     | NO      | Removes constraint/default, not rows | Conditional on integrity validation         | Old write/default/FK semantics change; full old-write test incomplete         | Restore/join/capture PASS              | DDL locks; 10 ms         | Reinstatement may fail after new writes; restore may be needed        |
| `20260923080428_participant_capture_token`                | Capture token table/constraints                                        | NO      | No existing data deletion            | Conditional; issued tokens lost if dropped  | Old image lacks token workflow                                                | Restore/capture PASS                   | DDL locks; 5 ms          | Keep additive schema; old features differ                             |
| `20260924044439_receipt`                                  | Receipt uniqueness, counter/function                                   | NO      | No existing data deletion            | Conditional; financial history must remain  | Old image does not issue receipts                                             | Restore/commercial journey PASS        | DDL locks; 9 ms          | Never erase receipts to permit downgrade                              |
| `20260925005140_agreement`                                | Agreement table/commercial-history FKs                                 | NO      | No existing data deletion            | Conditional; preserve agreement history     | Old image ignores agreements                                                  | Restore PASS                           | DDL locks; 10 ms         | Keep history; old behaviour lacks agreements                          |
| `20261004072548_commercial_entitlements_resource_profile` | Tenant seam, profile catalogue, five entitlement keys                  | NO      | No existing row deletion             | Conditional on subsequent references        | Old image ignores seam/profile enforcement                                    | Restore/seeds/commercial PASS          | DDL/seeds; 8 ms          | Preserve referenced catalogue/tenant/overrides                        |
| `20261004115917_resource_profile_quota_and_tenant_status` | Quota nullable; provisioning status                                    | NO      | No existing quota deletion           | NOT after nulls without semantic conversion | **FAIL: deployed required-BigInt client rejects null quota with P2032**       | Restore PASS; existing quotas retained | DDL lock; 1 ms           | Image-only rollback unsafe after new organisations/live-default reset |
| `20261005010000_durable_storage_reservations`             | Durable states, byte/state/kind checks, uniqueness, delete restriction | NO      | No existing data deletion            | Not safely with active/uncertain writes     | Old image bypasses reservation protocol; allocation/deletion semantics unsafe | Restore/concurrency/recovery PASS      | DDL locks; 7 ms          | Preserve/fence uncertain writes; old image not accounting-safe        |
| `20261005020000_login_return_path`                        | Nullable one-time return path                                          | NO      | No                                   | Conditional; outstanding targets lost       | Extra column tolerated; old deep-link behaviour absent                        | Restore/auth safety PASS               | DDL lock; 1 ms           | Leave column; old callback uses old landing                           |

## Rollback and release identity

`RELEASE_SHA`: NOT APPROVED. Candidate `API_IMAGE_ID`/`WEB_IMAGE_ID`: not built/approved.
`DB_MIGRATION_SET`: the 12 ledger-derived migrations above. `ROLLBACK_SHA`: `0a273631…`.
`ROLLBACK_IMAGE_IDS`: exact running API/web IDs above; mutable latest/cached labels are not evidence.

The web image archive is readable. Combined API/web export was interrupted and is not recovery
evidence. The exact running API Prisma schema was copied read-only; a client generated from that
schema in the isolated network rejects a synthetic null-quota organisation with **P2032** after
the restored DB upgrade. This is a deployed-schema compatibility check, not a successful exact-image
rollback drill. The probe exists only locally.

The deployment entrypoint now additionally requires candidate-specific approval of the exact
running API/web rollback image IDs. Missing or stale approval refuses build/migration/deployment.
This enforces the release hold; it does not turn a failed compatibility test into a PASS.

**ROLLBACK FAIL:** automatic image rollback cannot protect null quotas or reservation semantics
after candidate writes. Require a compatible rollback artifact/write rehearsal, or an explicitly
approved DB/object recovery plan with bounded downtime and post-checkpoint data handling. No
destructive production recovery is authorised here. Readiness can be healthy while old Prisma reads
fail, so it is not full rollback acceptance.

## Release gate matrix — continuation

The following supersedes historical local rehearsal results above. PASS is scoped to
its evidence; missing required proof is FAIL. No deferred critical risk is accepted.
Production columns describe the candidate, not the still-running legacy system.

| Gate                              | IMPLEMENTED                                  | TESTED                             | REHEARSED                                                                    | DEPLOYED                                   | PRODUCTION VERIFIED     |
| --------------------------------- | -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| CI / release images               | PASS                                         | PASS: 313d185 CI 37417081754       | PASS: immutable images started                                               | FAIL                                       | FAIL                    |
| Security / tenant isolation       | PASS                                         | PASS: security 37417081725         | PASS: real HTTP cross-org and authority denials                              | FAIL                                       | FAIL                    |
| Auth                              | PASS                                         | PASS                               | PASS: restored Keycloak, real OIDC, replay denial, browser deep links        | FAIL                                       | FAIL                    |
| Commercial activation             | PASS                                         | PASS                               | PASS: operator origination, invoice, settlement/replay, ACTIVE, entitlements | FAIL                                       | FAIL                    |
| Tenant / ResourceProfile          | PASS: logical shared tenant                  | PASS                               | PASS: implicit organisation boundary / standard-small                        | FAIL                                       | FAIL                    |
| Dedicated provisioning fulfilment | FAIL: recorded adapter only                  | FAIL                               | FAIL: not proved READY                                                       | FAIL                                       | FAIL                    |
| Storage / quota / reservations    | PASS                                         | PASS                               | PASS: real objects, race, fencing, stale recovery and mismatch handling      | FAIL                                       | FAIL                    |
| Audit trail                       | PASS                                         | PASS                               | PASS: persisted commercial events and hash-chain links                       | FAIL                                       | FAIL                    |
| Frontend                          | PASS                                         | PASS                               | PASS: real browser roles, resource, 375/768/1440, accessibility              | FAIL                                       | FAIL                    |
| Latest DB / Keycloak backups      | PASS                                         | PASS: checksums and readable dumps | PASS: isolated restore and critical records                                  | PASS: existing backup mechanism            | PASS: backup read only  |
| Independent object recovery       | PASS: bounded protected copy                 | PASS: 13 object checksums          | PASS: isolated S3 restore and byte verification                              | FAIL: continuing retention not established | FAIL                    |
| Migration path                    | PASS                                         | PASS: ledger and image inventory   | PASS: restored 33 → 45, exact candidate Prisma                               | FAIL                                       | FAIL                    |
| Legacy rollback                   | PASS: DATABASE RESTORE REQUIRED              | PASS: P2032 incompatibility proved | PASS: restore, exact old images, real login/workspace/upload/read            | FAIL                                       | FAIL                    |
| Compatible recovery artifact      | PASS: candidate-specific controls            | PASS: targeted fail-closed tests   | FAIL: new candidate-to-recovery drill pending                                | FAIL                                       | FAIL                    |
| Deployment control                | PASS: digest/provenance/config/backup guards | PASS: targeted script tests        | FAIL: new control candidate not yet validated                                | FAIL: workflow disabled                    | PASS: release hold only |
| Email delivery                    | PASS: transport exists                       | FAIL: delivery not proved          | FAIL: controlled mailbox/provider evidence required                          | FAIL                                       | FAIL                    |
| Client acceptance                 | PASS: synthetic harness                      | PASS: HTTP and browser             | PASS: shared commercial client journey; email/dedicated scope unresolved     | FAIL                                       | FAIL                    |
| Release decision                  | FAIL: NOT READY FOR PRODUCTION               | FAIL                               | FAIL                                                                         | FAIL                                       | FAIL                    |

## Isolated host continuation evidence

Candidate `313d185174062ba4084cdb6973f943b473f57c53` fixed the real operator
origination failure found during HTTP acceptance. CI including release-image validation
`37417081754` and security `37417081725` passed. Publication `37417994256` passed;
creation time `2026-10-06T05:13:35.507731Z`:

- API: `ghcr.io/scigns/witness-api@sha256:a79035d2fd0173fe268b1458d60fc555410b809566ef749ac2badf52fc6a86c3`
- Web: `ghcr.io/scigns/witness-web@sha256:6f7da70b05aeb872a43b9534021d1e7e14e56beae06dd27e9b2de8bd4f023da3`

Any subsequent control commit is a new candidate and requires its own hosted CI,
publication and exact-artifact rehearsal. These artifacts are a possible compatible
recovery pair, not approval to restart the incompatible deployed legacy API.

The existing Phase 3C recovery pattern was used on the host with internal network
`witness-release-cdfe7fb-private`, separately named containers and fresh database/object
volumes. No published host ports, production routes, shared DB/Keycloak volumes or
production Compose mutations were used. Services are resource-capped. Browser transport
uses loopback SSH and private `.invalid` origins; the compiled API hostname is relayed
only to the private API. No application responses are mocked. This proves the UI against
real services, not production DNS/cookie-origin configuration. An empty isolated Ollama
service proves readiness connectivity, not model inference.

Latest daily backups, `2026-10-06T03:00:01Z`, independently verified:

| Backup   | Bytes  | SHA-256                                                            | Restore time |
| -------- | ------ | ------------------------------------------------------------------ | ------------ |
| Witness  | 259825 | `648012aa83331f6d8674fc9d338770dd10576fcbc29cbfe9e189267ea033eb44` | 2.506 s      |
| Keycloak | 210757 | `d3b3c4584568165a0fe314df6d263f0072f98f3a9221c6ba57d32a413892a09c` | 2.328 s      |

`pg_restore --no-owner --no-acl --exit-on-error` restored Witness's 50 tables,
4 organisations, 4 subscriptions, 13 attachments, 195 audit events, 37 auth sessions
and 33 complete migrations. Keycloak restored 87 tables, 2 realms, 12 users,
14 clients and 12 credentials. A synthetic realm was added only to the restored database.
A protected independent object copy contains 13 objects / 6,770,941 bytes; SHA-256
`17a8377ee4dd56d7a4c6331829fa08e908fcd95d224af522db265838c0b67d59`.
All bytes were restored and re-read with matching checksums in isolated S3 storage.
Backups, credentials and customer bytes stay outside Git under protected recovery paths.

The same 12 ledger-derived migrations listed above applied in order with installed
Prisma 5.22, 4.688 s total on the latest candidate. Individual pending migrations took
4.819–295.821 ms; no failed ledger rows. Before/after schema and complete checksummed
ledger are retained in protected evidence. Production remains at 33 migrations.

**Rollback classification: DATABASE RESTORE REQUIRED for the exact running legacy
images.** Nullable quotas reproduce legacy Prisma P2032 after candidate writes. The
executable drill stopped isolated candidate API/web/Keycloak, preserved the synthetic
post-candidate dump, recreated only isolated databases, restored verified pre-migration
Witness and Keycloak dumps, restarted isolated Keycloak and started the exact recorded
legacy API/web image IDs. Recovery took 83.302 s including identity startup; restored
ledger count 33, health/readiness PASS. Real OIDC, synthetic workspace creation and
object upload/download PASS. This restore discards post-backup DB writes and is not
approved as an automatic image-only rollback.

Protected command/timing records: host
`/home/witness/witness-backups/release-cdfe7fb-20261006/{restore,rollback,http-acceptance,storage-acceptance}-evidence.json`
and `latest-migration-evidence.json`; off-host evidence is retained under
`/private/tmp/witness-release-continuation-20261006`. No secrets or raw customer data
are attached to this record. Immediate pre-deploy backups remain mandatory.

No merge, live migration, production deployment, OS upgrade or reboot occurred.
`apps/participant-mobile/` remains untouched. The disabled deployment workflow remains
the release hold while compatible recovery, final combined candidate and remaining
critical acceptance requirements are resolved.

Local hybrid-profile browser acceptance passed 12 viewport/role cases at 375, 768 and 1440 px,
including deep-link query/hash preservation, empty Programs landing, create-program/operator
visibility, no primary Pricing link, no horizontal overflow and axe WCAG checks. Reproduce with
`apps/web/test/runtime-readiness.mjs` against a locally built hybrid-profile web using
`NEXT_PUBLIC_WITNESS_API_URL=https://api.rehearsal.invalid`. This uses mocked API responses and
proves neither real OIDC nor production authorisation. Production acceptance remains FAIL.
