# Phase 6 Final Report

**Status:** Tracks A, B, C, D complete. Stopping here per the governing instruction — no AI-assisted
knowledge extraction, no native mobile development (ADR-0030 did not find it justified now), no new
infrastructure architecture.

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

Invitation/QR entry (`/join/[token]`), consent, Quick Capture (record/stop/submit, offline queue,
now with accidental-navigation protection and a manual retry action), mobile-first layout, capture-
token security (session-bound, expiring, non-enumerable, tested). **Ready as a browser/PWA
experience; not proven on physical hardware** — see Mobile Report §4-5. This is the one surface
where "ready" carries a real, named asterisk rather than a clean yes.

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

## D4 — Reports

Created this session:

- [`docs/release/PHASE6_MARKETING_REPORT.md`](PHASE6_MARKETING_REPORT.md)
- [`docs/release/PHASE6_CUSTOMER_LEARNING_REPORT.md`](PHASE6_CUSTOMER_LEARNING_REPORT.md)
- [`docs/release/PHASE6_MOBILE_REPORT.md`](PHASE6_MOBILE_REPORT.md)
- This roll-up.

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
  the mobile-first Quick Capture flow, offline queue, and capture-token security are real,
  reasonably hardened, and now better-protected than at the start of this session (three concrete
  defects fixed). **Not yet proven on physical hardware** — this is the one honest asterisk on an
  otherwise "yes," and it is named explicitly rather than absorbed into a confident-sounding
  overall verdict.
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

1. **Run `docs/testing/MOBILE_ACCEPTANCE.md` against real iPhone and Android hardware.** This is
   the single highest-value next action — everything else in this report is proven; this is not.
2. Decide whether the shared-device offline-queue count leak (Mobile Report §5, item 3) needs an
   architectural fix or is an accepted limitation for the expected deployment pattern (one
   participant, one device).
3. Add a maskable PWA icon variant once a real design asset exists for it.
4. Add `WITNESS_MARKETING_API_URL` to whatever deployment configuration provisions
   `apps/marketing`'s environment (an ops follow-up, not a code gap).
5. Only after (1): revisit ADR-0030's native triggers with real device-testing evidence in hand,
   rather than continuing to reason about them in the abstract.
