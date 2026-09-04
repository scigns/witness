# Witness Commercial Website Programme

**Owner:** Product, Commercial and Engineering
**Status:** MKT-03H gate-closure preparation verified; production cutover not executed
**Last reviewed:** 2026-09-04

This directory is the persistent programme memory for turning
`https://buildwithwitness.com` into Witness's public commercial entrance while preserving the
authenticated product and its production controls.

The commercial promise is:

> Make important decisions traceable.

Witness connects evidence, consultation, decisions and actions into an accountable institutional
record. The broader positioning remains **institutional memory with provenance by design**.

## Source-of-truth hierarchy

- The repository and verified production observations describe current implementation.
- This directory describes commercial-website programme state and direction.
- [`VISION.md`](../../VISION.md) remains the canonical product definition.
- Accepted architecture decisions remain authoritative for product and deployment constraints.
- [`docs/commercial/`](../commercial/README.md) remains the commercial operating pack. It does not
  prove that a public website capability exists.

When these sources conflict, record the conflict in [`DECISIONS.md`](DECISIONS.md); do not silently
reinterpret product or production architecture.

## Required start-of-task routine

For every future commercial-website task:

1. Read every file in this directory.
2. Inspect the current branch, working tree and `origin/main`.
3. Inspect related open and recently merged pull requests.
4. Re-check the relevant routes, configuration and acceptance criteria.
5. Select the smallest safe incomplete roadmap unit.
6. State goal, affected files, risks, tests and deployment impact before implementation.
7. Update programme memory after meaningful work.

Code, a route, a pull request or a successful deployment does not equal completion. Use these
states: `NOT STARTED`, `DESIGN / PLANNING`, `IMPLEMENTATION`, `TESTING`, `DEPLOYED`, and
`VERIFIED COMPLETE`.

## MKT-00 audit snapshot

Audit basis: repository `origin/main` at `a361a4f`, production observations at 2026-09-02 23:10
AWST, GitHub pull-request state at 2026-09-02, and local branch
`release/manual-settlement-paid-activation` at `91fcab2`.

The local branch was behind `origin/main` during the audit and contained unrelated uncommitted
changes in authentication pages. Those files were preserved. No production state was changed.

### Current serving and route ownership

- `buildwithwitness.com` and `app.buildwithwitness.com` resolve through Cloudflare and return
  byte-identical Next.js output for `/` and `/pricing`.
- Both hosts currently serve `apps/web`, the authenticated product application.
- `/` is `apps/web/src/app/page.tsx`. It checks browser authentication after hydration and renders
  either a concise sign-in landing state or the signed-in dashboard.
- The root layout mounts the product `Shell`, `AuthProvider`, `SessionProvider` and service worker on
  every route. Public browsing therefore shares the product bundle, navigation and auth lifecycle.
- All current pages deliberately emit `noindex, nofollow`. No sitemap or robots route exists.
- `www.buildwithwitness.com` did not resolve. Neither did `auth.`, `docs.`, `trust.` or `status.`.
- `api.buildwithwitness.com` and `id.buildwithwitness.com` are live. The implemented identity name is
  `id.`, not the strategic diagram's tentative `auth.` name.

### Cloudflare and deployment

- Cloudflare terminates public TLS and proxies the apex, app, API and identity surfaces.
- The production product is a Docker Compose deployment reached through Cloudflare Tunnel; the
  database has no public ingress.
- Deployment runs after successful `main` CI on a self-hosted `witness-pilot` runner and invokes
  `scripts/pilot/deploy.sh`.
- Historical configuration also contains a path-scoped Worker for
  `pacificdigitalconsultancy.org/witness*`. It forwards to a tunnel-backed web hostname and does not
  host the independent commercial site.
- The independent-domain cutover runbook targets apex/app/API/id separation and coexistence. Live
  observations show part of that target is now deployed, while the checked-in historical tunnel
  template still describes the former hostnames. Deployment scripts reconcile effective production
  configuration; templates must not be treated as proof of live DNS.
