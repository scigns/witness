# Witness Commercial Website Roadmap

**Owner:** Product, Commercial and Engineering
**Status:** MKT-01D repository hardening complete; preview remains gated
**Last reviewed:** 2026-09-04

## State model

`NOT STARTED` → `DESIGN / PLANNING` → `IMPLEMENTATION` → `TESTING` → `DEPLOYED` →
`VERIFIED COMPLETE`

Deployment is not completion. Each milestone advances only when its acceptance criteria are
explicitly verified.

## Milestone status

| Milestone | State | Repository truth and next gate |
| --- | --- | --- |
| MKT-00 Programme Audit & Memory | `VERIFIED COMPLETE` | Audit and canonical memory created; no production mutation |
| MKT-01 Commercial Site Foundation | `IMPLEMENTATION` | MKT-01A through MKT-01D repository work verified; isolated preview and deployment/DNS remain gated |
| MKT-02 Brand System | `VERIFIED COMPLETE` | MKT-02A through MKT-02E verified; MKT-03A is next |
| MKT-03 Homepage | `VERIFIED COMPLETE` | MKT-03A through MKT-03F verified; production cutover not executed |
| MKT-03G Domain and Launch Readiness | `VERIFIED COMPLETE` | Runbook and 11.1% production dry run prepared; cutover is not ready/executed and human gates remain |
| MKT-03H Preview, Auth and Cutover Gate Closure | `VERIFIED COMPLETE` | Repository readiness 90%; production readiness 30%; remote preview and human production checks remain |
| MKT-03I Mainline Alignment, Preview Deployment & RC1 | `VERIFIED COMPLETE` | Current-main clean source and immutable RC1 verified; remote preview blocked; production readiness 33.3% |
| MKT-03L Brand Book Reconciliation | `VERIFIED COMPLETE` | Palette/typography/radius reconciled to the Brand Book; independent of the cutover track — no production/routing change |
| MKT-04 Platform & How It Works | `VERIFIED COMPLETE` | Six routes live: `/platform`, `/how-it-works`, `/why-witness`, `/platform/evidence`, `/platform/decisions`, `/platform/institutional-memory` |
| MKT-05 Solutions | `NOT STARTED` | Sector material exists as non-canonical context; no routes |
| MKT-06 Synthetic Demo | `NOT STARTED` | Product has synthetic development data, but no unauthenticated guided demo |
| MKT-07 Conversion Infrastructure | `NOT STARTED` | No public forms, Turnstile or lead workflow |
| MKT-08 Commercial Packaging | `DESIGN / PLANNING` | Product `/pricing` exists; public packaging and claim verification remain |
| MKT-09 Trust Centre | `NOT STARTED` | Extensive internal evidence exists; no publishable trust surface |
| MKT-10 Onboarding | `IMPLEMENTATION` | Controlled invitations/account activation exist; self-service provenance activation does not |
| MKT-11 Knowledge Centre | `NOT STARTED` | Repository documentation exists but is not a public knowledge centre |
| MKT-12 Customer Evidence | `NOT STARTED` | No public claims; evidence requires human approval |
| MKT-13 Commercial Analytics | `NOT STARTED` | No public or funnel instrumentation |
| MKT-14 Internationalisation | `NOT STARTED` | Begin only after English quality and conversion evidence |

## Safest implementation order

1. **MKT-01A — marketing app boundary decision and scaffold — `VERIFIED COMPLETE`.** Independent
   `apps/marketing` build, minimal non-production routes, package tests and boundary checks exist.
2. **MKT-01B — global public shell — `VERIFIED COMPLETE`.** Accessible responsive header, native
   mobile disclosure, footer, layout primitives and honest route-availability policy exist.
3. **MKT-01C — metadata and indexability foundation — `VERIFIED COMPLETE`.** Central canonical URL
   policy, reusable metadata, robots, sitemap and safe structured data are implemented. Preview builds
   remain non-indexable.
4. **MKT-01D — preview and deployment hardening — `VERIFIED COMPLETE` for repository work.**
   Standalone container packaging, deterministic per-app bundle checks, security headers, environment
   model, smoke checks, rollback and cutover plan are documented. Actual Cloudflare preview
   provisioning remains human-gated; apex/app routing is unchanged.
5. **MKT-02A — Witness logo and brand asset foundation — `VERIFIED COMPLETE`.** Human-approved logo
   is canonicalised and integrated without modifying the artwork.
