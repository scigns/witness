# Production release reconciliation — 6 October 2026

**Owner:** Engineering and release manager

**Status:** NOT CLIENT READY — stack merged; deployment held for external email and supplier configuration

The current decision below supersedes the historical checkpoint sections. Production application
images and migration ledger remain unchanged; a controlled Keycloak recovery-test identity was
created, so this does not claim all production data is untouched.

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

| Gate                              | IMPLEMENTED                                  | TESTED                                                  | REHEARSED                                                                    | DEPLOYED                                   | PRODUCTION VERIFIED     |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| CI / release images               | PASS                                         | PASS: 3ffd01c CI 37420418558                            | PASS: immutable images started                                               | FAIL                                       | FAIL                    |
| Security / tenant isolation       | PASS                                         | PASS: security 37420418615                              | PASS: real HTTP cross-org and authority denials                              | FAIL                                       | FAIL                    |
| Auth                              | PASS                                         | PASS                                                    | PASS: restored Keycloak, real OIDC, replay denial, browser deep links        | FAIL                                       | FAIL                    |
| Commercial activation             | PASS                                         | PASS                                                    | PASS: operator origination, invoice, settlement/replay, ACTIVE, entitlements | FAIL                                       | FAIL                    |
| Tenant / ResourceProfile          | PASS: logical shared tenant                  | PASS                                                    | PASS: implicit organisation boundary / standard-small                        | FAIL                                       | FAIL                    |
| Dedicated provisioning fulfilment | FAIL: recorded adapter only                  | FAIL                                                    | FAIL: not proved READY                                                       | FAIL                                       | FAIL                    |
| Storage / quota / reservations    | PASS                                         | PASS                                                    | PASS: real objects, race, fencing, stale recovery and mismatch handling      | FAIL                                       | FAIL                    |
| Audit trail                       | PASS                                         | PASS                                                    | PASS: persisted commercial events and hash-chain links                       | FAIL                                       | FAIL                    |
| Frontend                          | PASS                                         | PASS                                                    | PASS: real browser roles, resource, 375/768/1440, accessibility              | FAIL                                       | FAIL                    |
| Latest DB / Keycloak backups      | PASS                                         | PASS: checksums and readable dumps                      | PASS: isolated restore and critical records                                  | PASS: existing backup mechanism            | PASS: backup read only  |
| Independent object recovery       | PASS: bounded protected copy                 | PASS: 13 object checksums                               | PASS: isolated S3 restore and byte verification                              | FAIL: continuing retention not established | FAIL                    |
| Migration path                    | PASS                                         | PASS: ledger and image inventory                        | PASS: restored 33 → 45, exact candidate Prisma                               | FAIL                                       | FAIL                    |
| Legacy rollback                   | PASS: DATABASE RESTORE REQUIRED              | PASS: P2032 incompatibility proved                      | PASS: restore, exact old images, real login/workspace/upload/read            | FAIL                                       | FAIL                    |
| Compatible recovery artifact      | PASS: candidate-specific controls            | PASS: targeted fail-closed tests                        | PASS: 3ffd01c → 313d185; retained writes, 11.168 s                           | FAIL                                       | FAIL                    |
| Deployment control                | PASS: digest/provenance/config/backup guards | PASS: targeted script tests                             | PASS: exact candidate, restore, health and compatible recovery               | FAIL: workflow disabled                    | PASS: release hold only |
| Email delivery                    | PASS: transport exists                       | PASS: production SMTP TLS/auth; private real invitation | PASS: real invitation in TLS synthetic inbox; external delivery unproved     | FAIL                                       | FAIL                    |
| Client acceptance                 | PASS: synthetic harness                      | PASS: HTTP and browser                                  | PASS: 24 HTTP + 7 storage + 9 browser checks; fulfilment unresolved          | FAIL                                       | FAIL                    |
| Release decision                  | FAIL: NOT READY FOR PRODUCTION               | FAIL                                                    | FAIL                                                                         | FAIL                                       | FAIL                    |

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
Prisma 5.22, 4.686 s total on the latest candidate. Individual pending migrations took
4.819–295.821 ms on the earlier 313d185 drill; no failed ledger rows.
Before/after schema and complete checksummed
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

