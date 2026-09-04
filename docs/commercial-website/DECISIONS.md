# Witness Commercial Website Decisions

**Owner:** Product, Commercial and Engineering
**Status:** Active decision log
**Last reviewed:** 2026-09-04

## Decision states

- `ACCEPTED`: binding for this programme unless superseded.
- `PROPOSED`: implementation direction requiring evidence or review.
- `HUMAN APPROVAL REQUIRED`: no production/publication action may proceed automatically.

## Accepted

### CW-001 — Separate responsibility and deployment boundaries

The commercial site will have an independent build/deployment boundary from `apps/web`. Shared brand
and UI packages may emerge incrementally, but public pages must not mount product authentication,
session or application navigation by default.

Reason: the apex and app currently serve byte-identical product output. Responsibility separation is
the smallest reliable way to preserve app behaviour while creating indexable public content.

### CW-002 — Preserve current product and Cloudflare architecture

Keep Next.js for the product, Cloudflare at the edge, Cloudflare Tunnel ingress, private PostgreSQL,
Keycloak OIDC, API origin restrictions, sovereign deployment support and the main deployment workflow.
The marketing boundary may extend this architecture but does not replace it without a separate ADR.

### CW-003 — Keep `id.buildwithwitness.com` as current identity truth

The repository and live system use `id.buildwithwitness.com`. The programme's illustrative `auth.`
hostname is not an instruction to rename a functioning identity service.

### CW-004 — Repository-controlled initial content

Use repository-reviewed content initially. Do not introduce a CMS until publishing operations provide
a demonstrated requirement that outweighs dependency, security and governance cost.

### CW-005 — No public claim without evidence

Classify trust, deployment, pricing and customer statements as existing capability, supported
configuration, planned, or aspirational. Internal documents and configured variables alone are not
proof of deployed or commercially supported capability.

### CW-006 — Privacy-respecting analytics boundary

Public analytics must be first-party/minimal, must never include evidence or decision content, and
must not compromise the sovereign profile's zero-egress guarantee. Analytics Engine or another edge
store may support measurement but must not be assumed to be the permanent commercial system of
record.

### CW-007 — Commercial language hierarchy

Preserve “Make important decisions traceable”, “Connect evidence, consultation, decisions and
actions”, “Provenance by design”, and institutional memory positioning until an explicit content
decision records evidence and approval for change.

### CW-008 — Scaffold `apps/marketing` using the existing web toolchain

Use a separate Next.js application with static/server-rendered public content and minimal client
JavaScript. This minimises new dependencies and operational variance while preserving a hard app
boundary. MKT-01A validated this decision with an independent lint, typecheck, test and production
build. `apps/marketing` has no dependency on product or other Witness workspace packages.

### CW-009 — Fail closed on preview indexing

Marketing builds default to `noindex` and a disallowing robots policy. Indexing requires all three
conditions: `WITNESS_MARKETING_INDEXABLE=true`, `WITNESS_MARKETING_ENV=production`, and a deployment
URL whose origin exactly matches `https://buildwithwitness.com`. The deployment URL remains supplied
through `WITNESS_MARKETING_SITE_URL` with local fallback `http://localhost:3002`; it is never used as
the canonical public origin.

### CW-010 — Defer Cloudflare deployment selection

Use Next.js standalone output for portability, but do not add a marketing Docker image, Cloudflare
Pages/Workers project, route or workflow in MKT-01A. The repository has no existing isolated preview
pattern or credentials contract. Select and prove preview deployment in MKT-01D without coupling the
application boundary to live product ingress.

### CW-011 — Server-render the shell and use native mobile disclosure

Header, footer and navigation configuration remain server components. Mobile navigation uses native
`details` and `summary`, which supplies keyboard-operable disclosure semantics without adding a client
bundle, dialog focus trap or component dependency. It is a disclosure, not a modal; background
interaction is intentionally available.

### CW-012 — Do not link unfinished routes

Navigation configuration records future destinations with a null URL. Those labels render as
non-interactive planned text until reviewed pages exist. This preserves route-ready information
architecture without publishing broken links or placeholder claims.

### CW-013 — Temporary utility destinations

Sign in defaults to `https://app.buildwithwitness.com/signin` and can be overridden by
`WITNESS_MARKETING_APP_URL`. Book a demo defaults to a pre-addressed email to the verified `hello@`
role and can be overridden by `WITNESS_MARKETING_DEMO_URL`. MKT-07 will replace the latter with the
real validated conversion flow.

### CW-014 — Central canonical and metadata contract

Marketing metadata, canonical URLs, robots and sitemap output are generated from the central marketing
site configuration. Canonical URLs always use `https://buildwithwitness.com`, including on previews,
so preview hosts cannot become canonical production identities. The sitemap lists only implemented
public content routes.

### CW-015 — Claim-safe structured data

The initial JSON-LD foundation emits only an `Organization` name and canonical URL. SoftwareApplication,
pricing, ratings, customer, certification and other claims require verified content before publication.

### CW-016 — Standalone container for marketing deployment

Use the existing Next.js standalone Node boundary, packaged by `apps/marketing/Dockerfile`, as the
initial marketing deployment model. It is independent of the product container and can be fronted by
Cloudflare without introducing a Pages/Workers adapter or persistent data service. Preview
provisioning, hostname selection and credentials remain outside the repository until approved.

### CW-017 — Deterministic per-application bundle checks

The bundle budget accepts explicit application directories and checks `apps/web` and `apps/marketing`
separately. It must never select the first `.next` directory found in a shared workspace.

### CW-018 — Conservative marketing security headers

