# Phase 6 Mobile Report — Track C

**Status:** Complete, with a documented physical-device verification gap that remains open on
purpose (see §5). Built on `phase6/customer-learning`, commits `1fd7ed5`..`c95eda8`.

## 1. ADR decision

**[ADR-0030](../../architecture/decisions/ADR-0030-mobile-participation-strategy.md): Responsive
web / PWA is the mobile participation strategy now. No native companion is built in this phase.**

This ratifies rather than invents a direction: an audit of the actual code (not prior planning
assumptions) found a real, working, previously-undocumented PWA already existed —
`apps/web/src/app/manifest.ts` (populated manifest), `apps/web/public/sw.js` (a narrowly-scoped,
cache-first-for-static-assets-only service worker), and genuinely mobile-first Quick Capture
(`apps/web/src/app/capture/[sessionId]/page.tsx`, `apps/web/src/components/audio-recorder.tsx`).
Track C's job was substantially "complete and fix what exists," not "build from scratch."

## 2. What was fixed

| Gap found | Fix | Commit |
|---|---|---|
| Manifest `theme_color`/`background_color` and the app icon used an arbitrary blue matching no Brand Book token | Corrected to the real `ink`/`paper` tokens; three PNG icons regenerated from the corrected source SVG at their existing sizes | `3d29fb7` |
| No explicit `viewport`/`themeColor` Metadata export | Added, with `viewportFit: 'cover'` for notched-phone safe areas | `3d29fb7` |
| `offline-queue.ts`'s `enqueue()` had no error handling — an IndexedDB quota/unavailable failure during a network-drop retry silently lost the recording | Wrapped, surfaces a clear message instead | `2e1f256` |
| No manual retry for queued offline contributions | Added a "Retry now" action | `2e1f256` |
| No protection against losing an in-progress/unsubmitted recording to accidental navigation or backgrounding | Added a `beforeunload` guard for the whole non-idle recorder lifecycle | `2e1f256` |
| OIDC callback always redirected to the generic app root — never back to the specific invitation a `verified_guest`/`invited_only` participant signed in from (a real, previously-documented limitation) | `returnTo` path preserved through the OIDC `state` round-trip, validated root-relative-only both at write and read time (`isSafeReturnPath`) so it cannot become an open redirect | `67a4efd`, `2e1f256` |

## 3. Native triggers (from ADR-0030 — not repeated in full here)

Native is reconsidered, not automatically built, if: iOS Safari loses/corrupts a recording under a
realistic interruption; a long offline recording cannot be safely preserved; background upload
becomes operationally necessary; repeat users materially need more than "add to home screen";
push notifications become operationally important; a customer requires MDM-distributed apps;
fully-offline field deployments become core; or browser storage limits cause measurable evidence
risk at real recording volumes. None have fired.

## 4. What is verified vs. assumed

**Verified in this session:**

- `pnpm typecheck`/`lint`: clean across all 12 workspace packages.
- `next build` (both `apps/web` and `apps/marketing`): succeeds.
- 1,654 automated tests passing (1,605 unit + 49 live-Postgres), including a new manifest/
  service-worker correctness suite (7 tests) and the auth `returnTo` suite (13 tests across service
  and controller).
- A real HTTP walkthrough of the OIDC `returnTo` round-trip against the dev-header path and the
  real gateway.

**Not verified — explicitly, not by omission:**

- **No physical iOS or Android device has touched any part of this work.** No environment used to
  build Witness, including this one, has real mobile hardware or a device-farm connection.
  `docs/testing/MOBILE_ACCEPTANCE.md` is a 22-row executable manual sheet (per platform, browser
  and installed-PWA flows) — every row is blank, on purpose, because no human has run it yet.
- The audio-codec fallback chain (`pickRecordingMimeType`) that matters most for iOS Safari has
  never been exercised against real Safari, or by any automated mobile-browser test — there is no
  Playwright/e2e suite in `apps/web` at all. This is the single largest real unknown this report
  can name and does not pretend to have closed.
- Interruption recovery (app-switch, screen lock, incoming call mid-recording) — same status.

## 5. Unresolved mobile risks (honest, not hedged)

1. iOS Safari real-device recording behaviour — unverified (see §4).
2. Interruption recovery — unverified (see §4).
3. **Shared-device queue-count leak, found and documented but not fixed:** the offline-queue status
   line ("N waiting to send") filters by session, not by individual capture token. On a literally
   shared/kiosk device used by two different participants in the same session, the second person
   may see a leftover *count* from the first — no contribution content is exposed, only a number.
   Judged not worth an architecture change under this phase's scope; flagged for whoever owns the
   shared-device use case to decide whether it needs fixing.
4. No maskable PWA icon variant exists — correctly padding one for Android's adaptive-icon system
   needs a real design asset, not a code change, and was not fabricated here from the flat icon.
5. The authenticated admin app's navigation remains CSS-wrap/horizontal-scroll only — an accepted
   gap per this track's own user-type split (organisation admin work is web-first by design, not
   mobile-first), not an oversight.

## 6. Test status

7 manifest/service-worker tests + 13 `returnTo` tests (5 `isSafeReturnPath` + 4 service-level +
2 controller-level, the remainder already counted in the pre-existing 86 auth tests) — all new this
track, all passing, part of the monorepo's 1,654-test total.
