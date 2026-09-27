# Production service inventory — DigitalOcean pilot

**Owner:** Infrastructure Lead
**Status:** Active — audit of the actual pilot deployment; no infrastructure change proposed here

What Witness's DigitalOcean pilot host (`witness-prod-01`) actually needs to
run, versus what the local development stack additionally offers. Read
directly from `deployments/cloud-managed/docker-compose.pilot.yml` (the
actual pilot compose file) and `infrastructure/docker/docker-compose.yml`
(the fuller local/single-node-production file, ADR-0013) and the application
code that would call each service — not assumed from "every container that
exists somewhere in this repo."

## Classification

| Status | Meaning |
|---|---|
| **REQUIRED** | The pilot does not function without it. |
| **OPTIONAL** | Present in the pilot compose file, additive, off or lightly used by default — the pilot functions correctly without it, and turning it on is a deliberate, reversible operator action. |
| **DEVELOPMENT ONLY** | Exists for local development ergonomics or an alternate topology; not part of the pilot compose file at all. |
| **DEFERRED** | Present in the local stack, has zero callers in application code today (verified by `grep`, not assumed) — genuinely not needed yet, kept only because a later feature is expected to need it. |

## Inventory

### postgres — REQUIRED

- **Purpose:** the system of record (ADR-0004, ADR-0011) — every domain
  entity, plus (when object storage is unconfigured, see `minio` below)
  evidence-attachment bytes directly.
- **CPU sensitivity:** low at pilot scale; spikes during report/knowledge
  queries.
- **Memory sensitivity:** moderate — `shared_buffers`/connection overhead
  scale with concurrent sessions, not raw data volume, at this scale.
- **Persistent storage:** yes — the only data that matters if lost.
- **Public exposure:** none — no `ports:` in the pilot compose file (verified
  by reading it); reachable only on the compose network.
- **Backup required:** yes — the only service `scripts/pilot/backup.sh`
  actually backs up.
- **Pilot requirement:** hard requirement. Nothing else in this list matters
  if this is wrong.

### keycloak — REQUIRED

- **Purpose:** identity (ADR-0007) — every real sign-in, OIDC token issuance.
- **CPU sensitivity:** moderate — JVM warm-up and token issuance are
  bursty, not steady.
- **Memory sensitivity:** the second-largest fixed cost after Postgres — a
  JVM has real baseline heap/native memory regardless of load.
- **Persistent storage:** its own Postgres database (`KEYCLOAK_DB`) — backed
  up as part of the same `postgres` volume/backup.
- **Public exposure:** its public hostname is reached through Cloudflare
  like the API/web; its **admin** console is not separately published to
  the internet in the pilot compose file (no dedicated admin port mapping).
- **Backup required:** yes, via Postgres.
- **Pilot requirement:** hard requirement — no sign-in without it, and
  Witness Participate's own participant flows use governance modes
  (`verified_guest`, `invited_only`) that depend on it even though the
  anonymous/pseudonymous modes do not.

### api (services/api-gateway) — REQUIRED

- **Purpose:** the application — every route Witness Participate calls.
- **CPU sensitivity:** low at pilot scale (Node event loop, no heavy compute
  in the participant path).
- **Memory sensitivity:** low-moderate — a single Node process.
- **Persistent storage:** none of its own — all state lives in Postgres.
- **Public exposure:** yes, through Cloudflare — this is the one service the
  mobile app talks to directly (`docs/infrastructure/DEPLOYMENT_TOPOLOGY.md`'s
  mobile→production diagram).
- **Backup required:** no (stateless).
- **Pilot requirement:** hard requirement.

### web (apps/web) — REQUIRED

- **Purpose:** the facilitator/admin web application (the participant web
  journey too, though Witness Participate's native app is now the primary
  mobile path for that).
- **CPU/memory sensitivity:** low — a Next.js server process.
- **Persistent storage:** none.
- **Public exposure:** yes, through Cloudflare.
- **Backup required:** no.
- **Pilot requirement:** hard requirement for the facilitator experience;
  not required by Witness Participate's mobile app specifically (which talks
  to `api` only, never `web`).

### cloudflared — REQUIRED

- **Purpose:** the tunnel connector — dials out to Cloudflare so the host
  needs no public IP or open port (already the live topology, per
  `docker-compose.pilot.yml`'s `cloudflare` profile and
  `docs/operations/PILOT_OPERATIONS.md`).
- **CPU/memory sensitivity:** minimal.
- **Persistent storage:** none.
- **Public exposure:** by design, this *is* the public exposure mechanism —
  everything else stays unpublished because this exists.
