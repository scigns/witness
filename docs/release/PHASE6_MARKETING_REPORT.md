# Phase 6 Marketing Report — Track A

**Status:** Complete. Merged into `main` before this Phase 6 session began; verified, not rebuilt,
by this report.

## 1. What exists

`apps/marketing` is an independent Next.js application (its own build pipeline, its own
`package.json`, GPL-3.0-or-later like the product) covering:

| Area | Routes |
|---|---|
| Homepage | `/` |
| How it works | `/how-it-works` |
| Platform | `/platform`, `/platform/evidence`, `/platform/decisions`, `/platform/institutional-memory`, `/platform/co-design`, `/platform/knowledge`, `/platform/change` |
| Why Witness | `/why-witness` |
| Solutions | `/solutions`, `/solutions/government`, `/solutions/international-development`, `/solutions/research`, `/solutions/consultation` |
| Trust | `/trust`, `/trust/data-sovereignty`, `/trust/privacy`, `/trust/security` |
| Stories | `/stories` (see §3 — now live, not a stub) |
| Commercial | `/pricing`, `/demo` |
| Infrastructure | `/robots.txt`, `/sitemap.xml`, `/health` |

`/platform/co-design`, `/platform/knowledge`, `/platform/change`, and `/trust/*` were added in
PR #234 ("Phase 6 Track A"), merged as `e081fdd` — before this session, and confirmed still healthy
by this report's own verification run.

## 2. Domain/application separation

`apps/marketing` is architecturally independent of the product application, enforced by an
automated test (`test/foundation.test.tsx`'s "independent marketing foundation" suite) that scans
every source file and fails if it finds an import of the product frontend, its auth/session
libraries, or its authenticated API client. This is not a convention taken on faith — it is a
repo-wide grep enforced on every test run, and this session's own new `stories-api.ts` file (Track
B's marketing integration) was caught and had to satisfy it (see §3).

## 3. Customer story integration (Track B → Track A)

`apps/marketing/src/app/stories/page.tsx` previously rendered a hardcoded, always-empty array with
a comment anticipating "the public read-only stories endpoint the customer-learning track's
feedback-review workflow produces." That endpoint now exists
(`GET /api/v1/stories/published`, unauthenticated, built in this Phase 6 session — see the Customer
Learning report) and the page fetches it server-side, with a 5-minute ISR revalidation window and a
fail-closed empty-array fallback on any error. This is a real integration, not a mock: the full
propose → moderate → approve → publish pipeline was exercised live against real Postgres
(`customer-stories.live.test.ts`, 13 tests) and confirmed via a manual HTTP walkthrough during that
work.

## 4. Brand compliance

Marketing and product share one palette, one type-role contract, and one radius cap — enforced by
`apps/web/test/brand-contract.test.ts`, which diffs both apps' `globals.css` against the same
canonical Witness Brand Book v1.0 token table and fails if either drifts. This session's own PWA
work (Track C) fixed a real drift in the *product* app's manifest/icon colors against this same
table — evidence the check earns its keep, not just documentation.

## 5. Test status

`pnpm --filter @witness/marketing test`: **57 tests passing** (2 files) — `foundation.test.tsx`
(45 tests, including the new async-Server-Component render pattern this session's stories-page
change required) and `stories-api.test.ts` (12 tests, new this session — `resolveApiBaseUrl`'s
fail-closed validation and `fetchPublishedStories`'s fail-to-empty-array behaviour).
`pnpm --filter @witness/marketing lint` and `typecheck`: clean. `next build`: succeeds, `/stories`
correctly shows a 5-minute ISR revalidation window.

## 6. Remaining gaps

None found that block this phase. Noted, not blocking:

- Indexability (`WITNESS_MARKETING_INDEXABLE=true` + `WITNESS_MARKETING_ENV=production` +
  canonical-origin match, all three required) has not been exercised against a real production
  deployment in this session — the gate itself was not touched or re-verified here, only inherited.
- The new `WITNESS_MARKETING_API_URL` environment variable (server-only, Track B) needs adding to
  whatever deployment configuration provisions this app's environment — a deployment-ops follow-up,
  not a code gap.
