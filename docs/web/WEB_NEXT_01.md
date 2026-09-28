# WEB-NEXT-01 — Web Experience Reconciliation & Product Readiness

**Owner:** Frontend Lead
**Status:** IN PROGRESS
**Scope:** `apps/marketing`, `apps/web`, identity hand-off between them. No production, DNS,
Cloudflare, or Keycloak-production changes. No mobile/customer-learning code.
**Worktree:** `~/witness-website`, branch `feat/web/website-next`, started clean from `origin/main`
at `e081fdd`.
**Last updated:** 2026-09-28

## 1. Current-state evidence

Gathered directly from the repository on 2026-09-28 (route files, `navigation.ts`, `sitemap.ts`,
`site-config.ts`, test files, git history) — not carried forward from prior, partly stale docs.
`docs/commercial-website/STATUS.md` and `ROADMAP.md` have been corrected in the same change as
this document; treat them as current going forward.

### 1.1 Apps

- `apps/marketing` — independent Next.js 15 app, port 3002, 21 real content routes plus `/health`
  (probe) and `/brand-fixture` (noindex dev fixture). No secrets, no protected API calls, no auth
  state. Brand Book-reconciled design tokens, self-hosted fonts.
- `apps/web` — independent Next.js 15 app, port 3000, ~65 route files. The authenticated Witness
  product: sessions, evidence, review, knowledge graph, org/workspace administration, billing,
  operator health.
- `apps/admin-console`, `apps/docs-site` — stub READMEs only, not started, out of scope here.
- `packages/ui` (the intended shared design system) — stub README only. Both apps use independent
  local component primitives, aligned by convention (same tokens, same fonts) not by shared code.

### 1.2 Marketing routes (verified against `apps/marketing/src/app/**` and `sitemap.ts`)

`/`, `/platform` (+ `evidence`, `decisions`, `institutional-memory`, `co-design`, `knowledge`,
`change`), `/how-it-works`, `/why-witness`, `/solutions` (+ `government`,
`international-development`, `research`, `consultation`), `/demo`, `/trust` (+ `security`,
`data-sovereignty`, `privacy`), `/stories`. `sitemap.ts` lists exactly these 21 routes — verified
accurate by direct comparison with the route file list, contradicting the prior "lists only `/`"
claim in `STATUS.md` (already corrected there).

### 1.3 Product (`apps/web`) routes

Public/light: `/`, `/signin`, `/auth/callback`, `/auth/error`, `/activate`, `/pricing`,
`/join/[token]`, `/capture/[sessionId]`, `/workspace-invitations/[token]`.
Authenticated: `/profile`, `/organisations` (+ new, `[id]` billing/consent-templates/invitations/
people/programmes), `/users` (+ new), `/operator`, `/operations/organisations/.../invoices/.../
settle`, `/workspaces` (+ new, `[id]` agenda/live/manage/people/resources/review/search, and
`sessions/*` with participants/evidence/outcomes/consent/reports, and `knowledge/*` — concepts,
domains, graph, review, stewardship), `/records` (+ new, `[id]`), `/review`.

### 1.4 Navigation, conversion paths and route truth

- No phantom static links found in either app: every static `href="/..."` in both `src` trees
  resolves to a real route file (verified by grepping all internal hrefs and cross-checking against
  the route lists above).
- `apps/marketing/src/lib/navigation.ts` only links routes that exist; unbuilt labels (Resources,
  a dedicated Pricing content page) are rendered non-interactive, asserted by
  `apps/marketing/test/foundation.test.tsx`.
- **Pricing hand-off already works.** `apps/marketing/src/lib/site-config.ts` resolves
  `pricingUrl` to `new URL('/pricing', appUrl)` — the real product pricing page, which calls the
  live `getPlanCatalogue()` API. Both header and footer "View plans" CTAs use it. The prior
  `STATUS.md` framing ("product `/pricing` exists; public packaging remains") was read by an
  earlier pass as implying the link didn't work; it does. What's genuinely missing (MKT-08) is a
  marketing-native packaging/positioning page, not a broken or fake destination.
- "Book a demonstration" resolves to a `mailto:` (`WITNESS_MARKETING_DEMO_URL`, default
  `hello@buildwithwitness.com`) — honest, not disguised as a live form. MKT-07 (forms, Turnstile,
  lead workflow) is genuinely `NOT STARTED`.
- Marketing's sign-in CTA points at `{WITNESS_MARKETING_APP_URL}/signin`, default
  `https://app.buildwithwitness.com/signin` — a real, working identity entry point once deployed.

