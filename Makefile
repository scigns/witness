## Witness — developer entry points.
##
## `make` with no target prints this help. Every target here is also what CI runs;
## if it works locally it works in CI, and if it doesn't, that discrepancy is a bug.

.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE := docker compose -f infrastructure/docker/docker-compose.yml
COMPOSE_OBS := $(COMPOSE) -f infrastructure/docker/docker-compose.observability.yml

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ─── Environment ──────────────────────────────────────────────────────────────

.PHONY: bootstrap
bootstrap: ## First-time setup: check prerequisites, install deps, create .env
	@bash scripts/dev/check-prerequisites.sh
	@test -f .env || cp .env.example .env
	pnpm install
	@echo "Bootstrap complete. Run 'make dev' to start the local stack."

.PHONY: dev
dev: ## Start the local development stack (Postgres, Neo4j, OpenSearch, Redis, MinIO, Keycloak, NATS)
	$(COMPOSE) up -d
	@bash scripts/dev/wait-for-healthy.sh

.PHONY: dev-obs
dev-obs: ## Start the local stack plus observability (Prometheus, Grafana, Tempo, Loki)
	$(COMPOSE_OBS) up -d
	@bash scripts/dev/wait-for-healthy.sh

.PHONY: down
down: ## Stop the local stack, preserving volumes
	$(COMPOSE_OBS) down

.PHONY: clean
clean: ## Stop the local stack and DESTROY all local data volumes
	@echo "This destroys all local data volumes. Ctrl-C within 5s to abort."
	@sleep 5
	$(COMPOSE_OBS) down -v
	rm -rf node_modules/.cache .turbo

.PHONY: logs
logs: ## Tail logs from the local stack
	$(COMPOSE_OBS) logs -f --tail=100

.PHONY: reset-data
reset-data: ## Wipe and re-seed local databases with synthetic fixtures
	@bash scripts/dev/reset-data.sh

# ─── Quality gates ────────────────────────────────────────────────────────────

.PHONY: verify
verify: format-check lint typecheck test build ## Run every gate CI runs (do this before opening a PR)

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
test: ## Run unit and integration tests
	pnpm test

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests (requires the local stack)
	pnpm test:e2e

.PHONY: build
build: ## Build all workspaces
	pnpm build

# ─── Documentation & architecture ─────────────────────────────────────────────

.PHONY: docs-lint
docs-lint: ## Lint markdown and check links
	pnpm docs:lint
	pnpm docs:links

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
	pnpm deps:licenses
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
release-check: ## Run the pre-release checklist
	@bash scripts/release/preflight.sh
