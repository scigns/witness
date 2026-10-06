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
| Inspected candidate      | `209f1d2`                                                                 | PR #266; all CI/security checks PASS at this checkpoint; new changes require CI     |
| PR #264 parent           | `215f3500b542d00ced424de9a23db25fb6c31d2d`                                | Base main; unit/integration checks FAIL                                             |
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
2. Reconcile/retarget #266 (`feat/commercial-runtime-readiness`, based on #264 `215f350`). Preserve
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

**ROLLBACK FAIL:** automatic image rollback cannot protect null quotas or reservation semantics
after candidate writes. Require a compatible rollback artifact/write rehearsal, or an explicitly
approved DB/object recovery plan with bounded downtime and post-checkpoint data handling. No
destructive production recovery is authorised here. Readiness can be healthy while old Prisma reads
fail, so it is not full rollback acceptance.

## Release gate matrix

PASS is scoped to its evidence. FAIL includes required proof not performed. No critical unknown is
accepted implicitly; no ACCEPTED DEFERRED RISK has been approved.

| Gate                               | IMPLEMENTED                                                     | TESTED                                                  | DEPLOYED                                  | PRODUCTION VERIFIED                           |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Tests                              | PASS                                                            | PASS at 209f1d2; new CI required                        | FAIL: candidate absent                    | FAIL                                          |
| Security/adversarial               | PASS                                                            | PASS at 209f1d2                                         | FAIL                                      | FAIL: full live attack journey pending        |
| Tenant isolation                   | PASS: API/repository boundaries                                 | PASS: local/CI authority tests                          | FAIL                                      | FAIL: candidate cross-org acceptance pending  |
| Quota/reservation                  | PASS                                                            | PASS: contention/fencing/recovery                       | FAIL                                      | FAIL                                          |
| Storage reconciliation             | PASS: bounded reporting and safe lease cleanup                  | PASS: live local tests                                  | FAIL                                      | FAIL                                          |
| Commercial activation              | PASS: catalogue/manual path                                     | PASS: local synthetic lifecycle                         | FAIL                                      | FAIL                                          |
| Authentication                     | PASS: one-time return state                                     | PASS: API safety tests                                  | FAIL                                      | FAIL: real OIDC/deep-link pending             |
| Frontend acceptance                | PASS: shell/landing                                             | PASS: 12 local mocked checks; full journey incomplete   | FAIL                                      | FAIL                                          |
| Migration audit                    | PASS: ledger/checksum/delta                                     | PASS: restored-data upgrade; incompatibility identified | FAIL: unapplied                           | FAIL: live upgrade not authorised             |
| Backup checksum                    | PASS                                                            | PASS: both latest checksums/readability/freshness       | PASS: daily DB backups                    | PASS: SSH verification                        |
| DB restore rehearsal               | PASS                                                            | PASS: both production backups restored                  | PASS: backup path exists; no live restore | PASS for backup restorability only            |
| Object backup/restore              | FAIL: independent protection unproven                           | FAIL                                                    | FAIL                                      | FAIL: 13 objects excluded from DB dump        |
| Rollback                           | FAIL: old model incompatible                                    | FAIL: P2032 reproduced                                  | FAIL: no recovery performed               | FAIL                                          |
| Exact-SHA control                  | PASS: approval/image IDs/web identity; legacy workflow disabled | PASS: mock safety checks                                | FAIL: hardened workflow not on main       | PASS for active release hold only             |
| Subscription/provisioning          | PASS: contracted/observed distinction, upload state checks      | PASS: local lifecycle/boundaries                        | FAIL                                      | FAIL: fulfilment pending                      |
| Operational visibility             | PASS: file ledger/operator endpoints                            | PASS: API tests                                         | FAIL                                      | FAIL: candidate console/usage pending         |
| Email                              | PASS: configured transport                                      | FAIL: delivery pending                                  | PASS: SMTP configured                     | FAIL                                          |
| Current production health/identity | PASS: API SHA/exact images                                      | PASS: endpoint checks                                   | PASS: old system stable                   | PASS for old API/containers; web Git SHA FAIL |
| Synthetic client acceptance        | PASS: local journey exists                                      | PASS: API path; browser journey FAIL                    | FAIL                                      | FAIL                                          |
| Client-ready decision              | FAIL                                                            | FAIL                                                    | FAIL                                      | FAIL — NOT CLIENT READY                       |

No main merge, production migration, candidate deploy, OS upgrade, reboot, real-client data or
financial mutation occurred. Only reversible GitHub release protection changed. Backup copies,
restore/migration probes and browser work remain isolated locally.

Local hybrid-profile browser acceptance passed 12 viewport/role cases at 375, 768 and 1440 px,
including deep-link query/hash preservation, empty Programs landing, create-program/operator
visibility, no primary Pricing link, no horizontal overflow and axe WCAG checks. Reproduce with
`apps/web/test/runtime-readiness.mjs` against a locally built hybrid-profile web using
`NEXT_PUBLIC_WITNESS_API_URL=https://api.rehearsal.invalid`. This uses mocked API responses and
proves neither real OIDC nor production authorisation. Production acceptance remains FAIL.