## Latest candidate decision — exact artifact source retained

RELEASE CANDIDATE SHA: `3ffd01c4d9b94e305111562f474d80a57d43aa0c`

API IMAGE DIGEST: `sha256:753be8495b1dbd92b9d4679c940583c63d6a72339fecd41c02deced62f8f4767`

WEB IMAGE DIGEST: `sha256:517055d5c8f4d4d41e1c09f6f7fdfec47ba1f1348e040e39b45252ffc27350ef`

MIGRATION SET: the 12 named migrations above, in ledger order; isolated 33 → 45,
4.686 s, complete checksums match the immutable candidate manifest. Unapplied live.

BACKUP VERIFIED: PASS — 6 October Witness/Keycloak dumps and independent object copy.

RESTORE REHEARSED: PASS — isolated DB/identity/object restore; no shared live volumes.

ROLLBACK REHEARSED: PASS — exact legacy images with DATABASE RESTORE REQUIRED;
compatible validated recovery pair 313d185 without DB restore, 11.168 s.

SECURITY: PASS — exact candidate hosted Security 37420418615 and adversarial CI.

TENANT ISOLATION: PASS — cross-org and authority denials against real services.

AUTH: PASS — real OIDC, one-time callback, preserved deep links and restored identity.

QUOTA/RESERVATION: PASS — real uploads, contention, expiry fencing, conservative mismatch accounting.

COMMERCIAL ACTIVATION: PASS — real HTTP and browser invoice/manual settlement → ACTIVE,
entitlements, Tenant and ResourceProfile. This is not verified infrastructure fulfilment.

FRONTEND ACCEPTANCE: PASS — 9 real browser checks, viewport/axe, invoice/settlement,
resource visibility, customer denial and deep links. Private transport adaptation is recorded.

RELEASE IMAGE VALIDATION: PASS — exact SHA, CI 37420418558, image job 112129227628.
Artifact creation `2026-10-06T05:54:57.497881Z`; immutable publication run 37429404905,
publication time `2026-10-06T07:25:43.474496Z`. API/web identities, health/readiness,
zero restarts and no critical startup errors independently verified in rehearsal.

DEPLOYMENT CONTROL: PASS for implemented/tested/rehearsed guards and disabled release hold;
FAIL for deployable final-main approval. No approval variables were populated, workflow enabled,
PR merged or production mutation performed.

CLIENT ACCEPTANCE: FAIL overall. The synthetic shared commercial/client path passes,
but verified resource/isolation fulfilment and external production email delivery remain absent.

**NOT READY FOR PRODUCTION**

Exact blockers:

1. `RecordedProvisioningAdapter` is the only bound provider. It reports logical metadata,
   NOT_PROVISIONED/DEGRADED/PENDING/FAILED, and cannot produce verified READY evidence for
   the desired configuration fingerprint. A resolved Tenant and ResourceProfile do not prove
   allocated compute, workers, concurrency, backup/retention or dedicated isolation promises.
   No critical fulfilment risk has been accepted and no fake READY state was written.
2. Production SMTP connection, TLS and authentication pass. The candidate's explicit invitation
   endpoint sent one 1,108-byte message into the protected private TLS inbox. Actual external
   delivery and identity recovery delivery require a controlled recipient/provider verification;
   no supplied mailbox, delivery evidence or deferred-risk approval exists. No external mail sent.
3. #266 remains draft and stacked on #264. Parent checks pass at c1e5cd2, but that commit is not
   an ancestor of the artifact source. Parent merge, child reconciliation/retargeting and exact
   combined-main CI/images/rehearsal are still required after critical readiness is established.
   Current workflow is disabled and no exact final-main/recovery tuple is approved.

