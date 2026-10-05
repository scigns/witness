# Production release reconciliation — 6 October 2026

**Owner:** Engineering and release manager

**Status:** BLOCKED; no release candidate approved or deployed

## Identity reconciliation

| State                             | Identity                                                    | Evidence                                                           |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Current deployed API              | `0a273631087550f898a85c1e917a772fb8a22d20`, version `0.4.0` | TLS-verified public `/ready`; PostgreSQL and Keycloak healthy      |
| Current main                      | `d2771a29ff90677868993039d0511b8fe9ee028e`                  | `git ls-remote origin refs/heads/main`                             |
| PR #266 inspected head            | `104bf60a25c634a61e4970396b3b0c71a94e2f35`                  | GitHub PR API; draft, integration/CI gate failed                   |
| PR #264 dependency                | `215f3500b542d00ced424de9a23db25fb6c31d2d`                  | Commercial entitlements; base main; unit/integration checks failed |
| PR #262 parallel feature          | `b0688423b79bb410ab1e2823f907ff4c24daff2d`                  | Help search; base main; unit check failed; not an ancestor of #266 |
| Runner                            | `witness-prod-01`, online, idle                             | GitHub runner API; labels self-hosted/Linux/X64/witness-pilot      |
| Authoritative deployment checkout | Runner checkout; user reports `d2771a2`                     | Host path still requires independent read-only verification        |
| Stale checkout                    | `/home/witness/witness`, user reports `a0a0b0c`             | Not deployment authority; do not pull or deploy there              |
| Rollback build target             | `0a273631087550f898a85c1e917a772fb8a22d20`                  | Current public API identity; exact API/web image IDs still UNKNOWN |

Public www and app `/workspaces` returned HTTP 200. These checks prove endpoint availability,
not authenticated browser acceptance or that web and API share a build SHA.

SSH diagnostics: the server accepts the configured `~/.ssh/witness_claude` public key, fingerprint
`SHA256:zBGFDVuzbcauZKelwEROtyFq75bJI2e2d5kPkdv78mE`, but BatchMode authentication cannot complete.
The local SSH agent lists two other identities, not this key. Load the Witness key locally using
`ssh-add ~/.ssh/witness_claude`; never transmit its passphrase. Host backup checksums, applied
migrations, container image IDs, runner path and recovery evidence remain unverified by this session.

## Merge and deployment order

1. Block automatic deployment before any main merge. Main still has the old workflow/script without
   the candidate's exact-SHA approval control. GitHub `pilot` reports no protection rules. A dependency
   merge can therefore trigger an intermediate production deployment. Establish and verify the
   release hold through the existing GitHub deployment controls first.
2. Resolve #264's failed checks and review it; merge #264 before #266. Preserve the dependency history
   and retarget #266 to main after the dependency merge. Do not bypass failed checks.
3. #262 is a parallel dependency only if Help & Knowledge is included in this release. #266 does not
   contain its API/page/indexer. If included, repair/review #262, merge it before final runtime
   reconciliation, resolve overlapping shell/schema/API changes, and validate the combined release.
   Do not count Help navigation or search as delivered by #266 alone.
4. Review and merge the reconciled #266 only after critical release gates pass. Run CI, security,
   migration rehearsal and frontend acceptance on the resulting exact main SHA; record release
   manager go/no-go and that SHA. No current feature SHA is an approved main release artifact.
5. Deploy one approved combined release through GitHub Actions. Do not deploy intermediate
   dependencies. The candidate script builds SHA-tagged images, records immutable image IDs and
   prior build identity, takes immediate Witness/Keycloak backups, verifies both backup sets, runs
   `prisma migrate deploy` from the candidate API image, recreates API/web and verifies the API SHA.
6. Verify exact web/API identity, health, www/app/api and production-safe synthetic client acceptance;
   update the gate matrix before any client-ready declaration.

## Migration delta

The following 12 migration directories exist between the reported running API commit and #266.
This is a **Git delta**, not the production database's pending migration list. Query the production
`_prisma_migrations` ledger and compare checksums before deciding what will actually run.

| Migration                                                 | Review focus                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `20260919090741_evidence_knowledge_graph`                 | New graph/provenance/outbox tables, constraints and seed relationships                                                |
| `20260921003323_widen_candidate_status`                   | Candidate status constraint widening                                                                                  |
| `20260922105103_workspace_invitation_and_affiliation`     | Invitation/affiliation tables and authority foreign keys                                                              |
| `20260922122842_workspace_lifecycle_status`               | Workspace lifecycle column/default                                                                                    |
| `20260923073459_session_join_link`                        | Join tables; drops an invitation FK/default and renames existing constraints; verify old-image compatibility          |
| `20260923080428_participant_capture_token`                | Capture token table/constraints                                                                                       |
| `20260924044439_receipt`                                  | Receipt uniqueness and number allocation function                                                                     |
| `20260925005140_agreement`                                | Agreement tables and commercial-history foreign keys                                                                  |
| `20261004072548_commercial_entitlements_resource_profile` | Tenant/profile catalogue and entitlement seed IDs; verify collisions/catalogue integrity                              |
| `20261004115917_resource_profile_quota_and_tenant_status` | Quota becomes nullable; retains existing overrides; verify old API behaviour after new organisations have null quotas |
| `20261005010000_durable_storage_reservations`             | Durable ledger with unique/check constraints and organisation delete restriction                                      |
| `20261005020000_login_return_path`                        | Nullable login return path; existing attempts retain safe default                                                     |

PR #262 would additionally introduce `20261004053834_help_and_knowledge_search` if included.
Do not describe the entire deployed-to-candidate delta as strictly additive: constraint/default
changes and nullable quota semantics require a restored-production-data upgrade/old-image rehearsal.
Image rollback does not reverse the database. Capture both exact running image IDs before builds;
preserve pre-deployment dumps and verify previous images against the upgraded schema. If incompatible,
database restore is a separately approved recovery operation, with downtime/data-loss implications.

## Candidate repair and gate evidence

The failed #266 integration run rejected participant audio because its synthetic organisation had
no subscription. The fixture now includes a FREE subscription and scoped cleanup. Runtime
subscription enforcement remains unchanged. Corrected local Node 22 live integration passes
**68 tests in 8 files**, including participant capture, reservations, commercial activation and
cross-organisation invitation authority. CI for the repaired checkpoint is still required.

BACKUP, BACKUP CHECKSUM, RESTORE PATH, actual MIGRATION REVIEW/rehearsal, live TENANT ISOLATION,
AUTH, FRONTEND ACCEPTANCE and actual ROLLBACK remain blocked/unknown. Prior local tests are retained
in [the acceptance matrix](PRODUCTION_ACCEPTANCE_2026-10-05.md), which separates IMPLEMENTED,
TESTED, DEPLOYED and PRODUCTION VERIFIED. Security checks at `104bf60` passed; its CI gate did not.
No risk acceptance, merge, tag, production backup mutation, migration, deployment, OS upgrade or
reboot occurred. **Not client ready.**
