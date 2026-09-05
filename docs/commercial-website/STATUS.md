# Witness Commercial Website Status

**Owner:** Product, Commercial and Engineering
**Status:** Active programme

Last updated: 2026-09-04

## Current phase

 MKT-03I Mainline Alignment, Preview Deployment & Release Candidate — `VERIFIED COMPLETE`

## Programme health

AMBER

The product is live behind Cloudflare and has strong delivery/security governance, but the apex and
application hosts currently serve the same authenticated Next.js application. Public commercial
separation, indexability, conversion and trust surfaces do not yet exist.

## Completed

- MKT-00 repository, route, deployment, Cloudflare, authentication, design, content, commercial,
  analytics, SEO, forms, abuse-control, test and CI audit — `VERIFIED COMPLETE`.
- Canonical programme memory established under `docs/commercial-website/`.
- Live DNS/HTTP observations verified for apex, app, API, identity and reserved hostnames.
- GitHub state checked: no open PRs at audit time; recent merged auth/production work identified.
- MKT-01A independent `apps/marketing` application boundary — `VERIFIED COMPLETE`.
- Marketing lint, typecheck, focused tests and independent production build verified.
- Static `/` output, isolated `/health`, default noindex and 102 KB initial JavaScript baseline
  verified without product/auth/API dependencies.
- MKT-01B reusable public shell, structured navigation, responsive header, native mobile disclosure,
  footer and layout primitives — `VERIFIED COMPLETE`.
- Shell accessibility structure, valid-link policy and temporary Sign in/Book a demo destinations
  covered by focused tests.
- MKT-01C canonical-origin configuration, reusable metadata, robots, sitemap and safe Organization
  JSON-LD foundation — `VERIFIED COMPLETE`.
- Marketing indexing remains explicitly opt-in and fails closed for local, preview and non-canonical
  deployments.
- MKT-01D deterministic standalone container packaging, per-app bundle checks, baseline security
  headers, environment model, smoke checks, rollback procedure and cutover plan — `VERIFIED COMPLETE`
  for repository work.
- MKT-02A human-approved Witness logo canonicalisation and header/footer integration — `VERIFIED COMPLETE`.
- MKT-02B semantic colour, system-first typography, spacing rhythm, controlled light presentation
  and WCAG contrast verification — `VERIFIED COMPLETE`.
- MKT-02C reusable marketing primitives, three-level action hierarchy, accessible interaction states,
  restrained cards and responsive CTA grouping — `VERIFIED COMPLETE`.
- MKT-02D semantic linear and branching provenance visual language — `VERIFIED COMPLETE`.
- MKT-02E rendered Chrome responsive review, keyboard path, focus, logo, navigation, overflow and
  provenance verification at six representative widths — `VERIFIED COMPLETE`.
- MKT-03B approved hero, factual problem narrative, provenance flow and five commercial working verbs
  — `VERIFIED COMPLETE`.
- MKT-03C synthetic product preview with illustrative metrics, decision, evidence records and action
  relationship — `VERIFIED COMPLETE`.
- MKT-03D six restrained audience/solutions cards with approved outcome-oriented copy — `VERIFIED COMPLETE`.
- MKT-03E provenance story, trust pillars, open infrastructure and Pacific-origin line — `VERIFIED COMPLETE`.
- MKT-03F final CTA, responsive/accessibility verification and SEO/performance review — `VERIFIED COMPLETE`.
- MKT-03G domain and cutover runbook preparation — `VERIFIED COMPLETE`; cutover not executed.
- MKT-03H CORS reconciliation, app-host audit, Keycloak/cookie contract, exact preview/`www` plan,
  rollback worksheet, local production/noindex candidate and updated dry run — `VERIFIED COMPLETE`.
- MKT-03I current-main alignment, clean release source, full workspace/security verification,
  immutable container RC1 and local RC1 smoke/browser QA — `VERIFIED COMPLETE`.
- MKT-03L Brand Book reconciliation: canonical palette/typography/radius replace the prior
  independent design system, self-hosted Newsreader/IBM Plex fonts, homepage positioning line, full
  test/lint/typecheck/build/bundle-budget/six-width browser QA — `VERIFIED COMPLETE`. See
  `docs/commercial-website/BRAND_SYSTEM.md`'s MKT-03L section for the area-by-area audit.
- MKT-04A-F platform story pages — `/platform`, `/how-it-works`, `/why-witness`,
  `/platform/evidence`, `/platform/decisions`, `/platform/institutional-memory` — `VERIFIED
  COMPLETE`. Content is grounded in `packages/domain`'s actual implemented lifecycles (evidence
  draft/submitted/withdrawn, decision proposed/confirmed/superseded/reversed, commitment and action
  states) and `VISION.md`, not aspirational copy; deliberately does not claim the evidence review
  states (`under_review`/`validated`/`rejected`) that are declared but not yet wired to a mutator.
  Primary/footer navigation now links `/platform` and `/how-it-works` since those routes are real;
  `test/foundation.test.tsx` asserts every remaining nav label with no route stays non-interactive.