Compatible rollback commands and timings are recorded in protected
`compatible-rollback-evidence.json`: stop only isolated API/web → recreate from recovery
registry digests with preserved synthetic environment → exact API/web SHA and readiness →
compare eight ledger/data counts unchanged → real OIDC → retained object/quota/reservation read
→ nullable quota read → new workspace/upload/download. Counts across the swap were
`45|6|3|2|2|2|4|246` (migrations, organisations, workspaces, resources, payments, receipts,
reservations, audit events). No drop/create/restore occurred in this compatible drill.
Legacy recovery commands remain in `rollback-evidence.json`; its 83.302 s database-restore
classification is unchanged. Candidate-specific recovery approval must refer to the exact final
release SHA; these proofs do not authorise an arbitrary later source or mutable tags.

The final evidence/runbook edits are retained in the working tree so that this documentation
record does not silently create a new application candidate SHA. Source HEAD remains 3ffd01c.
Protected sanitized evidence: `runtime-verification-evidence.json`, `email-rehearsal-evidence.json`,
`production-unchanged-evidence.json`, `http-acceptance-evidence.json`,
`storage-acceptance-evidence.json`, `latest-migration-evidence.json`,
`compatible-rollback-evidence.json`, `compatible-rollback-usability.json` on the host and off-host.
Browser results are in off-host `browser-evidence.json`. Dumps, object bytes, sessions, messages
and credentials remain private, outside Git. Production images/health remain unchanged and
production ledger remains 33. No production acceptance is represented as completed.

## Release continuation — 2026-10-07

PR #264 landed on main as `0bfdc32bbc627a3d7003fd515968d612811ba739`.
The existing #266 branch merged that parent as `e1dc549c55066d99b5c69a22983c6aa77e01ba62`
and is now based on main. The squash merge repeated existing commercial implementation;
conflicts retained the newer runtime implementation. The only parent changes after the shared
checkpoint were independent Prisma generation and brand-test whitespace matching, both retained.
The reconciliation commit introduced no additional source or migration changes.

CI `37564801977` and Security `37564801940` passed at `545b053` including image validation.
These are historical checkpoint results, not approval of the final combined main SHA.
CI `37574556217` validates the reconciled checkpoint; final-main artifacts remain pending.
CodeRabbit is advisory and manually requested, absent from required merge checks. Superseded PR
Security/CodeQL runs cancel; production required checks and exact-artifact approval remain intact.
No local Docker validation is required; the unnecessary Mac Postgres container was stopped.
The prior isolated server recovery infrastructure is retained and will be reused for runtime
changes invalidated by the final candidate. CI-only changes do not invalidate restore mechanics.

SHARED verification now checks the actual serving database, organisation tenant mapping and
both provider storage namespaces, and explicitly records changed attestations in the audit trail.
Unsupported higher isolation modes do not become READY from commercial metadata. New runtime
fulfilment still requires exact-candidate isolated and live production proof.

The single controlled external invitation-template probe was accepted by production SMTP with
TLS/authentication, From `hello@buildwithwitness.com`, Reply-To `support@buildwithwitness.com`
and activation origin `https://app.buildwithwitness.com`. Inbox delivery and recovery link flow
remain FAIL until independently observed; SMTP acceptance alone is not delivery evidence.
Keycloak email configuration is present, STARTTLS enabled and password recovery allowed.
A fresh readable Witness/Keycloak checkpoint was taken before the recovery test attempt.
No real customer records were changed. Production API/web identities remain unchanged, healthy,
with zero restarts. No production migration or application deployment has occurred.

## Current release decision — 7 October 2026

PR #264 landed first, then #266 as `8029e388ec2eb1b27ce78ff8ae20383794e6a850`.
PR #269 repaired exact-SHA scheduled security evidence handling and landed as
`ec77a1cdcb4355904976c74fa7ea678ec42b0604`. No merge protection was bypassed.
CodeRabbit remains manually requested and non-blocking. PR Security/CodeQL concurrency cancels
superseded runs; required production security and artifact gates remain intact.

Last fully validated candidate: `ec77a1cdcb4355904976c74fa7ea678ec42b0604`.
Hosted CI `37617417804`, Security `37617417836`, CodeQL `37617417833`: PASS.
Immutable publication `37619002470`: PASS, created `2026-10-07T12:00:15.172347+00:00`;
published `2026-10-07T12:11:16.529580+00:00` without rebuilding validated bytes.