### 1.5 Authentication and identity hand-off

- Real session: opaque, HttpOnly, host-only cookie owned by the API. Every tab resolves identity
  independently via `GET /api/v1/me` (`apps/web/src/lib/auth.tsx`). States modelled explicitly:
  `loading | authenticated | unauthenticated | suspended | deactivated | error`, each with distinct
  UI — suspended/deactivated get a different message than a plain sign-in prompt.
  - Also see `packages/domain`/`docs/architecture` for the OIDC/PKCE contract this UI consumes;
    reviewed for read-only understanding, not modified here.
- Dev-only "Acting as" role switcher (`apps/web/src/lib/session.tsx`) sets an unverified
  `X-Witness-Dev-User` header, only sent by development builds, gated at render time by
  `IS_DEVELOPMENT_BUILD` so it cannot appear in a deployed instance.
- No `middleware.ts` in either app. Route-level gating is per-component (e.g. Admin menu only
  renders if any organisation role is `admin`; Review nav item only if any workspace role is
  `admin`/`reviewer`). This is convention-enforced, not framework-enforced; real authority is
  server-side. **This audit does not weaken or restructure this boundary** — see §8.

### 1.6 First-use experience and onboarding (already implemented — not a gap)

Contrary to the possibility flagged in the originating brief, a first-use path already exists and
does not need to be invented:

- `apps/web/src/app/page.tsx` (`DashboardPage`) is a fully built authenticated home: workspace
  cards, "Needs your attention" stats (open/upcoming sessions, records awaiting review, role-gated),
  recent records/sessions, quick actions (Open a program / Capture evidence / Browse records),
  role-gated CTAs (`CAPTURE_ROLES`, `REVIEW_ROLES`), and a genuine unauthenticated marketing-style
  splash with a single "Sign in to Witness" CTA when signed out.
- `apps/web/src/components/onboarding.tsx` is a five-step, dismissible, per-programme onboarding
  overlay ("Client-Ready Experience overhaul, Phase 10"), localStorage-gated per workspace, that
  explains what co-design participation means, program description, who's here, consent choices,
  and a link to complete a profile. **Verified wired in** at
  `apps/web/src/app/workspaces/[id]/page.tsx` (grepped for `OnboardingOverlay`/
  `useOnboardingVisible` usage).
- Conclusion: this acceptance criterion is **already met**. Work in this milestone is limited to
  verifying it stays true (a test), not building a new onboarding surface.

### 1.7 Empty states (audited, largely already solid)

A shared `EmptyState` component (`apps/web/src/components/ui.tsx`) is used consistently across
`/records`, `/workspaces`, `/organisations`, `/review`, `/workspaces/[id]/sessions`,
`/workspaces/[id]/knowledge/concepts`, and session evidence lists. Sampled instances already follow
the what/why/next-action pattern, e.g.:
- Records: "No records yet" / "Capture your first record to begin building institutional memory."
  / **Capture a record** button.
- Review: "You're not a reviewer in any programme yet" / explains how that changes / (correctly no
  action — there is nothing to act on yet).
- Knowledge concepts: "No concepts yet" / "Concepts ... appear here once proposed from evidence." —
  correctly does not claim a capability (auto-extraction) that isn't wired to a mutator yet.

