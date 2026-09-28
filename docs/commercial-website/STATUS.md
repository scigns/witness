# Witness Commercial Website Status

**Owner:** Product, Commercial and Engineering
**Status:** Active programme

Last updated: 2026-09-28 (WEB-NEXT-01 reconciliation — see `docs/web/WEB_NEXT_01.md`)

## 2026-09-28 reconciliation note

This document was last updated 2026-09-04 and had drifted from `main`. Two commits landed after
that date without a status update:

- `68887dc` — dynamic-imported Cytoscape on the product Knowledge Graph route (bundle hygiene, not
  a marketing change).
- `e081fdd` (#234) — shipped `/platform/co-design`, `/platform/knowledge`, `/platform/change`,
  `/trust` + its three children (`security`, `data-sovereignty`, `privacy`), and `/stories`. This
  is most of **MKT-09 Trust Centre**, previously listed below as `NOT STARTED`, and closes the
  `sitemap.ts` staleness item that was listed as known debt (it now lists all 21 real content
  routes, verified by reading the file directly).

Corrections applied below reflect direct repository evidence (route files, `navigation.ts`,
`sitemap.ts`, `site-config.ts`, test files) gathered 2026-09-28, not carried forward from the prior
audit. One prior claim in this file was itself inaccurate and is corrected here: public pricing was
described as not connected to a real destination. In fact `apps/marketing/src/lib/site-config.ts`
already resolves `pricingUrl` to `{appUrl}/pricing` (the real product pricing page, which calls the
live plan-catalogue API) and both header and footer "View plans" CTAs use it — this conversion path
already works. What remains missing for MKT-08 is a marketing-native packaging/positioning page, not
a broken or fake link.

## 2026-09-28 — `www` canonical decision and fresh live-state audit

**Human product decision (CW-034, `DECISIONS.md`): `https://www.buildwithwitness.com` is now the
canonical public marketing host**, superseding the prior apex-canonical decision (CW-028). Apex will
permanently redirect to `www` once cut over — see `CUTOVER_RUNBOOK.md`'s "Cloudflare apex→`www` plan".
This is a documentation/code decision only (`site-config.ts`'s `CANONICAL_MARKETING_ORIGIN`,
canonical metadata, sitemap, robots); no DNS/Cloudflare change has been made.

Fresh external verification (public DNS/HTTPS only, no SSH/Cloudflare access available):
`www.buildwithwitness.com` still has no DNS record at all. Apex and `app.` both still serve the
authenticated product build (byte-identical `<title>Witness</title>`), unchanged from prior audits.
`preview.buildwithwitness.com` is live but serves a **stale** marketing build predating even the
2026-09-04 sitemap expansion (`/sitemap.xml` lists only `/`; `/get-started`, merged in `f8153d4`,
404s). **The `f8153d4` marketing changes (WEB-NEXT-01, the reworked homepage, `/get-started`, and this
`www` decision) are not deployed anywhere publicly** — repository state and live state remain
distinct. See `CUTOVER_RUNBOOK.md`'s "Current topology (read-only verification, 2026-09-28)" for the
full per-host table.

## Current phase

MKT-09 Trust Centre substantially delivered (2026-09-25, #234); WEB-NEXT-01 (see
`docs/web/WEB_NEXT_01.md`) is complete; the commercial-front-door homepage rework (see this file's
2026-09-28 note above) is the active milestone — `IN PROGRESS`.

## Programme health

AMBER

The product is live behind Cloudflare and has strong delivery/security governance, but the apex and
application hosts currently serve the same authenticated Next.js application, and the reworked
marketing site is not deployed anywhere publicly yet (see the 2026-09-28 note above). Public commercial
separation and indexability do not yet exist. Content coverage is now broad (21 marketing routes
including a real Trust Centre); conversion (MKT-07) and commercial packaging (MKT-08) remain the
biggest content gaps. The authenticated product (`apps/web`) has materially weaker automated test
coverage than the marketing site — see `docs/web/WEB_NEXT_01.md`.

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
- MKT-06 Synthetic Demo — `VERIFIED COMPLETE`: `/demo` walks one fictional "Service Improvement
  Programme" record end to end (session/consent, evidence, finding/recommendation, decision,
  commitment/action, provenance, later reconstruction), grounded in `packages/domain` — see the
  domain-truth audit below. "Approval" is deliberately not shown as its own entity: `Decision` uses
  `confirmed`/`confirmedBy`, not `approved` (that status belongs to the separate `Report`
  aggregate), so the demo labels the moment "Sign-off: confirmed by..." rather than inventing an
  Approval object. Consent categories shown (participation, audio_recording, internal_use,
  attributed_quotation) are the exact `CONSENT_CATEGORIES` from
  `packages/domain/src/consent-template.ts`, not invented labels. "Finding" and "Recommendation"
  are explicitly captioned as the narrative bridge a person writes between evidence and a decision,
  not persisted records — they only ever existed as `ProvenanceKind` diagram labels, in this
  repository or the already-shipped MKT-04/05 pages. First and only use of Ember on the site: the
  one action item that is genuinely in progress. "Demo" added to primary navigation (no prior
  placeholder existed for it, unlike Platform/Solutions). 31 unit tests (including an automated
  check that no real organisation/customer name appears), production build (102 KB First Load JS,
  unchanged), bundle-budget check, docs:lint/links/headers, six-width Chrome QA across all
  thirteen content routes, and a targeted keyboard-navigation check (skip link first, no traps,
  every link reachable) all pass. No production database, Keycloak, or API dependency — static
  synthetic content only.