- No Cloudflare Pages project, marketing Worker or independent marketing deployment boundary exists
  in the repository.

### Public and authenticated boundary

- Publicly reachable routes include `/`, `/pricing`, `/signin`, `/activate` and authentication
  callbacks, but they live inside the authenticated product application.
- Many product pages render client-side and rely on API authorization. Navigation exposes product
  destinations to anonymous users, then the API/session boundary limits data and actions.
- The API uses Keycloak OIDC and server-managed browser sessions on current `main`; current auth work
  must not be regressed during public-site separation.
- Production CORS is restricted to `https://app.buildwithwitness.com` in observed responses.

### Design system and reusable assets

- `apps/web/src/app/globals.css` provides accessible light/dark colour tokens, focus-visible styles
  and reduced-motion handling.
- `apps/web/src/components/ui.tsx` contains application primitives and status semantics.
- `apps/web/src/components/shell.tsx` contains product-specific navigation and session controls.
- `packages/ui` is documentation-only; no shared implemented component library exists.
- Reuse semantic language, accessibility patterns and carefully selected primitives. Do not export
  the authenticated shell wholesale into marketing.
- There is no established marketing typography, layout, logo system or provenance diagram library.

### Existing public content, pricing and conversion

- The anonymous `/` copy partially explains evidence, consent, provenance and accountable action,
  but it does not satisfy the homepage sequence or institutional conversion requirements.
- `/pricing` is a real public route backed by `GET /api/v1/plans`. It presents AUD catalogue plans,
  including existing price values. It is coupled to the live API and routes CTAs into controlled
  account creation/sign-in. Commercial claims require reconciliation before reuse.
- There are no marketing platform, solution, trust, demo, resource, customer, contact or legal
  routes.
- There are no public contact/demo/newsletter forms or public form endpoints.
- Organisation invitations and Keycloak account communications use the approved Brevo SMTP relay.
  This is transactional infrastructure, not a marketing-consent or lead-management integration.
- Cloudflare Email Routing role aliases exist with documented operational ownership.

### Analytics, SEO and abuse controls

- No public web analytics or commercial event instrumentation exists.
- The sovereign profile explicitly prohibits analytics egress; any public analytics design must
  retain that deployment property.
- SEO is intentionally disabled for the product. There are no canonical tags, sitemap, public
  robots policy, Open Graph system, structured data or content index.
- Turnstile is absent.
- `RATE_LIMIT_PER_MINUTE` is configured but repository documentation confirms API rate limiting is
  not enforced. No public form WAF/rate-limit policy is represented in code.
- Cloudflare's edge protections are present at the platform level, but repository evidence does not
  prove marketing-specific WAF or rate-limiting rules. Do not claim them.

### Testing and governance

- Pull requests run documentation, governance, formatting, lint, typecheck, tests, invariants,
  adversarial checks, production build and a 200 KB per-route gzip JavaScript budget.
- Separate workflows run secret scanning, licence checks, zero-egress checks, workflow pinning and
  CodeQL. Dependency review is conditional on GitHub dependency-graph availability.
- There is no browser end-to-end suite for marketing routes, link crawler, automated accessibility
  route audit, visual regression suite, preview-deployment smoke test or SEO assertion suite.
- GitHub reported no open pull requests during this audit. Recently merged authentication work on
  `main` materially changes session handling and controlled invitations and must be included before
  implementation begins.

### What must not be broken

- App/API/identity availability and Cloudflare Tunnel ingress.
- OIDC login, callback, recovery, logout, controlled invitation and cross-tab session behaviour.
- API CORS/CSRF assumptions and the separation of public landing URL from app origin.
- Tenant isolation, RBAC, consent, audit and provenance invariants.
- Existing paid catalogue and controlled-pilot commercial truth.
- Private database topology, backup/recovery controls, sovereign deployment and zero-egress checks.
- Existing role-email routing and transactional SMTP.
- Main-branch CI, security gates, self-hosted deployment and rollback path.