- **Backup required:** no (config is one file, `cloudflared/config.yml`,
  tracked/documented, not stateful data).
- **Pilot requirement:** hard requirement under the current (Cloudflare
  tunnel) topology. The `proxy` (Caddy, `direct` profile) alternative exists
  in the same compose file for a host with a public IP and no tunnel, but is
  not the pilot's actual configuration.

### ollama — OPTIONAL

- **Purpose:** local text generation for session summaries and
  candidate-outcome extraction (Phase 4/5) — required to run in-network
  under the sovereign profile's zero-external-call rule (ADR-0009), not
  because summarisation itself is core to participant capture.
- **CPU sensitivity:** high during inference (bursty, not steady) — a real
  contention risk on a small droplet if capture traffic and a summarisation
  job land at the same time.
- **Memory sensitivity:** the largest single variable in this inventory. See
  "Sizing" below.
- **Persistent storage:** model weights (`ollama-data`) — explicitly **not**
  backed up (re-downloadable), per the volume comment in the pilot compose
  file.
- **Public exposure:** none — no `ports:`, reachable only at
  `http://ollama:11434` from `api`.
- **Backup required:** no.
- **Pilot requirement:** additive — `HealthController` reports
  `not_configured` and `api` never attempts a connection when unset (same
  pattern as Neo4j below); Witness Participate's own v1 scope does not call
  any summarisation feature. Disabling this for the initial controlled pilot
  is a real, low-risk option — see "Sizing."

### neo4j + graph-projector — OPTIONAL

- **Purpose:** the Evidence Knowledge Graph (ADR-0011, ADR-0026) — a
  read-optimised *projection* of Postgres data, not a second system of
  record.
- **CPU sensitivity:** low at rest; projection rebuilds are bursty.
- **Memory sensitivity:** the pilot compose file sets an explicit
  `mem_limit: 3g` (heap max `2G`) — a real, fixed cost if enabled.
- **Persistent storage:** yes, but **deliberately not independently backed
  up** — rebuildable from Postgres by design (ADR-0011; see the volume
  comment in the pilot compose file and
  `docs/operations/KNOWLEDGE_GRAPH_PRODUCTION_RUNBOOK.md`).
- **Public exposure:** none — no `ports:`.
- **Backup required:** no (by design — Postgres is the backed-up source of
  truth it projects from).