The marketing Next.js boundary sets `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` and
`Permissions-Policy`. Content Security Policy is deferred until the final public asset/runtime
inventory is known.

### CW-019 — Human-approved logo is canonical marketing artwork

Use `apps/marketing/public/brand/witness-logo.png` as the canonical public logo. The marketing
component preserves the supplied PNG's intrinsic proportions and applies no filters, recolouring or
cropping. Alternate variants and clear-space rules require separate approval.

### CW-020 — Authoritative light palette and system-first editorial typography

Use a warm paper, deep ink, institutional ocean green and restrained ochre as the marketing palette,
implemented through semantic local CSS tokens. Use platform sans typography for reading and controls,
with the platform editorial serif stack for display headings. Do not load external fonts. Automatic
OS dark-mode overrides are disabled until an intentional palette and approved logo treatment exist.

### CW-021 — Local server-rendered marketing primitives

Keep the first commercial component system inside `apps/marketing`. Use native elements and typed
React wrappers for actions, cards, headings, sections, callouts, badges, stats and CTA groups. The
three-level action hierarchy and all interaction states are CSS-only; no client component or UI
dependency is justified. Extract shared workspace UI only after another application has a proven
consumer.

### CW-022 — Provenance diagrams use semantic HTML and CSS

Express source-to-outcome and many-source-to-evidence relationships with labelled native structures,
CSS borders and lightweight connectors. Shape, border treatment, kind labels and text carry meaning
alongside colour. Do not add a graph package, client component or animation for the core visual
language.

### CW-023 — Repository-owned marketing browser verification

Keep MKT-02E verification repeatable with a small marketing-scoped Node script using the existing
`playwright-core` dependency and an installed Chrome/Chromium executable. It starts only the
marketing dev server, covers six representative viewports plus a noindex provenance fixture, verifies
keyboard behaviour and writes failure diagnostics outside the repository. It does not add browser
tooling to the production runtime or depend on an external Computer Use connector.

### CW-027 — Approved opening narrative remains institutional and factual

The homepage hero retains “Make important decisions traceable” and the approved supporting
proposition. The problem narrative describes evidence fragmentation and knowledge loss without fear,
unsupported outcomes or customer examples. How Witness Works is expressed with Capture, Connect,
Govern, Trace and Remember and the existing provenance visual language.

### CW-028 — Canonical host and cutover preparation

`https://buildwithwitness.com` is the sole canonical public domain. `www.buildwithwitness.com` will
permanently redirect to the equivalent apex path and query. `app.buildwithwitness.com` remains the
canonical authenticated application host; `api.` and `id.` remain separate. MKT-03G prepares but does
not execute Cloudflare, Tunnel, Keycloak, cookie, CORS/CSRF, DNS, environment or indexing changes.

The repository milestone may be `VERIFIED COMPLETE` while the production dry run is not ready: that
status means the implementation, evidence gaps, runbook and rollback plan are complete. It never
authorises cutover. Initial apex deployment keeps `WITNESS_MARKETING_INDEXABLE=false`; indexing is a
separate human-approved action.

### CW-029 — Credentialed CORS belongs to the host-only API cookie design

Production's `Access-Control-Allow-Credentials: true` is expected. Build `6afc203…` follows the
`origin/main` server-managed browser-session design: `witness_session` is HttpOnly, Secure in deployed
profiles, SameSite=Lax, Path `/`, expires with the server session and has no Domain attribute. Only
the app origin is admitted, and unsafe cookie-authenticated requests require the exact app Origin.
Do not revert the CORS flag independently or add the marketing apex.

### CW-030 — Preview remains a standalone container behind Tunnel

Retain the standalone Next.js Node image for `preview.buildwithwitness.com`. Provision a separate
preview hostname/Tunnel mapping to that container, keep indexing off and preserve apex canonical
metadata. Do not adopt Pages merely to avoid the existing Docker/Cloudflare architecture.

### CW-031 — Align commercial work by clean cherry-pick, not stale merge

Create `feat/commercial-site-launch-readiness` from current `origin/main` and apply only the scoped
commercial changes. Exclude unrelated local auth-page edits and never merge the old bearer-session
implementation over the server-managed cookie design. RC images are built from a clean source commit
and named with that commit rather than `latest`.

### CW-032 — Local image ID is RC1 identity until registry publication

RC1 is `witness-marketing:efba8b7` with local content-addressable image ID
`sha256:3a4d8696d7b4f72f9ecb666db358bb3c17ffd1f0f39e84348754a48d48253190`.
A registry digest cannot exist until an approved registry push occurs. Preview deployment must use
this image or rebuild the same clean commit and record its immutable registry digest.

### CW-033 — External verification never substitutes for privileged baseline evidence

Public DNS, TLS, headers and OIDC discovery may close their specific gates, but they do not establish
Cloudflare record/Tunnel IDs, server image IDs, effective Keycloak client values or authenticated
flows. MKT-03J remains `NO-GO` until an authorised operator records those values and uses only an
approved synthetic account and mailbox.

## Proposed

### CW-024 — Canonical public/app route contract

Target apex for marketing and `app.` for product. Keep `api.` and `id.` unchanged. Add `www` redirect
only during an approved production routing unit. Treat docs, trust and status subdomains as reserved,
not live capabilities.

## Human approval required

### CW-025 — Production cutover

Changing apex/app DNS, Worker routes, tunnel ingress or production environment values requires a
reviewed cutover/rollback plan, preview verification and explicit human approval.

### CW-026 — Public regulated claims and customer evidence

Legal text, certification/compliance statements, contracting identity, pricing changes, customer
names/logos and confidential case studies require their designated human approval before publication.