## MKT-00 conclusion

MKT-00 is `VERIFIED COMPLETE` as a repository and externally observed audit. No production changes
were made. MKT-01 is now in `IMPLEMENTATION`; its A, B and C units are verified and deployment remains
gated to MKT-01D.

## MKT-01A implementation record

MKT-01A established `apps/marketing` as a separate Next.js package. It has its own route tree,
configuration, scripts, tests and standalone build output. It uses only Next.js and React runtime
dependencies and does not depend on Witness workspace packages, protected APIs, authentication,
session state, roles or organisation context.

Commands:

- Development: `pnpm --filter @witness/marketing dev`
- Lint: `pnpm --filter @witness/marketing lint`
- Typecheck: `pnpm --filter @witness/marketing typecheck`
- Test: `pnpm --filter @witness/marketing test`
- Production build: `pnpm --filter @witness/marketing build`

The temporary `/` page is statically generated; `/health` provides an isolated runtime probe. Basic
title, description, canonical-origin, robots and sitemap mechanisms exist because they define safe
preview behaviour, but full metadata/SEO work remains MKT-01C. Indexing fails closed unless
`WITNESS_MARKETING_INDEXABLE=true` is set explicitly.

No Dockerfile, Cloudflare route, Pages/Workers project, deployment workflow, DNS entry or production
environment was added. Standalone output preserves deployment portability while deferring the actual
preview choice to MKT-01D. The authenticated application remains entirely unchanged by MKT-01A.

## MKT-01B implementation record

The root layout now mounts a reusable `MarketingShell` with a skip link, public header, one main
landmark, responsive page container and institutional footer. Navigation is defined once as typed
data. Future route labels render as explicitly unavailable text until their pages exist; the shell
does not publish links that produce known 404 responses.

The header uses a semantic text wordmark. Desktop navigation and actions switch to a native
`details`/`summary` mobile disclosure below 62rem. This keeps the entire shell server-rendered with
no client component or menu JavaScript. The footer provides the planned Platform, Solutions, Resources,
Trust, Company and Legal group structure while linking only verified destinations.

Sign in is generated from `WITNESS_MARKETING_APP_URL`, defaulting to the verified
`https://app.buildwithwitness.com/signin` entry. Until MKT-07 implements a protected request flow,
Book a demo uses `WITNESS_MARKETING_DEMO_URL`, defaulting to a pre-addressed request to the established
`hello@buildwithwitness.com` role. This is explicitly an email action, not a pretend form workflow.

The temporary CSS establishes responsive width, spacing, focus and reduced-motion behaviour only.
MKT-02 may replace its visual tokens without changing shell structure. The independent build remains
static at `/` and reports 102 KB initial JavaScript, unchanged from MKT-01A.

## MKT-01C implementation record

MKT-01C establishes one canonical public origin, `https://buildwithwitness.com`, while retaining a
separate environment-configurable deployment URL for local and preview builds. Marketing metadata is
generated through `createMarketingMetadata`, supplying absolute canonical, Open Graph and social-card
values without exposing deployment or internal service URLs.

Indexing fails closed. It is enabled only when `WITNESS_MARKETING_INDEXABLE=true`,
`WITNESS_MARKETING_ENV=production`, and the configured deployment URL has the exact canonical origin.
Otherwise robots disallow crawling and metadata emits `noindex, nofollow`. The sitemap contains only
the implemented public home route and excludes `/health` and future placeholders.

The initial structured-data foundation emits only a claim-safe `Organization` object containing the
Witness name and canonical URL. No production DNS, Cloudflare route, authentication setting or
indexing cutover was changed. MKT-01D must prove isolated preview deployment and operational
noindex/rollback controls before any production exposure.

## MKT-01D implementation record

Repository deployment hardening selects the existing Next.js standalone Node boundary as the least
complex compatible origin model. `apps/marketing/Dockerfile` packages only the marketing server and
static assets and exposes a minimal `/health` probe. The bundle-budget check now accepts explicit app
directories and checks `apps/web` and `apps/marketing` deterministically.

