# Phase 6 Customer Learning Report — Track B

**Status:** Complete. Built in this Phase 6 session, on `phase6/customer-learning`
(`/private/tmp/witness-phase6-learning`), commits `3721056`..`a4518d6`.

> **Track E addendum (later in this phase):** `ProductFeedback`/`CustomerStory` above are about
> Witness's *own* customers giving feedback on the product. Track E built a related but distinct
> concept — participants inside a live workshop responding to the *session's* emerging
> understanding (`ParticipantKnowledgeResponse`, `SessionFeaturedInsight`) — reusing this track's
> append-only, never-mutates-what-it-reacts-to discipline, not its `ProductFeedback` model directly.
> See [`PHASE6_FINAL_REPORT.md`](PHASE6_FINAL_REPORT.md)'s §D3.5 for what's implemented/automated-
> verified/physical-pending.

## 0. What this session actually started from

Before any code was written, an exhaustive check found the branch this work resumed on was
byte-identical to `main` — no `ProductFeedback`/`CustomerStory` code existed anywhere in git
history, dangling objects, or stashes, despite a resume prompt describing a prior session's
progress. A *different*, incompatible schema (flat `user_id`/`status` fields, no workspace scoping,
no separated publish capability) had been applied directly to the shared development Postgres by
whatever ran before, never committed to git. That orphaned migration was dropped and this track was
built fresh, against the explicit spec given in this session. Recorded here so the discrepancy is
not silently forgotten.

## 1. ProductFeedback

A private, create-only micro-survey response (`packages/domain/src/product-feedback.ts`) — no
function anywhere transitions or mutates one after creation, which is what makes "the original
feedback is never altered by anything downstream" structurally true rather than merely intended.
Captured at four completion moments, each locked to one product area
(`MOMENT_PRODUCT_AREA_MISMATCH` rejects a mismatched pairing even if forged directly):

| Moment | Product area | Where |
|---|---|---|
| `participant_capture_success` | `evidence_capture` | `apps/web/src/app/capture/[sessionId]/page.tsx`, after a successful contribution |
| `facilitator_recap` | `facilitation` | `.../sessions/[sessionId]/recap/page.tsx`, the session's terminal page |
| `reviewer_queue_cleared` | `review` | `.../workspaces/[id]/review/page.tsx`, the queue-cleared empty state |
| `report_export_success` | `reporting` | `.../reports/[reportId]/page.tsx`, after a successful "Take a copy" |

## 2. CustomerStory — governed testimonial publication

`packages/domain/src/customer-story.ts` models the full lifecycle: private feedback → candidate →
permission confirmed → moderation → approved → published, with rejected/withdrawn/unpublished as
explicit side branches. `proposeCustomerStory` refuses to create a row for non-positive feedback
even if called directly, bypassing the UI entirely — not just a client-side gate.

**The moderate/publish separation is real, not cosmetic.** `customer_story:moderate` (curate
wording, approve, reject) is an ordinary workspace `reviewer`/`admin` capability.
`customer_story:publish` is registered in `PLATFORM_ONLY_ACTIONS`
(`services/api-gateway/src/authz/policy-enforcement.service.ts`), which routes through
`RoleResolutionService.platformGrantTiers` — a query that structurally cannot be satisfied by any
organisation- or workspace-scoped `RoleAssignment`, however the policy tables are written. The
capability is grantable today via the pre-existing `POST /api/v1/platform/role-assignments` API
(no new role-assignment infrastructure was built). Verified two ways:

- **Live, at the service/policy layer** (`customer-stories.live.test.ts`, item 3): a real
  workspace-scoped admin `RoleAssignment` is denied `customer_story:publish`; a real
  `scopeType: 'platform'` assignment is granted it.
- **Live, over real HTTP** during this session: the full propose → edit wording → approve pipeline
  was run against a real, pre-existing seed workspace via `curl` with the dev-header auth path;
  attempting to publish with a dev-header `admin` role was correctly rejected with
  `VERIFIED_OPERATOR_REQUIRED` (401) — platform authority is unreachable through the unverified
  development header by design, the same protection `payment:settle`/`platform_role:*` already had.

## 3. Micro-surveys

`apps/web/src/components/micro-survey.tsx` — a dismissible, non-blocking card (never covering the
action just completed), 14-day cooldown scoped per product area
(`apps/web/src/lib/survey-suppression.ts`, pure functions against a minimal `Storage` interface,
6 tests). Positive feedback (rating ≥ 4) reveals a nested testimonial-consent step — No thanks /
Yes with my name / Yes anonymously, no preselected default, plus a separate, unchecked-by-default
"may we also name your organisation?" opt-in.

## 4. Moderation & publication page

`apps/web/src/app/workspaces/[id]/customer-stories/page.tsx` — pending/approved/published/
rejected-withdrawn groups; edit wording, approve, reject always available to a moderator; publish/
unpublish rendered only when the server's `canPublish` flag is true, and the server enforces the
same gate independently regardless of what the UI shows.

## 5. Security & privacy properties (tested, not assumed)

- Cross-tenant isolation: a story belonging to workspace A is unreachable (404, not silent success)
  from workspace B (live test #11).
- Anonymous consent never exposes an attributed name on the public card (live test #10).
- Ownership: only the person who submitted feedback may consent to a testimonial from it — checked
  both for authenticated actors and for unauthenticated capture-token participants
  (`requireOwnFeedback`, mirroring the pre-existing `requireOwnEvidence` pattern).
- Every mutating action (propose, edit, approve, reject, publish, unpublish, consent withdrawal)
  appends a queryable audit event (live test #12).
- The original `ProductFeedback` row is byte-identical before and after a full
  propose→edit→approve→publish→unpublish sequence (live test #4).

## 6. Test status

- Domain: 40 unit tests (`product-feedback.test.ts`, `customer-story.test.ts`), part of the
  package's 664 total.
- Contracts drift (licence-boundary enum parity): 44 tests, part of `@witness/api`'s suite.
- Live-Postgres acceptance: **13/13 tests**, covering all 12 items from the original acceptance
  script plus a structural-refusal test.
- Frontend: 6 pure-function suppression tests.
- Full monorepo: 1,654 tests passing (1,605 unit + 49 live) as of the last commit on this track.

## 7. Known, named gaps

- **No fake-Prisma unit-test layer for `ProductFeedbackService`/`CustomerStoriesService`.** A
  deliberate scope call, not an oversight: the live-Postgres suite already exercises the real
  service+domain+DB integration with high fidelity, and the marginal value of a third, redundant
  test layer was judged lower than finishing the full user-facing loop, per the phase's own
  "finish the user-facing experience first" instruction.
- **No interactive browser test of the `MicroSurvey`/moderation-page components.** No browser
  automation was available in this environment for that check; typecheck, lint, production build,
  and a full backend HTTP walkthrough stand in its place, but this is not the same as a human or a
  real browser exercising the rendered UI.
- **Self-moderation is workspace-scoped by design, publication is not** — an organisation's own
  admin can approve a candidate story, but only a platform-scope role holder can make it public.
  This is the intended separation this track was built to guarantee, not a residual gap.