- API: `ghcr.io/scigns/witness-api@sha256:a3e61a4daf1c962fcd52e6e5dfba0470a7a8d7a4dac7ad0e166f05b53c079c9a`
- Web: `ghcr.io/scigns/witness-web@sha256:a663cdf190f77558c915a698d72e2af97ca1baf6ca03f60780034514d06d5987`

The retained isolated remote recovery environment started these exact images, verified readiness,
45 migration entries, actual SHARED database/storage attestation, audited idempotent observation,
customer/foreign-organisation denials and operator browser rendering. Unsupported higher isolation
modes remained NOT_PROVISIONED. Remote browser acceptance passed at 375/768/1440 widths.
Compatible immutable recovery images at `313d185174062ba4084cdb6973f943b473f57c53` passed
real OIDC, retained object/accounting reads and new workspace/upload usability in 12.761 seconds.
Legacy production-image recovery remains DATABASE RESTORE REQUIRED (83.302-second prior proof).
The isolated services are stopped; volumes and protected evidence are retained. No Mac Docker used.
Sanitized exact-candidate evidence: [release proof](../handoffs/evidence/PRODUCTION_RELEASE_EC77A1C_2026-10-07.json).

| Critical gate                                        | IMPLEMENTED                                | TESTED                          | REHEARSED                                        | DEPLOYED                                   | PRODUCTION VERIFIED                 |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------- |
| Build, tests, security, tenant/auth/quota invariants | PASS                                       | PASS: exact SHA hosted CI       | PASS                                             | FAIL: candidate not deployed               | FAIL: pending deployment            |
| Immutable image validation/publication/identity      | PASS                                       | PASS                            | PASS                                             | FAIL: candidate not deployed               | FAIL: pending deployment            |
| Backup, DB/Keycloak/object restore, 12 migrations    | PASS                                       | PASS                            | PASS: retained recovery proof; ledger 33 to 45   | FAIL: candidate migrations not applied     | FAIL: pending deployment            |
| Rollback                                             | PASS                                       | PASS                            | PASS: compatible images; legacy requires restore | FAIL: release not deployed                 | FAIL: pending deployment            |
| SHARED provisioning and denied isolation escalation  | PASS                                       | PASS                            | PASS: exact candidate/provider evidence          | FAIL: candidate not deployed               | FAIL: pending deployment            |
| Commercial lifecycle/frontend acceptance             | PASS                                       | PASS                            | PASS: synthetic supplier profile                 | FAIL: candidate not deployed               | FAIL: real supplier profile missing |
| External invitation and recovery email               | PASS: transport exists                     | PASS: SMTP TLS/auth/acceptance  | FAIL: no external inbox/link proof               | FAIL: candidate not deployed               | FAIL: external delivery unverified  |
| Supplier invoice configuration                       | PASS: forwarding/preflight repair prepared | PASS: targeted safety checks    | FAIL: real configuration absent                  | FAIL: repair not deployed                  | FAIL: six required values absent    |
| Exact-artifact deployment approval                   | PASS: protected manual workflow            | PASS: safety checks             | PASS: retained rollback controls                 | FAIL: workflow disabled; no approved tuple | FAIL: pending approved deployment   |
| Synthetic client acceptance in production            | PASS: procedure exists                     | PASS: isolated application path | PASS: isolated candidate                         | FAIL: not deployed                         | FAIL: not run live                  |

No deferred critical risk has been accepted. Existing successful restore/migration proofs are retained;
configuration-control changes do not justify repeating the entire recovery exercise. A new source
checkpoint must obtain its own hosted CI and immutable artifacts; the PASS values above belong only
to ec77a1c. The deployment preflight repair validates complete supplier fields and invokes the exact
image's installed runtime validator offline before backup/migration/Compose mutation, without
printing credentials or remittance. This repair is not yet production verified.

NOT READY FOR PRODUCTION. Exact blockers:

1. The controlled external invitation and Keycloak recovery messages were SMTP accepted, but
   repeated inbox/spam/trash searches found no delivery. Provider delivery-log access is required
   at `https://app.brevo.com/transactional/email/logs`; inspect the controlled recipient
   `vunilagibookclub+witness-release-20261007@gmail.com`. Do not resend blindly or claim delivery.