The marketing Next.js boundary adds conservative security headers and reserves
`apps/marketing/public/brand/` for the human-approved logo without inventing artwork. Deployment, caching,
environment, smoke-test, rollback and production cutover requirements are recorded in
[`DEPLOYMENT.md`](DEPLOYMENT.md). No Cloudflare project, hostname, credential, DNS record, route,
tunnel, authentication setting or production indexability was changed; isolated preview provisioning
remains a human-gated action.

## MKT-02A implementation record

The supplied Witness PNG is canonicalised at `apps/marketing/public/brand/witness-logo.png` and is
used by the reusable `WitnessLogo` component in the public header and footer. The artwork is RGB,
opaque, 566 × 553 pixels and 6,230 bytes; no filters, recolouring, cropping or proportion changes are
applied. The expected `apps/web/public/Witness Logo_.png` source path was absent in this checkout, so
no authenticated-app asset was removed or changed. The existing product PWA icons remain untouched
and require future identity review.

## MKT-02B implementation record

The marketing shell now uses a documented semantic colour system built around deep ink, warm paper,
white logo-safe surfaces, institutional ocean green and restrained ochre. Core text, action, link and
focus combinations meet WCAG AA or better and are protected by focused contrast tests.

Typography uses only local system stacks: an editorial serif for restrained display headings and a
highly readable sans stack for body text, navigation, labels and controls. A four-pixel spacing rhythm,
reading measure and wide-container tokens centralise layout decisions. The provisional automatic dark
mode was removed; Witness now has one authoritative light presentation compatible with the approved
opaque-white logo. No infrastructure, indexing or production configuration changed.

## MKT-02C implementation record

The marketing application now provides local reusable primitives for actions, cards, labels, section
headings, containers, sections, callouts, badges, feature cards, stats and CTA groups. Primary,
secondary and tertiary actions have visible hover, focus, active and disabled states, with minimum
target sizing and narrow-screen grouping. Links remain identifiable through structure or underlining.

The public header now consumes `LinkButton`, proving the component contract in the existing shell.
All primitives render on the server and add no client JavaScript or third-party UI package. Focused
static-render tests verify semantic output and variants. No forms, homepage content, infrastructure,
indexing or production configuration changed.

## MKT-02D implementation record

Witness now has a reusable provenance grammar for typed nodes, connectors, linear chains, branching
sources and evidence-relationship diagrams. The system encodes meaning through labels, border style,
shape and restrained colour, includes accessible diagram and connector descriptions, and changes from
horizontal to ordered vertical reading at narrow widths.

The implementation is semantic HTML and CSS only. It introduces no graph library, SVG payload,
animation, client boundary or product connection. Focused rendering tests cover both linear and
branching relationships. No infrastructure, indexing or production configuration changed.

## MKT-02E implementation record

MKT-02E is verified through a repository-owned Playwright Core smoke suite using the installed Chrome
binary. `pnpm --filter @witness/marketing test:e2e` starts only the marketing dev server, checks `/`
at 320, 375, 430, 768, 1024 and 1440 pixels, and verifies landmarks, one H1, logo geometry,
navigation, CTA visibility, footer, page-level overflow and the keyboard path. An unlinked noindex
`/brand-fixture` route exercises linear and branching provenance at every width; visual scrolling is
contained within the diagram. No external browser connector, production service, indexing or
infrastructure is required.

## MKT-03A implementation record

The temporary foundation page has been replaced with a semantic homepage architecture: hero, problem,
how Witness works, product preview, solutions, provenance, trust, open infrastructure and final CTA.
Each section has a stable ID and heading, the approved proposition is visible, and the initial process
relationship uses the provenance system. Later MKT-03 units will fill these sections with the approved
product preview, audience, trust and conversion detail. No production data, API calls, infrastructure,
indexing or routing changes were introduced.

## MKT-03B implementation record