`apps/marketing/src/app/stories/page.tsx` is a genuinely honest empty state ("no public story has
publication consent yet") — the real story-publishing pipeline lives, unmerged, on
`phase6/customer-learning`; this milestone preserves the empty state as-is per the explicit
instruction not to depend on that branch.

**Genuine finding**: `/activate` and `/workspace-invitations/[token]` — reached by people who may
not yet have an account — render inside the full authenticated app shell (primary nav, Admin menu
if somehow already privileged, dev-only "Acting as" switcher in dev builds) rather than the bare
chrome already used for `/join/` and `/capture/` (`Shell.tsx`'s `BARE_ROUTE_PREFIXES`). Not
misleading (both pages are self-contained and correct), but inconsistent with the established
pattern for pre-account routes.

### 1.8 Test coverage (the clearest, most defensible gap)

- `apps/marketing`: 44 unit tests (`vitest`, jsdom via `esbuild.jsx: 'automatic'`), a six-width
  real-Chrome QA script (`e2e/brand-review.mjs`) covering all 21 content routes, keyboard-path
  checks, content-integrity assertions (no fabricated names/claims, no cross-links to fake routes).
- `apps/web`: two test files — `runtime-config.test.ts`, `brand-contract.test.ts` — both
  `environment: 'node'`, neither renders a React component. Zero component/page-behaviour tests
  across ~65 routes. The one browser QA script (`test/brand-review.mjs`) exercises exactly 3 routes:
  `/`, `/signin`, `/pricing` — a structural/typography/brand check only (h1 count, header/main/
  footer presence, font family, background colour, no horizontal overflow), not behaviour.
  `apps/web/vitest.config.ts` has no jsdom/React-Testing-Library setup at all — this milestone adds
  it.

## 2. Customer journey map (current, as evidenced above)

```
Public visitor
  → apps/marketing "/" understands Witness (real, tested homepage)
  → /platform, /how-it-works, /solutions, /demo, /trust: credible product proof,
    grounded in packages/domain, not aspirational copy (asserted by tests)
  → "View plans" → apps/web "/pricing": real plan catalogue via live API — WORKS TODAY
  → "Sign in" / "Book a demo" → apps/web "/signin" or mailto: — WORKS TODAY (mailto is honest,
    not a fake form)
  → OIDC sign-in → apps/web "/" dashboard: workspace cards, attention items, quick actions —
    ALREADY BUILT, not previously documented as such
  → first entry into a program → five-step onboarding overlay — ALREADY BUILT AND WIRED
  → sessions / evidence / review / knowledge graph / records — all implemented, empty states
    already follow what/why/next-action
```

The journey is **materially more complete than the pre-reconciliation docs suggested**. The
genuine remaining gaps are narrower than "build a customer journey" — they are: verify the journey
behaviourally (tests), extend QA breadth, fix one chrome inconsistency, and keep the two
commercial-website docs from drifting again.

## 3. Genuine gaps (in scope for this milestone)

1. `apps/web` has no component/page-level test coverage — the single largest quality gap between
   the two apps.
2. `apps/web`'s browser QA covers 3 of ~65 routes; the authenticated core (dashboard, a workspace,
   sessions list, evidence list, review queue, knowledge graph) has no responsive/browser check at
   all.
3. `/activate` and `/workspace-invitations/[token]` render full authenticated chrome inconsistent
   with the bare-route pattern already used for `/join/` and `/capture/`.
4. `docs/commercial-website/STATUS.md` and `ROADMAP.md` were stale relative to `main` (addressed in
   the same change as this document, see their reconciliation notes).

## 4. Explicit non-goals

- No Brand Book redesign — existing tokens, fonts, and component conventions are used as-is.
- No new `packages/ui` design-system package — out of scope for this milestone; noted as debt.
- No conversion-infrastructure build (forms, Turnstile, lead workflow) — MKT-07, not this milestone.
- No commercial packaging page, no pricing/claim changes — MKT-08, and pricing changes are an
  explicit human-approval gate regardless.
- No customer-story/testimonial implementation — that work is unmerged on
  `phase6/customer-learning` and out of scope by instruction; `/stories` empty state is preserved.
- No middleware-based route-protection rewrite — the existing server-authoritative, per-component
  gating convention is preserved (§8).
- No production deploy, DNS, Cloudflare, or Keycloak-production change.
- No fabricated capabilities: no invented onboarding automation, CRM behaviour, billing behaviour,
  or AI behaviour.

## 5. Implementation slices

1. **Docs reconciliation** (this document + `STATUS.md`/`ROADMAP.md` corrections) — done in the
   same change.
2. **`apps/web` test infrastructure**: add a jsdom-capable vitest project/config (without breaking
   the existing node-environment config/runtime tests) and React Testing Library, scoped to
   `apps/web` only.
3. **Behavioural tests for highest-value routes**: dashboard (`/`) empty vs. populated states and
   role-gated CTAs; `/workspaces/[id]` onboarding overlay dismiss/localStorage behaviour; `/review`
   empty-state branching (`not a reviewer` vs `nothing to review` vs populated); `/records` empty
   state and capture CTA; a knowledge-graph smoke test (renders, accessible list view present).
   Assert product truth (role gating, empty-state copy, correct links), not implementation trivia.
4. **Bare-chrome fix**: add `/activate` and `/workspace-invitations/` to `Shell.tsx`'s
   `BARE_ROUTE_PREFIXES` (or an equivalent, deliberate decision if a reviewer determines the admin
   menu path can't actually be reached pre-auth, documented inline) so pre-account routes are
   consistently minimal.
5. **Browser QA expansion**: extend `apps/web/test/brand-review.mjs` to cover the authenticated
   dashboard and a representative workspace/session/knowledge route reachable via the existing
   Developer Preview unauthenticated mode (`IS_DEVELOPMENT_BUILD`), without adding any
   production-only test bypass.
6. **Verification and commit.**

## 6. Acceptance criteria

- Public visitor → product proof → pricing → sign-in path verified against evidence, not assumed;
  any inaccuracy found is corrected in docs, not silently left.
- No link, nav item, or CTA in either app points at a route that does not exist.
- `apps/web` has jsdom-based component tests covering dashboard, onboarding overlay, review,
  records, and knowledge-graph routes, exercising real states (empty, populated, role-gated).
- `apps/web` browser QA covers more than 3 routes, including at least one authenticated-shape route.
- `/activate` and `/workspace-invitations/` chrome exposure is resolved or explicitly, narrowly
  justified in code comments.
- All existing tests, lint, typecheck, and builds continue to pass — this is an additive/corrective
  milestone, not a rewrite.
- No change to auth/session/role logic, consent/provenance rules, or API contracts.

## 7. Test strategy

- Unit/component: `vitest` + `@testing-library/react` (new devDependency, `apps/web` only) for the
  routes in §5.3. Mock `@/lib/api` and `@/lib/auth`/`@/lib/session` contexts rather than hitting a
  live API — these are frontend behaviour tests, not integration tests.
- Browser QA: extend the existing Playwright-core script pattern already proven in both apps;
  reuse the same six-width matrix and structural assertions (h1, header/main/footer, no overflow)
  plus route-specific assertions where useful.
- Do not touch `pnpm test:contract`, `pnpm test:invariants`, `pnpm test:adversarial`,
  `pnpm test:infrastructure` behaviour — these exercise `packages/domain`/`services`/`workers`, not
  `apps/web` or `apps/marketing`; run them for regression assurance only if `turbo`'s dependency
  graph pulls them in.

## 8. Security / auth constraints

- Preserve tenant isolation, OIDC/PKCE/session behaviour, role checks, consent/provenance rules, and
  API boundaries exactly as implemented. No middleware introduced; no change to `lib/auth.tsx`,
  `lib/session.tsx`, or any role-check predicate.
- New tests must not introduce a production-reachable auth bypass. Any test fixture that simulates
  an authenticated user does so by mocking the React context/provider in the test file, never by
  adding a code path in `apps/web/src` that skips a real check.
- Browser QA additions run against the existing Developer Preview unauthenticated mode
  (`IS_DEVELOPMENT_BUILD`) the same way the current 3-route script already does — no new bypass.

## 9. Files likely to change

- `docs/commercial-website/STATUS.md`, `docs/commercial-website/ROADMAP.md` (done).
- `docs/web/WEB_NEXT_01.md` (this file).
- `apps/web/vitest.config.ts` or a new `apps/web/vitest.config.web.ts` — jsdom project addition.
- `apps/web/package.json` — new devDependencies (`@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom`, or equivalents), new test script if a split config is used.
- New files under `apps/web/test/` for dashboard, onboarding, review, records, knowledge-graph
  behavioural tests.
- `apps/web/test/brand-review.mjs` — expanded route list.
- `apps/web/src/components/shell.tsx` — `BARE_ROUTE_PREFIXES` addition (small, targeted).

## 10. Risks

- Introducing jsdom to `apps/web`'s vitest setup could interact with the existing node-environment
  tests if not scoped carefully (mitigation: separate config/project, verify both still run in CI).
- Mocking `@/lib/api` incorrectly could produce tests that pass against a fake shape the real API
  no longer returns (mitigation: import real types from `@witness/contracts` in mocks, not ad hoc
  shapes).
- The `BARE_ROUTE_PREFIXES` change touches a component read by every route in the app; keep the
  diff minimal and re-run the existing brand-review script after.
- None of this milestone's changes touch production, but the docs reconciliation corrects public
  claims in `STATUS.md`/`ROADMAP.md` — reviewed carefully against evidence before writing, not
  asserted from memory.

## 11. Rollback / reversion approach

All work lands as commits on `feat/web/website-next`, which started clean from `origin/main`. Every
slice (docs, test infra, new tests, shell fix, QA expansion) is a separable commit; any slice can be
reverted independently with `git revert` without affecting the others, since none rewrite shared
state or migrations. No production system is touched, so there is no deployment to roll back —
reversion is purely a matter of reverting the relevant commit(s) before merge, or dropping the
branch entirely since `main` is untouched.