2. Protected production configuration lacks BILLING_LEGAL_NAME, BILLING_ADDRESS, BILLING_EMAIL,
   BILLING_BANK_ACCOUNT_NAME, BILLING_BANK_BSB and BILLING_BANK_ACCOUNT_NUMBER. An authorised
   operator must populate reviewed supplier/remittance facts in `/home/witness/witness/.env`;
   no invented values, secrets in Git/chat, or real-client invoices before this is resolved.
3. The necessary configuration-control repair requires final combined-SHA CI/publication and
   configuration verification. Only after critical gates pass may the approved tuple be set,
   the authoritative manual workflow enabled/dispatched, and the owner approve its pilot
   environment review. No automatic main deployment or agent approval is permitted.

Immediately before production mutation, the workflow must take fresh DB/Keycloak backups and
checksums and record live image IDs, ledger, Compose and routing state. The earlier recovery/email
checkpoints do not substitute for that fresh checkpoint. Live acceptance and CLIENT READY remain FAIL.

## Final merged artifact decision — 8 October 2026

This decision supersedes the ec77a1c decision above. PR #270 merged through normal protection as
`a5976e2d9a4bb116bfc716d3f5749ba569569ef9`. The repair forwards the supplier profile and rejects
missing or invalid runtime configuration before production mutation. Its fake-infrastructure
harness covers refusal before backup, migration and recreation; no Mac Docker was used.

Exact main CI `37695488119`, Security `37695487904`, CodeQL `37695487925`: PASS.
Release image validation is PASS in that CI run. Immutable publication `37697961604`: PASS.
Images were created `2026-10-07T22:24:59.706760+00:00` and published
`2026-10-07T22:44:42.150375+00:00` from the validated bytes without rebuilding.

The exact published API/web artifacts started healthy in the retained isolated runtime.
Migration checksums still match all 45 entries; no new migration or restore was performed.
Real OIDC, actual SHARED provider attestation, audit idempotency, customer/cross-org denials and
higher-isolation refusal passed at this SHA. Candidate restart counts were zero and no critical
startup errors were found. Compatible rollback to 313d185 passed retained reads and new writes
in 10.992 seconds, preserving `45|8|5|4|2|2|6|258` migration/data/audit counts across the swap.
The temporary services are stopped. Production images remain the original recorded IDs and its
migration ledger remains 33. The real production supplier profile remains absent in the exact-image
offline config probe; auth URLs, storage/SMTP presence and API/web profile checks pass.

Application, frontend, auth and schema source did not change from ec77a1c. Its browser acceptance
and original DB/Keycloak/object restore proofs are retained with that explicit scope; they are
not relabelled as new-SHA test executions. New-SHA hosted tests, image/runtime/OIDC/provisioning
and compatible rollback proof are recorded separately in
[final artifact evidence](../handoffs/evidence/PRODUCTION_RELEASE_A5976E2_2026-10-08.json).
This evidence-only documentation checkpoint does not replace the selected artifact SHA.

