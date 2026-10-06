## Witness — developer entry points.
##
## `make` with no target prints help. Full gates are CI-authoritative; local stack
## and full-suite targets are opt-in debugging. See AGENTS.md and REMOTE_FIRST_EXECUTION.md.

.DEFAULT_GOAL := help
SHELL := /bin/bash
# --env-file is not optional here. Compose resolves `.env` relative to the compose
# FILE's directory, not the working directory, so without this the root .env is
# silently ignored and every `${VAR:?}` in the stack fails with a message naming a
# variable the contributor has already set. Relative volume paths inside the
# compose file still resolve against infrastructure/docker/, which is why this is
# --env-file rather than --project-directory.
COMPOSE := docker compose --env-file .env -f infrastructure/docker/docker-compose.yml
COMPOSE_INTEGRATION := $(COMPOSE) --profile integration
COMPOSE_FULL := $(COMPOSE) --profile full
COMPOSE_OBS := $(COMPOSE) -f infrastructure/docker/docker-compose.observability.yml

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ─── Environment ──────────────────────────────────────────────────────────────

# Created on first use rather than documented as a manual step, because a setup
# step a contributor can forget is a setup step a contributor will forget.
.env:
	@cp .env.example .env
	@echo "Created .env from .env.example. Review it before using a real deployment."

.PHONY: doctor
doctor: ## Optional infrastructure debugging: check Docker, Postgres and ports
	@bash scripts/dev/doctor.sh

.PHONY: disk-usage
disk-usage: ## Show what Witness's own Docker resources are using, and what's safe to remove
	@bash scripts/dev/disk-usage.sh

.PHONY: bootstrap
bootstrap: ## Docker-free dependency setup for targeted local editing (optional)
	@bash scripts/dev/check-prerequisites.sh
	pnpm install
	@echo "Edit, optionally check changed files, commit, push, then inspect GitHub Actions. Docker may stay off."

.PHONY: bootstrap-runtime
bootstrap-runtime: .env ## Optional local runtime debugging setup; requires Docker
	@bash scripts/dev/check-prerequisites.sh --infrastructure
	pnpm install
	@# The Prisma client is generated, not installed. `pnpm install` cannot do it —
	@# the postinstall hook runs before the schema is resolvable and skips with a
	@# warning. Without this, `make seed` fails on a clean clone even though every
	@# documented step before it succeeded.
	pnpm --filter @witness/api exec prisma generate
	@echo
	@echo "Bootstrap complete. Next:  make dev  &&  make migrate  &&  make seed  &&  make app"

.PHONY: dev
dev: .env ## Optional local debugging: start Postgres (requires Docker)
	$(COMPOSE) up -d
	@bash scripts/dev/wait-for-healthy.sh

.PHONY: dev-integration
dev-integration: .env ## Optional debugging: add Neo4j/Keycloak; CI runs integration remotely
	$(COMPOSE_INTEGRATION) up -d
	@COMPOSE_FILE=infrastructure/docker/docker-compose.yml bash scripts/dev/wait-for-healthy.sh

.PHONY: dev-full
dev-full: .env ## dev-full: the complete stack (adds OpenSearch, MinIO, NATS, Ollama, Valkey) — release-candidate acceptance
	$(COMPOSE_FULL) up -d
	@COMPOSE_FILE=infrastructure/docker/docker-compose.yml bash scripts/dev/wait-for-healthy.sh

.PHONY: dev-obs
dev-obs: .env ## Start the local stack plus observability (Prometheus, Grafana, Tempo, Loki)
	$(COMPOSE_OBS) up -d
	@bash scripts/dev/wait-for-healthy.sh

.PHONY: app
app: ## Run the Witness API and web application (requires `make dev`)
	pnpm dev

.PHONY: migrate
migrate: ## Apply database migrations
	pnpm --filter @witness/api exec prisma migrate deploy

.PHONY: migrate-dev
migrate-dev: ## Create and apply a migration from schema changes
	pnpm --filter @witness/api exec prisma migrate dev