The homepage opening now uses the approved headline and proposition, a concise institutional problem
narrative, and the full How Witness Works explanation. It describes evidence fragmentation across
meetings, documents, surveys, interviews, workshops, research, consultation and institutional memory,
then explains Witness through Capture, Connect, Govern, Trace and Remember. The source-to-action
provenance flow is rendered with the MKT-02D components. No product/customer data, API calls,
infrastructure or indexability changes were introduced.

## MKT-03C implementation record

The product-preview section now presents a static, clearly illustrative Witness view using synthetic
data only: Institutional Transformation Programme, five metrics, Decision #08, Approved status,
four supporting records and Action #21. Existing Card, Stat, Badge and provenance components show the
relationship from evidence through finding, recommendation and decision to action. The preview has no
API dependency, customer implication, client runtime or production-data path.

## MKT-03D implementation record

The solutions section contains six restrained, non-clickable audience cards for Government,
International Development, Research, Consultation & Co-design, Organisations and Regulated
Environments. Copy is outcome-oriented and contains no customer, credential or unfinished-route claims.

## MKT-03E implementation record

The homepage includes the approved provenance story, four trust pillars, open-infrastructure
explanation, verified source-repository link, and “Born in the Pacific. Built for institutions
everywhere.” supporting line. No certifications, customer claims or unsupported hosting promises were
added.

## MKT-03F implementation record

The final CTA includes Book a demonstration, Explore Witness and Talk to Witness using safe existing
destinations. The complete homepage passes repository-owned Chrome checks at six widths, keyboard and
accessibility checks; SEO remains noindex and the bundle remains within budget. No MKT-07 form or
production indexing was introduced.

The verified production build records `/` as static at 102 KB initial JavaScript, with the framework
not-found route the largest reported route at 103 KB. The independent gzip budget check reports a
conservative 106 KB worst route against the unchanged 200 KB limit. `/health` is the only dynamic
route. The approved logo remains 566 × 553 pixels and 6,230 bytes.

## MKT-03G implementation record

Domain readiness is documented in [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) and
[`DEPLOYMENT.md`](DEPLOYMENT.md). The canonical public domain is `https://buildwithwitness.com`;
`www.buildwithwitness.com` will permanently redirect to the apex while `app.buildwithwitness.com`
remains the canonical authenticated application host. The runbook records current repository-observed
topology, target topology, path/query-preserving Cloudflare redirect steps, Keycloak/API/CORS/CSRF/
cookie checks, preview requirements, rollback triggers, observation window and a dry-run classification.
Production DNS, routing, identity, cookies, indexing and environment values remain unchanged.
The 2026-09-04 dry run additionally confirmed the apex and app still serve byte-identical product
HTML, API health allows the app origin, identity responds, and `www` remains unprovisioned. Effective
Cloudflare rules, Keycloak settings, authenticated flows and cookie scope remain human verification
gates; production changes were `NONE`.

## MKT-03H implementation record

MKT-03H reconciled the apparent CORS drift to branch age: live production build `6afc203…` matches
`origin/main`'s intentional host-only API cookie, credentialed app-only CORS and exact-Origin CSRF
design. This branch predates that atomic security change and must be rebased/merged through normal
review; changing only the CORS flag would be unsafe.

The app-host audit found no current production-source dependency that returns authenticated users to
the marketing apex. Callback/error/invitation destinations derive from the app base URL; API calls use
the dedicated API origin. Exact Keycloak, cookie, preview, `www`, Cloudflare worksheet and rollback
requirements are now in [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md), with restoration identifiers in
[`CURRENT_PRODUCTION_BASELINE.md`](CURRENT_PRODUCTION_BASELINE.md).

A production/noindex standalone build passed local health and public-route smoke checks. Docker image
creation was blocked by the unavailable local Docker daemon, so the recorded tarball is verification
evidence rather than a deployable release. Remote preview and authenticated production browser checks
remain human gates. Repository readiness is 90%; production cutover readiness is 30%. Production
apex changes: `NONE`; cutover status: `NOT EXECUTED`.