- MKT-04G verification — `VERIFIED COMPLETE`: lint, typecheck, 19 unit tests (one h1 per page,
  canonical metadata, no cross-links to fake routes), production build (102 KB First Load JS,
  unchanged), bundle-budget check, and real six-width Chrome browser QA extended to cover all seven
  content routes (was homepage + fixture only) — caught and fixed a real CSS Grid stretch bug on
  one page's badge before it shipped. Indexing remains `OFF`.
- MKT-05 Solutions — `VERIFIED COMPLETE`: `/solutions` hub plus four differentiated sector pages
  (government, international development, research, consultation) built from the already-approved
  homepage audience copy and `VISION.md`, explicitly not from `docs/product/SECTOR_APPLICATIONS.md`
  (non-canonical, ADR-0021, covers unrelated sectors — a unit test asserts none of its terms appear).
  Primary/footer navigation now links `/solutions` and its four children. 26 unit tests, production
  build (102 KB First Load JS, unchanged), bundle-budget check, docs:lint/links/headers, and
  six-width Chrome QA across all twelve content routes all pass. No inline styling or hex colours
  introduced anywhere — every page composes only already-reconciled shared components and CSS
  classes, so Brand Book colour/typography compliance holds by construction. CTAs use the
  established "Book a demonstration" / "Explore Witness" / "How Witness works" vocabulary; no new
  conversion forms (MKT-07's scope).

## In progress

- External preview, authenticated browser proof and final Cloudflare/Keycloak baseline remain
  approval-gated production-readiness work; production cutover remains unexecuted.

## Blocked

- Isolated Cloudflare preview provisioning requires a new approved project/hostname and credentials;
  this is intentionally human-gated for MKT-01D.
- Production apex cutover is intentionally gated on later architecture, preview and rollback proof
  plus human approval.
- This branch predates `origin/main`'s production cookie-session security change and must be aligned
  through normal review before any deployment candidate is produced.
- Remote preview remains blocked by unavailable Cloudflare/Tunnel credentials and production SSH.

## Next recommended task

- Provision and verify the isolated noindex preview and complete the MKT-03I human-only gates.
  MKT-04 and MKT-05 are complete; the next content milestone is MKT-06 (Synthetic Demo) per
  `ROADMAP.md`'s dependency ordering, and may proceed separately without changing production
  routing.

## Known technical debt

- Apex and app domains serve the same product application.
- Product metadata is globally `noindex`; no public SEO foundation exists.
- `packages/ui` is not implemented; the marketing foundation intentionally uses local minimal CSS.
- Checked-in Cloudflare tunnel templates contain historical hostnames and are not proof of effective
  production configuration.
- API rate-limit configuration exists without enforcement.
- Marketing has a focused browser/accessibility smoke suite and metadata tests; it does not yet have
  visual-regression baselines or a general route crawler.
- Dependency review can be skipped when GitHub's dependency graph is unavailable.
- No `www` redirect/canonical handling exists.
- No remote preview exists; provisioning one is deliberately deferred until the human Cloudflare gate
  is approved.
- Future navigation labels are non-interactive until their routes contain reviewed content.
- The mobile disclosure has structural and browser interaction coverage at six viewport widths.
- Marketing metadata uses a fixed canonical production origin while deployment URLs remain
  environment-configurable; production indexing also requires an explicit environment and URL match.
- No Cloudflare Pages/Workers project or remote preview exists in the repository; deployment is
  documented against the standalone container boundary.
- No dedicated remote deployment workflow exists yet because the required Cloudflare project,
  hostname and credential contract have not been approved.
- The supplied `apps/web/public/Witness Logo_.png` path was not present in this checkout; the existing
  canonical marketing asset was preserved and integrated, with no product asset deletion.

## Decisions requiring human approval

- Production DNS and apex/app routing cutover.
- Public pricing changes or packaging promises beyond verified catalogue capability.
- Legal, certification, compliance, sovereignty and deployment-availability claims.
- Customer names, logos, testimonials or confidential case studies.
- Paid third-party services and marketing/CRM data processors.
- Any material authentication-hostname or identity-strategy change.

## Production risks

- Splitting the apex incorrectly could break OIDC redirects, CORS/CSRF, invitation links or product
  navigation.
- Reusing the app shell could keep public pages coupled to session checks and the full product bundle.
- Publishing product `/pricing` without reconciliation could imply self-service paths or commercial
  promises not operationally supported.
- Adding forms before Turnstile, server validation, rate limiting and consent separation would create
  abuse and privacy risk.
- Treating Cloudflare dashboard state or documentation as verified control evidence could lead to
  inaccurate trust claims.

## MKT-03J status

`VERIFIED COMPLETE` for verification/handoff; `CUTOVER STATUS: NOT EXECUTED`. Apex, app, API and
identity HTTPS are active. Preview and `www` do not resolve. No usable Cloudflare, production-server,
Keycloak-admin, synthetic-account or synthetic-mailbox access was present. Remote marketing readiness
remains 25%, auth cutover readiness 50%, rollback readiness 25%, and overall production cutover
readiness is 28.6% (6/21 gates). `CUTOVER RECOMMENDATION: NO-GO`.