- MKT-09 (most of) — Trust Centre, institutional learning and co-design explanation —
  `VERIFIED COMPLETE` in the repository, per `e081fdd` (#234, merged 2026-09-25): `/trust` hub +
  `/trust/security`, `/trust/data-sovereignty`, `/trust/privacy` (every claim classified as
  deployed/configured/planned, explicitly denying SOC 2/ISO 27001 and unenforced rate limiting
  rather than omitting them), plus `/platform/co-design`, `/platform/knowledge`, `/platform/change`
  filling content gaps left after MKT-04/05/06, plus an honest empty-state `/stories` page. 44 unit
  tests (was 31), `sitemap.ts` now lists all 21 real routes, six-width Chrome QA across all 21
  routes, 102 KB First Load JS unchanged. Not yet reflected in the roadmap's milestone table before
  this reconciliation.

## In progress

- Authenticated browser proof and final Cloudflare/Keycloak baseline remain approval-gated
  production-readiness work; production cutover remains unexecuted.
- The remote preview is live (see "Remote preview — resolved" below) but serves a build from before
  MKT-04/05/06; redeploying it with current `main` is tracked as its own next step, not blocked.

## Remote preview — resolved 2026-09-05

**Corrects prior entries in this file, `DEPLOYMENT.md` and `CUTOVER_RUNBOOK.md` that said no preview
existed and that Cloudflare/SSH access was unavailable — both were true as of 2026-09-04 and are no
longer true.** Verified directly, not assumed:

- `https://preview.buildwithwitness.com` responds `200` on `/`, `/health` and `/sitemap.xml`;
  `/robots.txt` returns `Disallow: /`.
- SSH to `witness@167.172.72.70` now succeeds (previously `Permission denied (publickey)`).
- The Cloudflare Tunnel ingress (read on the host) proxies `preview.buildwithwitness.com` to
  `witness-marketing-preview:3000` only, with an explicit deny-by-default catch-all — no other
  host's Tunnel routing was touched to add it.
- The running container is `witness-marketing:preview-efba8b7`
  (`sha256:5bd75298c879de0fa381464104053f0281d9a3123f145a6dd88636b537b05bc8`), env
  `WITNESS_MARKETING_ENV=preview`, `WITNESS_MARKETING_INDEXABLE=false` — correctly configured, but
  built from `efba8b7`, i.e. before MKT-04, MKT-05 and MKT-06. `/platform`, `/solutions` and
  `/how-it-works` all return `404` on the live preview today.
- **Not isolated at the network layer**: the container runs on the shared `witness-pilot` Docker
  network, the same one `postgres`/`api`/`keycloak` use — not a dedicated network. It carries no
  credentials and its code never calls those services, but network-layer reachability is not the
  same as an application never using it. Giving it a dedicated network (with `cloudflared` attached
  to both) is a real hardening opportunity, not done here — this only corrects language, not the
  deployment.
- Production apex cutover is intentionally still gated on rollback proof and human approval; nothing
  above changes that.

## Blocked

- Production apex cutover is intentionally gated on rollback proof and human approval.
- This branch predates `origin/main`'s production cookie-session security change and must be aligned
  through normal review before any deployment candidate is produced.

## Next recommended task

- Redeploy the marketing preview container with current `main` (MKT-04/05/06/09 included) using the
  same isolated, already-approved pattern recorded above, then complete the MKT-03I human-only
  gates. This may proceed separately without changing production routing — it requires DigitalOcean
  host and Cloudflare access this worktree does not have and does not attempt to use.
- WEB-NEXT-01 (`docs/web/WEB_NEXT_01.md`): close the automated-test and browser-QA gap in
  `apps/web` and reconcile authenticated-app route truth, without touching production or the
  apex/app split above.
- MKT-07 (Conversion Infrastructure) remains the next content milestone per `ROADMAP.md`'s
  ordering; not started in this reconciliation.

## Known technical debt

- Apex and app domains serve the same product application.
- Product metadata is globally `noindex`; no public SEO foundation exists.
- `packages/ui` is not implemented; both `apps/marketing` and `apps/web` intentionally use local,
  independent component primitives rather than a shared design system. They are visually aligned by
  convention (same Brand Book tokens, same self-hosted fonts) but not by shared code — a brand
  update currently has to be applied twice.
- `apps/web` still has materially less automated coverage than `apps/marketing`: WEB-NEXT-01 added
  16 component/behaviour tests (dashboard, onboarding, review, records, knowledge graph) and grew
  browser QA from 3 to 7 of ~65 routes, but most routes still have neither. See
  `docs/web/WEB_NEXT_01.md` for the remaining gap.
- The serving preview build is now two feature waves behind `main` (missing MKT-05/06/09), see
  above — redeploy is an operational task, not a code gap.
- Checked-in Cloudflare tunnel templates contain historical hostnames and are not proof of effective
  production configuration.
- API rate-limit configuration exists without enforcement.
- Marketing has a focused browser/accessibility smoke suite and metadata tests; it does not yet have
  visual-regression baselines or a general route crawler.
- Dependency review can be skipped when GitHub's dependency graph is unavailable.
- No `www` redirect/canonical handling exists.
- The remote preview exists and is correctly configured (noindex, no secrets, Tunnel-isolated
  hostname; shares the `witness-pilot` Docker network rather than a dedicated one) but serves a
  build from before MKT-04/05/06 — see "Remote preview — resolved" above.
- Future navigation labels are non-interactive until their routes contain reviewed content.
- The mobile disclosure has structural and browser interaction coverage at six viewport widths.
- Marketing metadata uses a fixed canonical production origin while deployment URLs remain
  environment-configurable; production indexing also requires an explicit environment and URL match.
- No Cloudflare Pages/Workers project exists; deployment is a standalone container behind the
  existing Tunnel, documented above and in `DEPLOYMENT.md`.
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