| Critical gate                                  | IMPLEMENTED     | TESTED                             | REHEARSED                                                                      | DEPLOYED                                   | PRODUCTION VERIFIED                     |
| ---------------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------- |
| Core code/security/isolation/auth/quota safety | PASS            | PASS: a5976e2 hosted checks        | PASS: exact-artifact auth/provisioning plus retained unchanged-code acceptance | FAIL: candidate not deployed               | FAIL: pending deployment                |
| Migration, DB/Keycloak/object recovery         | PASS            | PASS: unchanged inventory verified | PASS: retained restore; exact 45-entry ledger checked                          | FAIL: production ledger still 33           | FAIL: pending deployment                |
| Immutable images and identity                  | PASS            | PASS: a5976e2 CI/publication       | PASS: exact artifacts                                                          | FAIL: candidate not deployed               | FAIL: pending deployment                |
| Compatible rollback; legacy DB restore         | PASS            | PASS                               | PASS: 10.992 seconds; legacy restore proof retained                            | FAIL: candidate not deployed               | FAIL: pending deployment                |
| Truthful SHARED provisioning                   | PASS            | PASS                               | PASS: a5976e2 provider/audit/denial proof                                      | FAIL: candidate not deployed               | FAIL: pending deployment                |
| Commercial lifecycle/frontend                  | PASS            | PASS                               | PASS: unchanged synthetic application path                                     | FAIL: candidate not deployed               | FAIL: real supplier profile absent      |
| Supplier forwarding and fail-closed preflight  | PASS            | PASS: local harness and hosted CI  | PASS: absence detected in offline probe                                        | FAIL: production profile missing           | FAIL: authorised configuration required |
| External email                                 | PASS: transport | PASS: SMTP TLS/auth/acceptance     | FAIL: no inbox/link proof                                                      | FAIL: candidate not deployed               | FAIL: provider verification required    |
| Protected exact-artifact deployment            | PASS            | PASS                               | PASS: rollback controls                                                        | FAIL: disabled and no approved final tuple | FAIL: pending approved deployment       |
| Live synthetic client acceptance               | PASS: runbook   | PASS: isolated path                | PASS: scoped evidence above                                                    | FAIL: candidate not deployed               | FAIL: not run live                      |

RELEASE CANDIDATE SHA: a5976e2d9a4bb116bfc716d3f5749ba569569ef9

API IMAGE DIGEST: sha256:145c879f66aebf388199a3249468554820f6e7fd97bbf975f4635bb8bbab522e

WEB IMAGE DIGEST: sha256:141a3baef0116c159d42086cabbccdda945ce7656d27d607ddcc5b3925bfb5ab

MIGRATION SET: retained 12 migrations; production 33 to candidate 45; checksums unchanged.
The exact complete inventory is in the immutable manifest in the linked evidence.

BACKUP VERIFIED: PASS — retained proof; fresh pre-mutation backups still mandatory.

RESTORE REHEARSED: PASS — Witness, Keycloak and 13 objects; unchanged restore mechanics.

ROLLBACK REHEARSED: PASS — exact candidate to compatible 313d185 in 10.992 seconds;
legacy production images require DATABASE RESTORE.

SECURITY: PASS — exact main Security and CodeQL.

TENANT ISOLATION: PASS — hosted tests and isolated customer/cross-org denial proof.

AUTH: PASS — exact-artifact OIDC; live candidate verification remains pending deployment.

QUOTA/RESERVATION: PASS — exact hosted tests and retained accounting/read/write rollback proof.

COMMERCIAL ACTIVATION: FAIL for production — synthetic lifecycle passes, real supplier absent.

FRONTEND ACCEPTANCE: PASS — retained unchanged-code browser proof and exact-artifact validation;
live production candidate acceptance remains pending.

RELEASE IMAGE VALIDATION: PASS — exact main CI 37695488119; publication 37697961604 PASS.

DEPLOYMENT CONTROL: PASS implemented/tested; execution held, workflow disabled, no final approval.

CLIENT ACCEPTANCE: FAIL — live synthetic production-client acceptance not performed.

FINAL_RELEASE_SHA: a5976e2d9a4bb116bfc716d3f5749ba569569ef9

PREVIOUS_API_IMAGE_DIGEST: sha256:994f78c2266c52cd57d11fca42f8ff28643583605026e2ba29f2b6628989426b

PREVIOUS_WEB_IMAGE_DIGEST: sha256:a7bd28eb30fb553b27266b92c25efd42f9f85cdf857cdddde86493b380f10d3c

ROLLBACK_SHA: 313d185174062ba4084cdb6973f943b473f57c53 for compatible recovery;
old production API 0a273631087550f898a85c1e917a772fb8a22d20 requires DB restore.

NOT READY FOR PRODUCTION. Remaining prerequisites are controlled external email inbox/link
verification and the authorised real supplier profile. No critical deferred risk is accepted.
After these pass, set only this exact approved publication/recovery tuple, obtain the pilot
human approval, take the fresh authoritative workflow checkpoint, deploy and complete live
synthetic client acceptance. Do not substitute later main commits or mutable tags.
