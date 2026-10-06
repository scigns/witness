# Registry artifact pipeline — 6 October 2026

**Owner:** Platform Engineering / SRE
**Status:** Candidate implementation; production workflow remains disabled

## Architecture and trust

Before: the self-hosted deployment runner compiled API/web from checkout, then migrated and started
local image IDs. After: GitHub-hosted CI builds API/web once for the exact PR head/main SHA, checks
OCI metadata, packaged migrations, installed Prisma CLI/engine and standalone web build identity,
then uploads checksummed Docker image bytes and `build-manifest.json`. All previous gates remain.
No registry-write token or production secrets are available to that image-build job.

Publication is deliberate: a maintainer with repository write access pushes
`witness-artifact-<full 40-character SHA>` after reviewing that exact source and green gates. The
`Release artifacts` workflow has no PR trigger. It checks latest exact-SHA CI/security runs (and
CodeQL when that existing workflow applies), downloads the successful CI run/attempt's archive,
checks hashes/revision/platform/schema and **pushes the existing images, never rebuilds**. The tag
approves publication only; it is not a production release approval or a client-ready decision.
Do not tag unreviewed PR code. General PR execution stays on ephemeral GitHub-hosted runners.

Image names:

- `ghcr.io/scigns/witness-api:<full SHA>` / `ghcr.io/scigns/witness-api@sha256:<digest>`
- `ghcr.io/scigns/witness-web:<full SHA>` / `ghcr.io/scigns/witness-web@sha256:<digest>`

SHA tags are discovery handles, not immutable evidence. Publication refuses an existing SHA tag
rather than silently replacing it. Deployment requires digest references. Interrupted publication
may leave one image published without a complete manifest; that is not deployable. Recover its
provenance deliberately before retrying; do not rebuild or overwrite to make a run green.

## Build inputs and reproducibility audit

`image-build.json` records non-secret public inputs: `linux/amd64`, API URL
`https://api.buildwithwitness.com`, profile `hybrid`, empty base path. SHA and root Witness version
are Docker build arguments. Both images have OCI revision/version/source labels; API has baked
build/version environment defaults; web compiles exact identity/public configuration into Next.
Production runtime configuration remains operator-held. Different origins/profiles/base paths need
reviewed build inputs, not an attempt to change a compiled web bundle through runtime variables.

The production runner is X64; this candidate supports only `linux/amd64`. No ARM64/multi-platform
release claim is made. Platform is recorded and inspected before deployment. API manifest/source
copies now include its `@witness/knowledge-graph` workspace dependency; the previous Dockerfile
omitted it. Images retain installed Prisma for migration without a Corepack download.

**Not bit reproducible from Git SHA alone:** `node:22-bookworm-slim`, apt packages, a whisper tag
and downloaded model bytes are external inputs. The lockfile pins JS resolution; it does not pin
those external bytes. Manifest digests and retained image bytes establish the release identity.
This pipeline never reconstructs an approved artifact from source during deployment. Pinning all
upstream inputs is separate work; no reproducibility claim is used to waive gates.

## Manifest and approval

CI artifact `witness-images-<SHA>-<attempt>` contains `images.tar.gz`, `SHA256SUMS` and
`build-manifest.json`, retained one day to bound storage. Expiry/missing artifact blocks
publication, never triggers an automatic rebuild. A new CI build is a new artifact requiring fresh
review. Publication artifact `witness-release-<SHA>` contains `release-manifest.json`, retained
90 days. Its versioned JSON includes SHA, Witness version, platform, timestamp, image repositories,
registry digests, OCI revisions, original local IDs, build workflow/run/attempt, publication
workflow/run/attempt, public build inputs and individual schema/migration SHA-256 checksums.
Retain this small manifest in operator release records before GitHub retention expires.

Only after independent release gates pass, the operator may approve exact environment variables:
`WITNESS_APPROVED_RELEASE_SHA`, `WITNESS_APPROVED_ARTIFACT_RUN_ID`,
`WITNESS_APPROVED_API_IMAGE`, `WITNESS_APPROVED_WEB_IMAGE`, plus the existing candidate-specific
rollback SHA/API-ID/web-ID approvals. This task does not set any approvals.

`Deploy pilot` is manual-only from main. It refuses unapproved input SHA/run before checkout,
checks the successful publication workflow/run/SHA, retrieves that run's manifest, then uses an
ephemeral `GITHUB_TOKEN` with `packages: read` to authenticate to GHCR. Publication uses
`contents: read`, `actions: read` (cross-run evidence) and `packages: write`. No permanent PAT or
registry credential is installed on the host. Package source labels link to this repository;
private packages must grant this repository Actions read access. Package visibility/access is
verified at publication/pull, not inferred from repository visibility.

## Deployment and recovery

`deploy.sh` validates approved SHA, version, repositories/digest syntax, manifest publication run,
public inputs and checked-out schema/migration checksums. It captures healthy current identity and
exact running image IDs, then requires existing rollback approval before pulling candidate bytes.
After digest pulls it checks `RepoDigests`, OCI revision/version/source, platform, API baked
identity and the schema/migrations actually packaged inside the pulled API image. Only then does
it record evidence, capture redacted Compose/ledger and take/verify both database backups.

Migrations run from the verified API image ID using installed Prisma. API/web startup and rollback
use `--no-build --no-deps`. The production Compose API/web services have **no `build:` definition**
and `pull_policy: never`; failure cannot fall back to compilation. Explicit pulls are the sole
artifact acquisition path. The optional graph worker is unchanged and is not started by deployment.
API `/ready` SHA and web `/api/build-identity` must match approval before success is recorded.

Rollback still requires compatibility with upgraded schema and candidate writes. Healthy old
containers or available registry images do not prove that. Existing local rollback IDs preserve
legacy recovery targets; future releases can also retain registry digests. No image-only rollback
has been newly approved. Forward-only migration failure still requires operator attention.

Independent object backup/restore, DB/object recovery strategy, rollback compatibility, real
OIDC/email, frontend journey and synthetic client acceptance remain release blockers. See the
[release matrix](PRODUCTION_RECONCILIATION_2026-10-06.md). No merge, production approval change,
workflow enablement, production migration or deployment is authorised by artifact publication.

## Validation

The existing GitHub-hosted `make test` exercises deploy fake-infrastructure tests: missing/wrong
SHA/image/run approval, malformed digest/repository, migration inventory mismatch, registry failure,
OCI revision/RepoDigest mismatch, no builds, migration from approved image, no-build startup,
backup-before-migration and candidate-specific rollback refusal/recovery. CI also runs the actual
Dockerfiles and offline image checks. Full source/live/adversarial/security gates are unchanged.
Trusted tag publication validates importing/pushing the same archive and captures registry digests.
