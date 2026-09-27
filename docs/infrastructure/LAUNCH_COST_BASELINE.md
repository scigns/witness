# Launch cost baseline

**Owner:** Infrastructure Lead & Commercial Lead
**Status:** Active — cost-category mapping, not a pricing decision

Cost categories for taking Witness to its first paying institutional
customers — mapped, not priced, except where a figure is already documented
and verified elsewhere in this repository. The principle:

> Infrastructure should eventually be funded by customer revenue rather than
> silently absorbed by the founder.

This document exists so that principle has somewhere concrete to point at,
not to produce an invoice. No infrastructure is purchased or provisioned by
this document.

## Cost categories

| Category | Required now? | Variable/fixed? | Customer attributable? | Shared platform cost? | Scale trigger |
|---|---|---|---|---|---|
| Cloudflare (DNS, TLS, WAF, tunnel) | Yes | Mostly fixed (free/Pro-tier features cover current use; no paid Workers usage yet) | No — one edge in front of shared/dedicated deployments alike | Yes, today | A dedicated-cloud customer requiring its own zone/WAF policy set |
| DigitalOcean compute (pilot droplet) | Yes | Fixed per droplet size — **$24/month for a 2 vCPU/4 GiB Basic Droplet**, DigitalOcean's own published pricing, verified live and already recorded in `docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md`. The Recommended profile's 4 vCPU/8 GB figure is **not verified here** — check DigitalOcean's current pricing page before quoting it | Shared cloud: no (amortised across pilot tenants). Dedicated cloud: yes — see `docs/commercial/DEPLOYMENT_OPTIONS.md`'s infrastructure-fee model | Shared, for the pilot; per-customer once a Dedicated Cloud customer exists | A second concurrent institutional pilot outgrowing one shared droplet, or any Dedicated Cloud sale |
| DigitalOcean storage/backups | Yes (Postgres backups already run — `scripts/pilot/backup.sh`) | Variable — grows with evidence/consent-record volume over time | Same split as compute | Shared today | Backup duration or storage cost growing enough to justify a dedicated volume/managed database |
| Domain (`buildwithwitness.com` and subdomains) | Yes | Fixed, annual | No — one brand domain for the whole platform | Yes | N/A — a second brand/white-label domain for a specific customer |
| Email (Brevo SMTP relay) | Yes (Keycloak recovery, invitation notifications — `docs/operations/EMAIL_OPERATIONS.md`) | Likely has a free tier at current pilot volume; **not verified here** — check Brevo's current pricing before quoting a figure | No | Yes | Outbound volume crossing whatever the current plan's included-send threshold is |
| Mobile developer accounts (Apple Developer Program, Google Play Console) | **Not yet incurred** — genuinely blocked (`docs/mobile/MOBILE_RELEASE_GATES.md` M7) | Fixed, annual (Apple) / one-time (Google) — Apple's and Google's own published developer-account fees; not restated here since neither account exists yet to verify against | No — one set of store accounts for the platform, not per customer | Yes | N/A |
| Optional external AI (if Ollama is disabled per `PRODUCTION_SERVICE_INVENTORY.md`'s minimum profile, and summarisation is later restored via an external provider instead of a larger droplet) | Not required now — Ollama runs in-network under the sovereign profile, or is disabled entirely for the minimum pilot profile | Would be variable (per-token/per-request) if ever adopted | Depends on whether summarisation is offered per-tenant or platform-wide | Undecided — no external AI provider is in use today (ADR-0009 forbids it under the `sovereign` profile in the first place) | A customer explicitly requesting the `hybrid` profile with faster/larger-model summarisation than a droplet-hosted Ollama can provide |
| Monitoring/observability | Partially — `infrastructure/docker/docker-compose.observability.yml` (Prometheus/Grafana/Tempo/Loki) exists for local use; not confirmed running on the pilot host in this document | Would be fixed (self-hosted) or variable (managed) depending on choice | No | Yes | The pilot host growing past what `docker logs`/manual `pilot-status` checks can reasonably cover |
| Backup storage (off-host) | Partially — `scripts/pilot/backup.sh` backs up to `~/witness-backups` by default (on the operator's own machine, per its Makefile target's doc comment), not yet off-host object storage | Would be variable if moved to off-host storage | No | Yes | Any real disaster-recovery requirement beyond "the operator's laptop has a copy" |
| GitHub Actions minutes | Yes, now — CI already runs on every PR/push, and this programme adds `mobile-android.yml` | Variable — Android/Gradle compilation is a materially heavier job than the existing Node-only CI jobs; `docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md` already documents GitHub's free-tier included minutes and the $0.18/core-hour rate beyond them | No | Yes | Actions usage dashboard crossing included minutes — monitor, per that same document's own guidance, rather than assume |

## What this document deliberately does not do

- **No invented dollar figures** for anything not already documented and
  verified elsewhere in this repository (Cloudflare paid tiers, a larger
  DigitalOcean droplet, Apple/Google developer fees, Brevo's current
  pricing tier). Each such row says so explicitly rather than guessing a
  plausible-sounding number.
- **No pricing decision.** This maps categories and their scale triggers for
  a human to price and allocate — it does not set the actual subscription or
  infrastructure-fee amounts in `docs/commercial/DEPLOYMENT_OPTIONS.md`.

## Where cost allocation is decided

`docs/commercial/DEPLOYMENT_OPTIONS.md`'s three deployment options (Hosted/
cloud-managed, Dedicated cloud, Sovereign/on-premises) already carry the
commercial-component boundary this baseline feeds — that document's own
`Commercial components` column is where infrastructure cost gets attached to
a specific offer, not here.
