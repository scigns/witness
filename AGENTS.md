# Witness agent instructions

## Remote-first validation

On developer machines, the normal loop is: inspect status and diff → edit → optionally
run cheap checks on changed files → commit explicit paths → push → inspect GitHub Actions.
Docker Desktop may remain stopped. Full validation is authoritative in GitHub-hosted CI,
not on the developer laptop or production server. Report the exact SHA and remote check results;
pending checks are pending, never a PASS. Do not weaken gates or bypass commit hooks.

Do not automatically run Docker Compose, local Postgres/Neo4j/Keycloak, `make dev*`,
`make verify`, full `pnpm test`/`pnpm build`, Turbo workspace gates, invariant/adversarial
suites, container builds, migration/deployment rehearsals or production acceptance suites
on a developer machine. Keep these available for explicitly requested infrastructure debugging
or rehearsals; state the resource requirements first. Cheap local checks include `git diff --check`,
format/lint on explicit changed files, shell syntax checks and selected tests known to need no
services or dependency builds. A filtered Turbo target can still build dependencies; do not
assume it is lightweight. Do not install a full workspace merely to review documentation.

Use `gh pr checks <number>` and `gh run view <id>` after pushing. CI continues if the laptop
and Docker Desktop are shut down. GitHub-hosted runners run all lint/format/type/test/integration,
invariant/adversarial, security/CodeQL and build gates. Never move PR validation onto the
production/pilot runner. That runner is reserved for approved deployment operations.

## Preserve active work and release controls

Inspect Git status and existing changes before edits. Preserve checkpoints and unrelated work;
stage explicit paths, never `git add -A`, `git clean` or destructive resets. In particular,
untracked `apps/participant-mobile/` is protected: do not inspect, edit, stage, move or delete it.
Stay on the existing branch unless the user requests otherwise. Do not merge or deploy as a
side effect of development tooling work. Exact-SHA/image approval, backup/restore, compatibility
and production acceptance gates remain mandatory; remote CI does not replace those gates.

See [execution audit and command classes](docs/engineering/REMOTE_FIRST_EXECUTION.md) and
[development environments](docs/engineering/DEVELOPMENT_ENVIRONMENTS.md).
