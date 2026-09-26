# Phase 6 Final Report

**Status:** Tracks A, B, C, D complete. Track E (live workshop participation, "close the co-design
loop") is implemented and automated-verified, but **not yet physically accepted** — see §D3.5. Phase
6 is not complete until that physical pass runs. Stopping here per the governing instruction — no
AI-assisted knowledge extraction, no native mobile development (ADR-0030 did not find it justified
now), no new infrastructure architecture.

This report rolls up [Marketing](PHASE6_MARKETING_REPORT.md),
[Customer Learning](PHASE6_CUSTOMER_LEARNING_REPORT.md), and [Mobile](PHASE6_MOBILE_REPORT.md) into
one honest, evidence-based acceptance judgement.

---

## D1 — Production surfaces, assessed from actual evidence

### Public (Track A)

Homepage, how-it-works, platform (evidence/decisions/institutional-memory/co-design/knowledge/
change), solutions (government/international-development/research/consultation), trust (data-
sovereignty/privacy/security), stories, pricing, demo — all real routes, confirmed by a clean
`next build` this session and 57 passing tests, architecturally isolated from the product app by an
automated repo-wide import scan. **Ready.**

### Organisation application

Confirmed present by this session's own `next build` route list: organisation onboarding
(`/organisations/new`), people/invitations (`/organisations/[id]/people`,
`/organisations/[id]/invitations`), multi-organisation collaboration (ADR-0028's external-
collaborator model, workspace invitations with the `returnTo` fix this session added),
programme/session management (`/workspaces/[id]/sessions/*`), review
(`/workspaces/[id]/review`, now with a testimonial micro-survey wired into its queue-cleared state),
Knowledge Graph (`/workspaces/[id]/knowledge/{concepts,domains,graph,review,stewardship}`),
reports (`/workspaces/[id]/sessions/[sessionId]/reports/*`, now with a feedback survey wired into
export), and billing (`/organisations/[id]/billing`, invoice settlement, agreements/renewals from
Phase 5). **Ready**, per the passing test suites for each of these areas (part of the monorepo's
1,654 total) — not independently re-verified end-to-end in this session beyond what Tracks B/C
touched directly.

### Participant

Invitation/QR entry (`/join/[token]`), consent, and — as of Track E — a prompt-aware live workshop
companion rather than an unlimited upload form: the facilitator's current agenda item is shown
explicitly, a submission moves through an honest sending → received/saved-on-device lifecycle, and a
deliberate three-way choice follows every contribution instead of funnelling straight back into
recording (`apps/web/src/app/capture/[sessionId]/page.tsx`). Offline queue, accidental-navigation
protection, and capture-token security (session-bound, expiring, non-enumerable, tested) are
unchanged from Track C. **Ready as a browser/PWA experience; not proven on physical hardware** — see
Mobile Report §4-5 and §D3.5 below. This is the one surface where "ready" carries a real, named
asterisk rather than a clean yes.

### Customer learning (Track B)

Private feedback at four completion moments, testimonial consent, governed moderation, separately-
authorised publication, live on the marketing stories page. **Ready**, with the moderate/publish
capability separation proven live over real HTTP, not just asserted.

## D2 — Engineering environment

Reference: ADR-0029. Reconfirmed this session, not reopened: `.github/workflows/ci.yml` runs a
dedicated `integration` job with real, disposable Postgres and Neo4j service containers per run,
executing the API, knowledge-graph, and graph-projector live suites. Local development does not
require the full integration stack for ordinary work — this session itself worked entirely against
one local Postgres container plus the dev-header auth path, with the Neo4j-dependent live suites
(16 tests, `@witness/knowledge-graph` + `@witness/graph-projector`) confirmed to skip cleanly
without one, exactly as designed, not silently failing. No defect found; nothing reopened.

## D3 — Honest mobile status

**Not fully proven.** The PWA is real, the fixes in Track C are real and tested, but zero physical
device has touched any of it. Per the governing instruction's own framing, the honest verdict for
mobile specifically is:

> **YES, WITH DOCUMENTED LIMITATIONS** — `docs/testing/MOBILE_ACCEPTANCE.md` names exactly what
> remains: a human running 22 rows on real iPhone and Android hardware, browser and installed-PWA
> flows, before "mobile-ready" can be said without a footnote.

## D3.5 — Track E: live workshop participation, "close the co-design loop"

Reshapes participant mobile capture from an unlimited upload form into a facilitator-driven
prompt/round companion, adds facilitator prompt controls and governed featured-insight curation, and
lets a participant respond to an emerging interpretation without ever mutating canonical Knowledge.
This is genuinely new product surface built after D1-D4 above, not a correction to them.

**IMPLEMENTED**

- Live workshop prompt-aware participant capture — current prompt shown explicitly (or "no active
  prompt" stated plainly), contributions preserve their prompt relationship
  (`Evidence.sourceAgendaItemId`).
- Backend-confirmed receipt lifecycle — sending → received/saved-on-device, never claimed before the
  server (or the local durable queue, for an offline save) actually confirms it.
- A deliberate post-contribution choice (add another / wait for the next question / I'm done for
  now) replacing a bare running count as the primary success signal.
- Facilitator prompt controls — activate/advance an agenda item, on the pre-existing
  `/workspaces/:id/live` page (built on, not duplicating, the Client-Ready Experience overhaul's
  agenda system).
- Governed featured/emerging insight flow — a facilitator curates which already-*confirmed*
  `KnowledgeAssertion`s the room sees as "what we're hearing," explicitly excluding anything
  rejected/superseded or still in candidate form.
- Participant knowledge-response flow — four governed response types (reflects/needs nuance/missing
  context/sees differently), append-only, never editing the assertion it reacts to.
- Survey suppression during active participation — the feedback/testimonial `MicroSurvey` now only
  appears once a participant chooses "I'm done for now" or the session closes, never immediately
  after an ordinary contribution.

**AUTOMATED VERIFIED** (this session)

- Domain: 686/686 tests (`packages/domain`), including
  `session-featured-insight.test.ts`/`participant-knowledge-response.test.ts`.
- Gateway unit: 758/758 tests (`services/api-gateway`), including `contracts-drift.test.ts` (45) and
  the role-grants/policy-csv parity check.
- Gateway live-Postgres: 61/61 tests, including the new
  `session-featured-insights.live.test.ts` (12) proving: facilitator curate/remove, session/
  workspace boundary enforcement, rejected-assertion refusal, duplicate-feature refusal, the
  participant-safe view's shape (no facilitator identity), governed response persistence with the
  canonical `KnowledgeAssertion` proven byte-identical before/after a response, authz gating
  (`session_featured_insight:manage`/`participant_knowledge_response:read`), and the room-view's
  agenda-item/evidence aggregation with no participant identity in the payload.
- Frontend unit: 44/44 tests (`apps/web`), including a new 14-test suite
  (`test/live-workshop.test.ts`) covering the receipt-transition, next-action-choice,
  session-end-state, and prompt-return state machines directly.
- `tsc --noEmit` clean on `@witness/domain`/`@witness/api`/`@witness/web`; ESLint clean on every
  touched file; `next build` (production) succeeds.

**PHYSICAL VERIFIED**

None yet for Track E specifically. (Rows 1-4 of the pre-existing iPhone browser flow — join, guest
entry, consent rendering — were physically verified during Track C/MOBILE-001/002 work and remain
valid; they are not re-litigated here.)

**PHYSICAL PENDING**

The entire Track E end-to-end mobile flow — `docs/testing/MOBILE_ACCEPTANCE.md`'s new "Track E — live
workshop flow" table, rows 23-47 — is marked **PHYSICAL PENDING** on the same iPhone 13/iOS 26.6.1/
Safari baseline as the rest of that sheet, until a human runs it. A fixture and operator runbook are
ready (`services/api-gateway/prisma/seed-live-workshop-acceptance.ts`,
`docs/testing/LIVE_WORKSHOP_ACCEPTANCE_RUNBOOK.md`) but running them is not the same as running the
test — **Phase 6 is not complete until that physical pass happens.**

## D4 — Reports

Created this session:

- [`docs/release/PHASE6_MARKETING_REPORT.md`](PHASE6_MARKETING_REPORT.md)
- [`docs/release/PHASE6_CUSTOMER_LEARNING_REPORT.md`](PHASE6_CUSTOMER_LEARNING_REPORT.md)
- [`docs/release/PHASE6_MOBILE_REPORT.md`](PHASE6_MOBILE_REPORT.md)
- This roll-up.

Added this session (Track E):

- [`docs/testing/MOBILE_ACCEPTANCE.md`](../testing/MOBILE_ACCEPTANCE.md) — new "Track E — live
  workshop flow" table (rows 23-47).
- [`docs/testing/LIVE_WORKSHOP_ACCEPTANCE_RUNBOOK.md`](../testing/LIVE_WORKSHOP_ACCEPTANCE_RUNBOOK.md)
  — the exact operator steps for the physical pass.

## D5 — The final question, answered directly

> Can a new organisation discover Witness, understand it, onboard, run a multi-organisation
> co-design, collect evidence from real participants using phones, review it, understand emerging
> knowledge, report, manage its commercial relationship, and provide feedback — without requiring
> the founder to manipulate infrastructure or data?

**YES, WITH DOCUMENTED LIMITATIONS.**

Supporting each clause:

- **Discover, understand:** yes — the public marketing site (Track A) is complete, tested,
  architecturally independent, and includes real customer stories once published (Track B).
- **Onboard, multi-organisation co-design:** yes — ADR-0028's model is in production use (the
  Cloudflare pilot organisations referenced in this repository's own memory/project history), and
  this session added nothing that weakens it.
- **Collect evidence from real participants using phones:** yes, *as a browser/PWA experience* —
  the mobile-first live workshop companion (Track E), offline queue, and capture-token security are
  real, automated-verified, and now prompt-aware with a backend-confirmed receipt lifecycle rather
  than an unlimited upload form. **Not yet proven on physical hardware** — this is the one honest
  asterisk on an otherwise "yes," and it is named explicitly rather than absorbed into a
  confident-sounding overall verdict. See §D3.5.
- **Review, understand emerging knowledge, report:** yes — Knowledge Graph, review queue, and
  reporting surfaces are in production use from Phase 5 and earlier phases, untouched in a way that
  would regress them this session (full monorepo suite green throughout).
- **Manage its commercial relationship:** yes — billing, invoicing, agreements/renewals from
  Phase 5, unmodified this session.
- **Provide feedback:** yes — this is what Track B built: private feedback, governed testimonial
  consent, moderation, and publication, proven end-to-end including the specific authorization
  separation (organisation admin ≠ marketing publisher) the instructions were explicit about.
- **Without the founder manipulating infrastructure or data:** yes, with one named exception —
  this session itself had to clean up an orphaned, uncommitted database migration left by a prior
  session's lost work (Customer Learning Report §0) and a stale worktree registry (git-level
  bookkeeping, not customer-facing). Neither required touching customer data; both are recorded
  honestly rather than smoothed over.

## Recommended Phase 7

Not AI extraction — the governing instruction is explicit that this phase does not open that door,
and this report does not either. In order of what would most reduce the one real asterisk above:

1. **Run `docs/testing/MOBILE_ACCEPTANCE.md` against real iPhone and Android hardware, including
   the new Track E rows (23-47).** This is the single highest-value next action, and the one
   remaining gate on declaring Phase 6 complete — everything else in this report is proven; this is
   not. Use `docs/testing/LIVE_WORKSHOP_ACCEPTANCE_RUNBOOK.md`.
2. Decide whether the shared-device offline-queue count leak (Mobile Report §5, item 3) needs an
   architectural fix or is an accepted limitation for the expected deployment pattern (one
   participant, one device).
3. Add a maskable PWA icon variant once a real design asset exists for it.
4. Add `WITNESS_MARKETING_API_URL` to whatever deployment configuration provisions
   `apps/marketing`'s environment (an ops follow-up, not a code gap).
5. Only after (1): revisit ADR-0030's native triggers with real device-testing evidence in hand,
   rather than continuing to reason about them in the abstract.
6. **Only after (1) confirms Track E's physical flow: consider whether/how AI-assisted extraction
   fits the now-proven prompt/round model.** Explicitly out of scope for this phase and not started
   here — the governed featured-insight/participant-response flow was built entirely on
   human-curated `KnowledgeAssertion`s, by design (see D3.5).