6. **MKT-02B — colour and typography system — `VERIFIED COMPLETE`.** Semantic palette, system-first
   type hierarchy, spacing rhythm, logo-safe surfaces and contrast checks are implemented.
7. **MKT-02C — reusable components and interaction states — `VERIFIED COMPLETE`.** Core primitives,
   action hierarchy, accessible states and responsive grouping are implemented without client JS.
8. **MKT-02D — provenance visual language — `VERIFIED COMPLETE`.** Semantic linear and branching
   diagrams use CSS and accessible HTML without client JavaScript.
9. **MKT-02E — brand accessibility and responsive review — `VERIFIED COMPLETE`.** Repository-owned
   Chrome checks cover six widths, keyboard navigation, focus, overflow, logo and provenance fixtures.
10. **MKT-03A — homepage semantic structure** is the next safe unit.
11. **MKT-03A — homepage semantic structure — `VERIFIED COMPLETE`.** Nine ordered sections with
    stable IDs and approved positioning are implemented.
12. **MKT-03B — hero and problem narrative — `VERIFIED COMPLETE`.** Approved positioning, factual
    fragmentation narrative, provenance flow and working verbs are implemented.
13. **MKT-03C — synthetic product preview — `VERIFIED COMPLETE`.**
14. **MKT-03C — synthetic product preview — `VERIFIED COMPLETE`.** Illustrative metrics, decision,
    supporting records, action and provenance relationships are rendered without API access.
15. **MKT-03D — audience and solutions cards — `VERIFIED COMPLETE`.** Six restrained cards use
    approved outcome-oriented copy without links, credentials or customer claims.
16. **MKT-03E — provenance, trust and open infrastructure — `VERIFIED COMPLETE`.**
17. **MKT-03F — conversion and final homepage verification — `VERIFIED COMPLETE`.**
18. **MKT-03G — domain and cutover readiness — `VERIFIED COMPLETE`.** Preparation is complete;
    production cutover remains unexecuted and human-gated.
19. **MKT-03H — preview, auth and cutover gate closure — `VERIFIED COMPLETE`.** CORS drift is
    reconciled, exact host/security/deployment contracts are recorded and production readiness is 30%.
20. **MKT-04 — platform story pages — `VERIFIED COMPLETE`.** Six routes grounded in
    `packages/domain`'s actual implemented lifecycles, not aspirational copy; navigation wired only
    to routes that now exist.
21. **MKT-03I — mainline alignment, preview deployment and RC1 — `VERIFIED COMPLETE`.** Clean
    current-main release source and immutable local RC1 pass; remote preview remains human-gated.
22. **MKT-03J — external preview, auth and production baseline verification — `VERIFIED COMPLETE`.**
    Public endpoints were verified and exact privileged operator actions recorded; preview, effective
    control-plane state and synthetic auth remain blocked, so the cutover recommendation is `NO-GO`.
23. Build the highest-value MKT-05 pages, then synthetic demo, conversion, packaging, trust,
    onboarding and analytics in milestone order, advancing partial existing capabilities only after
    their own acceptance checks.

## First small pull request

**Proposed identifier:** `MKT-01A marketing app boundary`

**Goal:** Introduce a deployable, testable marketing application boundary without changing any live
hostname, Cloudflare route, product route or authentication behaviour.

**Expected files:** a new `apps/marketing` package, minimal framework configuration, a deliberately
plain root route, focused tests, workspace/build integration, CODEOWNERS coverage if required, and
programme-memory updates. Reuse the repository's Next.js/Tailwind toolchain to avoid new platform
dependencies unless implementation evidence shows a better fit.

**Risks:** accidental inclusion in the production Compose image; workspace CI/bundle-budget
ambiguity; premature duplication of UI tokens; an indexable preview; marketing code importing
product auth/session modules.

**Required tests:** package lint, typecheck, unit test, production build, route smoke assertion,
metadata `noindex` assertion for non-production, bundle-budget compatibility, full documentation and
governance gates.

**Deployment impact:** none. The first PR must not edit DNS, production tunnel ingress, product
Compose service routing, identity configuration or production secrets.

## Human approval gates retained

Production DNS/routing, material identity changes, public legal/compliance claims, customer evidence,
pricing changes, paid third parties, contracting identity, secrets and irreversible migrations remain
explicit human approval gates.