- **Pilot requirement:** off by default (`NEO4J_PASSWORD` unset) — bringing
  it online is "a deliberate, one-time operator action," per the pilot
  compose file's own comment, never something `scripts/pilot/deploy.sh`
  starts on its own (that script only ever recreates `api`/`web`). Witness
  Participate's v1 scope includes the read-only "what we're hearing" panel
  (`getParticipantInsights`), which depends on this being enabled at some
  point for a *full* experience, but the panel already degrades safely when
  it is not (`CaptureScreen`'s insights fetch is non-fatal on failure).

### minio (object storage) — DEVELOPMENT ONLY, not in the pilot compose at all

- **Purpose:** S3-compatible storage for evidence attachment bytes (audio,
  photo, document).
- **Verified, not assumed:** `EvidenceAttachmentService.uploadAttachment`
  (`services/api-gateway/src/evidence/evidence-attachment.service.ts`) checks
  `this.storage !== null`; when it *is* null (no `S3_ENDPOINT` configured —
  the pilot's actual current state, since `S3_ENDPOINT: ${S3_ENDPOINT:-}`
  defaults empty and the `sovereign` profile's own config validation
  actively **rejects** a configured S3 endpoint, `packages/config/src/index.ts`),
  the attachment's raw bytes are written directly into the
  `EvidenceAttachment.content` Postgres column instead
  (`resolveStoredContent`'s dual-path read confirms the same fallback on the
  read side). **Witness Participate's audio contribution therefore already
  works on the current pilot without MinIO** — it is not a blocker for the
  mobile programme.
- **CPU/memory/storage sensitivity:** N/A — not deployed in the pilot.
- **Pilot requirement:** none today. Becomes worth provisioning once evidence
  attachment volume makes storing binary content as Postgres rows an
  operational cost (backup size, table bloat) rather than a convenience —
  a clear, observable scale trigger (Postgres data volume/backup duration
  growing), not a guess.

### opensearch, valkey, nats — DEFERRED

- **Verified, not assumed:** `grep` across `services/`, `workers/`,
  `packages/` for any actual connection code finds **zero** application
  callers for any of these three. `search.service.ts` queries Postgres
  directly (`this.prisma.coDesignSession.findMany`, etc.) — it has never
  used OpenSearch. `valkey`'s own file-header comment in
  `infrastructure/docker/docker-compose.yml` already states this
  explicitly ("has no caller anywhere in the codebase today ... despite
  being a default-profile service historically"). NATS (event transport,
  ADR-0005) has the same zero-caller result.
- **Pilot requirement:** none. Not present in the pilot compose file at all.
  Re-promote any of these the day something in the codebase actually calls
  it, not before — the same standard the `valkey` comment already sets.

## Sizing

### Fixed-cost estimate (REQUIRED services only)

Rough resident-memory estimate at pilot scale (tens of users, per
`docs/release/INTERNAL_PILOT_RELEASE.md`'s own framing) — engineering
judgement from each service's runtime characteristics, not a load-tested
number, and stated as such:

| Service | Estimated RAM |
|---|---|
| postgres | ~300-500 MB |
| keycloak (JVM) | ~500-800 MB |
| api (Node) | ~150-300 MB |
| web (Node) | ~150-300 MB |
| cloudflared | ~30-50 MB |
| OS + Docker overhead | ~300-500 MB |
| **Subtotal** | **~1.4-2.5 GB** |

This subtotal fits comfortably inside a 4 GB droplet with real headroom.

### Where a 4 GB target gets genuinely tight

Adding `ollama` changes the picture materially: a pulled `qwen2.5:1.5b`
model (the pilot compose's own default pull) needs roughly 1.5-2 GB resident
during inference on top of its on-disk weight size, and inference is
CPU-bursty in a way that can contend with API request handling on a 2-vCPU
box. Fixed-cost subtotal (~1.4-2.5 GB) + Ollama (~1.5-2 GB) lands at
**~2.9-4.5 GB** — at or over a 4 GB droplet's usable RAM once the OS's own
reserve is accounted for, especially under concurrent load (a summarisation
job running while several participants are actively capturing evidence).
**This is stated honestly rather than optimistically:** a 4 GB pilot with
Ollama enabled is a real operational risk, not a comfortable fit.

Enabling `neo4j` (`mem_limit: 3g`) on top of either profile makes a 4 GB
droplet infeasible outright — that combination needs the "Recommended"
profile below, not "Minimum."

### MINIMUM PILOT PROFILE

```text
CPU:                 2 vCPU
RAM:                 4 GB
Disk:                80-160 GB SSD (mostly headroom for Postgres growth
                     and Docker images, not driven by any single service)
Persistent volumes:  postgres-data (backed up), caddy-data/caddy-config
                     (only if the `direct` profile is ever used instead of
                     the tunnel)
Expected services:   postgres, keycloak, api, web, cloudflared
Excluded services:   ollama (disabled — no NEO4J_PASSWORD/Ollama pull;
                     summarisation features simply report unconfigured,
                     the same safe-degradation pattern already proven for
                     Neo4j), neo4j, graph-projector, minio, opensearch,
                     valkey, nats
Estimated operational risk: LOW, provided ollama/neo4j stay disabled. The
                     moment either is enabled on this profile, risk becomes
                     MODERATE-HIGH (see above) — re-evaluate the droplet
                     size before enabling, not after.
```

### RECOMMENDED PILOT PROFILE

```text
CPU:                 4 vCPU
RAM:                 8 GB
Disk:                160 GB SSD
Persistent volumes:  postgres-data (backed up), ollama-data (not backed up),
                     neo4j-data (not backed up, rebuildable) if enabled
Expected services:   postgres, keycloak, api, web, cloudflared, ollama
                     (summarisation restored), optionally neo4j +
                     graph-projector once the operator deliberately enables
                     the knowledge graph
Excluded services:   minio, opensearch, valkey, nats (still no application
                     caller — see "Deferred" above; adding them here would
                     be provisioning for a feature that does not exist yet)
Estimated operational risk: LOW — matches the fixed-cost-plus-Ollama
                     estimate with real headroom, and gives Neo4j's 3 GB
                     `mem_limit` room to coexist with the base services
                     without contention.
```

**No infrastructure is provisioned by this document.** This is a sizing
estimate for a human decision, not an action — see the governing
instruction's explicit "Do not automatically provision it."

**HUMAN ACTION REQUIRED:** the current pilot droplet's actual size is not
recorded anywhere in this repository (no Terraform state, no sizing note in
`docs/operations/PILOT_OPERATIONS.md`) — confirm it against whichever of the
two profiles above it actually matches, from the DigitalOcean control panel
or account records this repository has no access to.
