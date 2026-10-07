# CI/CD

**Owner:** Infrastructure Lead
**Status:** Active
**Workflows:** [`.github/workflows/`](../../.github/workflows/)

## Development loop

Edit on the Mac, run optional cheap checks on explicit changed files, commit explicit paths,
push, and inspect `gh pr checks 266`. Docker Desktop and local databases are unnecessary.
Do not run full workspace builds, service stacks or acceptance suites before every push.
GitHub-hosted CI owns full validation; the production runner owns approved deployment operations.

Batch a coherent change into one checkpoint rather than pushing each edit. Superseded PR CI,
Security and CodeQL runs are cancelled. Main and scheduled security evidence is preserved.
CodeRabbit is advisory and opt-in through `@coderabbitai review`; repository configuration disables
automatic and incremental reviews and outward review status. It is not a required merge check.
See [CodeRabbit configuration](https://docs.coderabbit.ai/reference/configuration).

## Actual workflows

| Workflow | Trigger | Execution and purpose |
|---|---|---|
| CI | PR, main/develop push, merge group | Hosted lint, format, types, tests, live DB integration, builds, images |
| Security | PR, main/develop push, daily | Hosted secrets, dependencies, licences, zero-egress, workflow pinning |
| CodeQL | PR to main/develop, main/develop push, weekly | Hosted extended TypeScript security analysis |
| Release artifacts | Explicit full-SHA artifact tag | Hosted publication of already validated image bytes |
| Deploy pilot | Manual dispatch only; currently disabled | Protected production runner, approved SHA and digests |
| Cloudflare Email Routing | Manual inspect/apply | Hosted controlled routing operation |
| Branch sync | Weekdays, manual | Hosted divergence report; does not merge branches |
| Stale | Daily, manual | Issue and PR housekeeping |

Documentation and repository governance are jobs inside CI, not separate workflows.
There are no automatic sandbox deployment, nightly E2E or AI evaluation workflows here.
Routine GitHub Actions dependency updates are grouped into one maintenance PR.

## Required validation and artifacts

Main protection currently requires `CI gate`, `Secret scanning`, `Workflow hardening` and
`Zero-egress verification`, with strict up-to-date checks and administrator enforcement.
CI gate aggregates documentation, governance, static analysis, unit/contract tests,
invariants/adversarial tests, live Postgres/Neo4j integration, build and release image validation.
Scope detection is also required so a failed detector cannot produce a green aggregate gate.
Security and CodeQL results must additionally pass for a release candidate.

Jobs install from the frozen lockfile and use pnpm and Turbo caches. Parallel jobs provide early
feedback. Release image builds wait for all code gates, including bundle/build validation, so a
failed build does not consume a container-build slot. No required test is removed for speed.
The current detector checks workspace existence, not changed paths: documentation edits still
run full validation. There is no claim of implemented affected-project filtering or a measured
p95 timing guarantee. Path filtering needs dependency-aware coverage and explicit release full
validation before it can safely replace these gates.

The image job checks out the exact source SHA, builds API/web on hosted CI, validates them and
uploads their bytes. Publication imports those same bytes and records immutable GHCR digests.
It does not rebuild. See the [artifact pipeline](../release/REGISTRY_ARTIFACT_PIPELINE_2026-10-06.md).
All Actions are pinned; untrusted PR jobs have no production secrets or package write token.

## Sandbox and production separation

| Surface | Purpose | Data and routing |
|---|---|---|
| Mac | Editing and cheap checks | No running service stack required |
| Hosted CI | Disposable validation sandbox | Synthetic data; disposable Postgres/Neo4j |
| Server recovery rehearsal | Candidate restore/migration/rollback proof | Isolated project/network/volumes, no production routing |
| Production pilot | Approved runtime deployment | Exact approved artifacts and production release controls |

GitHub currently exposes only the `pilot` environment and the `witness-prod-01` production runner.
There is no configured persistent development sandbox or sandbox runner. The server's isolated
recovery environment is a release rehearsal, not a destination for arbitrary development pushes:
it can contain restored production data and must retain its recovery controls.

For routine implementation, push to the existing branch and use hosted CI's disposable sandbox.
For interactive server acceptance, use a dedicated synthetic-data sandbox only after its host,
private routing, credentials and isolated volumes are identified. Never route arbitrary PR code
or production secrets to the production runner. A sandbox deployment must select exact candidate
artifacts, serialize deployment, and report identity and health before claiming success.

Production is a separate manual path: exact approved SHA and immutable API/web digests, protected
human approval, candidate-specific restore/migration/rollback and acceptance evidence, then fresh
backups immediately before mutation. No push-to-main deployment, mutable tags, host builds or
local Docker acceptance substitutes. The deployment workflow remains disabled during this review.
See [release reconciliation](../release/PRODUCTION_RECONCILIATION_2026-10-06.md).

## Operational checks

After pushing, inspect the exact SHA with `gh pr checks 266` and `gh run view <run-id>`.
Pending is pending. Cancelled obsolete runs are not evidence for the current candidate.
Do not reuse a previous SHA's PASS for deployment. Fix failures without weakening tests or hooks.
When main fails, stop merging and fix forward or deliberately revert through repository governance.