.PHONY: seed
seed: ## Seed the database with synthetic fixtures
	pnpm --filter @witness/api run seed

.PHONY: down
down: .env ## Stop the local stack, preserving volumes
	$(COMPOSE_OBS) --profile full down

.PHONY: clean
clean: .env ## Stop the local stack and DESTROY all local data volumes
	@echo "This destroys all local data volumes. Ctrl-C within 5s to abort."
	@sleep 5
	$(COMPOSE_OBS) --profile full down -v
	rm -rf node_modules/.cache .turbo

.PHONY: logs
logs: .env ## Tail logs from the local stack
	$(COMPOSE_OBS) --profile full logs -f --tail=100

.PHONY: reset-data
reset-data: ## Wipe and re-seed local databases with synthetic fixtures
	@bash scripts/dev/reset-data.sh

.PHONY: pilot-deploy
pilot-deploy: ## Deployment-server-only: approved release workflow entrypoint
	@bash scripts/pilot/deploy.sh

.PHONY: pilot-backup
pilot-backup: ## Back up the pilot's Postgres to ~/witness-backups (or $BACKUP_DIR)
	@bash scripts/pilot/backup.sh $(BACKUP_DIR)

.PHONY: pilot-backup-status
pilot-backup-status: ## Report on the pilot's backups: age, size, checksum validity
	@bash scripts/ops/backup-status.sh $${BACKUP_DIR:-$$HOME/witness-backups}

.PHONY: pilot-status
pilot-status: ## One view: deployed commit, component health, containers, failed jobs, backups
	@bash scripts/ops/status.sh

# ─── Quality gates ────────────────────────────────────────────────────────────

.PHONY: verify
verify: format-check lint typecheck test build ## CI-authoritative full gates; optional local reproduction

.PHONY: lint
lint: ## Lint all workspaces
	pnpm lint

.PHONY: format-check
format-check: ## Check formatting
	pnpm format:check

.PHONY: format
format: ## Apply formatting
	pnpm format

.PHONY: typecheck
typecheck: ## Typecheck all workspaces
	pnpm typecheck

.PHONY: test
test: test-operations ## CI-authoritative full suite; optional local reproduction
	pnpm test

.PHONY: test-operations
test-operations: ## Verify deployment rollback and backup safety without infrastructure
	python3 scripts/pilot/deploy.test.py
	python3 scripts/ops/backup-status.test.py
	python3 scripts/release/publication.test.py

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests (requires the local stack)
	pnpm test:e2e

.PHONY: build
build: ## CI-authoritative workspace build; optional local reproduction
	pnpm build

# ─── Documentation & architecture ─────────────────────────────────────────────

.PHONY: docs-lint
docs-lint: ## Lint markdown and check internal links
	pnpm docs:lint
	@bash scripts/ci/check-links.sh
	@bash scripts/ci/check-doc-headers.sh

.PHONY: adr
adr: ## Create a new ADR from the template (usage: make adr TITLE="short title")
	@node scripts/dev/new-adr.mjs "$(TITLE)"

.PHONY: check-context
check-context: ## Verify STATUS.md and ROADMAP.md are not stale relative to recent changes
	@bash scripts/ci/check-context-freshness.sh

# ─── Security & supply chain ──────────────────────────────────────────────────

.PHONY: security
security: ## Run the full local security suite (secrets, deps, licences, containers)
	@bash scripts/security/scan-secrets.sh
	pnpm deps:audit
	@bash scripts/security/check-licenses.sh
	@bash scripts/security/scan-containers.sh

.PHONY: sbom
sbom: ## Generate a CycloneDX software bill of materials
	pnpm sbom

.PHONY: egress-test
egress-test: ## Verify the sovereign profile makes zero external network calls
	@bash scripts/security/verify-no-egress.sh

# ─── Release ──────────────────────────────────────────────────────────────────

.PHONY: changeset
changeset: ## Record a change for the next release
	pnpm changeset

.PHONY: release-check
release-check: ## Full release preflight; optional isolated rehearsal, not routine local validation
	@bash scripts/release/preflight.sh
