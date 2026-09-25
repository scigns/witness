# Mobile participation — physical-device acceptance sheet

Phase 6, Track C (ADR-0030). This is an **executable manual test sheet**, not a
report of results — no automated environment used to build Witness (including the one that wrote
this document) has physical iOS/Android hardware or a device-farm connection. Every row below must
be run by a human, on real hardware, before "mobile-ready" can be claimed as proven rather than
"designed to work, unverified against real devices" — see `ADR-0030`'s own Consequences → Negative
for why that distinction matters and is not being quietly dropped.

**Do not fill in a result you did not personally observe.** A blank row is honest. A guessed row is
not.

## How to run this

1. Get a real invitation/QR link into a real co-design session (ask an engineer to create a test
   session with `anonymous` or `pseudonymous` governance mode — no real participant data).
2. Work through each row on each device/browser combination below, in order.
3. Record the exact result, not a summary — "recorded 5:03, uploaded, playback confirmed" beats
   "worked".
4. If a step fails, stop that device's run at the failure, file it as a defect (link it in the
   table), and continue with the *next* device rather than the next step on the same one.
5. Update this file directly with results — it is the record, not a separate spreadsheet.

## iPhone

| Field | Value |
|---|---|
| Device model | |
| iOS version | |
| Browser | Safari |
| Browser version | |
| Tester | |
| Date | |

### Browser flow (no install)

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 1 | Open the invitation/QR link | Session context (title, facilitator, governance mode) loads before any action is required | | |
| 2 | Authentication/guest entry (per governance mode) | `anonymous`/`pseudonymous`: no sign-in; `verified_guest`/`invited_only`: real Keycloak sign-in | | |
| 3 | Session return after sign-in (only for modes that sign in) | Lands back on the same invitation, not the generic app root (ADR-0030's `returnTo`) | | |
| 4 | Consent | Required categories shown in plain language before recording is available | | |
| 5 | Microphone permission | iOS permission prompt appears; granting it enables the record control | | |
| 6 | Record 10 seconds | Timer visible, large tap target, no visual glitch | | |
| 7 | Record 5 minutes | Recording continues without silent failure; elapsed timer stays accurate | | |
| 8 | Playback | The `<audio controls>` preview plays back what was actually recorded | | |
| 9 | Upload | Submits and shows a clear success/queued state | | |
| 10 | Network interruption mid-recording | Turn on Airplane Mode mid-recording, then off before stopping — recording is not lost | | |
| 11 | Network interruption during upload | Turn on Airplane Mode after pressing Submit — item queues rather than silently failing | | |
| 12 | Reconnect | Turn Airplane Mode off — queued item sends automatically, or via "Retry now" | | |
| 13 | Duplicate submit | Press Submit twice quickly (or retry after a slow response) — exactly one contribution appears, never two | | |
| 14 | Photo upload | A photo can be attached/submitted as evidence | | |
| 15 | Document upload | A document (PDF or similar) can be attached/submitted as evidence | | |
| 16 | Switch app during recording | Background Safari mid-recording (e.g. check another app), return — recording state and `beforeunload`-style protection behave sensibly | | |
| 17 | Lock device during recording | Lock the screen mid-recording, unlock — confirm whether the recording survived or was lost | | |
| 18 | Incoming call/interruption (if safely testable) | An incoming call during recording does not silently corrupt or lose the recording | | |
| 19 | Close/reopen Safari with a pending offline item | Force-close Safari with an item still queued, reopen the link — the queued item is still there and still sendable | | |

### Installed PWA flow

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 20 | Install ("Add to Home Screen") | Correct name, icon, and splash color (Brand Book ink/paper, not the old placeholder blue) | | |
| 21 | Launch from home screen | Opens standalone (no Safari chrome), lands on the intended page | | |
| 22 | Repeat steps 5-15 inside the installed PWA | Same behaviour as the browser flow | | |

## Android

| Field | Value |
|---|---|
| Device model | |
| Android version | |
| Browser | Chrome |
| Browser version | |
| Tester | |
| Date | |

### Browser flow (no install)

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 1 | Open the invitation/QR link | Session context loads before any action is required | | |
| 2 | Authentication/guest entry | Per governance mode, as above | | |
| 3 | Session return after sign-in | Lands back on the same invitation | | |
| 4 | Consent | Required categories shown before recording is available | | |
| 5 | Microphone permission | Chrome permission prompt appears; granting it enables recording | | |
| 6 | Record 10 seconds | Timer visible, large tap target | | |
| 7 | Record 5 minutes | No silent failure over the longer duration | | |
| 8 | Playback | Preview plays back correctly | | |
| 9 | Upload | Clear success/queued state | | |
| 10 | Network interruption mid-recording | Toggle Airplane Mode mid-recording — not lost | | |
| 11 | Network interruption during upload | Toggle Airplane Mode after Submit — queues rather than fails silently | | |
| 12 | Reconnect | Queued item sends automatically or via "Retry now" | | |
| 13 | Duplicate submit | Exactly one contribution, never two | | |
| 14 | Photo upload | Works | | |
| 15 | Document upload | Works | | |
| 16 | Switch app during recording | Recent-apps switch mid-recording, return — sensible state | | |
| 17 | Lock device during recording | Lock/unlock — confirm survival or loss | | |
| 18 | Incoming call/interruption (if safely testable) | No silent corruption/loss | | |
| 19 | Close/reopen Chrome with a pending offline item | Queued item survives a real app-close, not just a tab switch | | |

### Installed PWA flow

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 20 | Install ("Add to Home Screen" / native install prompt) | Correct name, icon (maskable-safe on Android's adaptive-icon system), theme color | | |
| 21 | Launch from home screen | Opens standalone, lands on the intended page | | |
| 22 | Repeat steps 5-15 inside the installed PWA | Same behaviour as the browser flow | | |

## Known, already-flagged risks to watch for specifically

These are not blind spots — they are the exact things the accompanying audit (ADR-0030) could not
verify without this sheet, so pay particular attention to them:

- **Row 6-8 (iPhone), audio codec.** `audio-recorder.tsx`'s codec fallback chain tries WebM/Opus
  first (iOS Safari does not support it) and only reaches `audio/mp4` last. If playback sounds
  wrong, is silent, or the file is unexpectedly large/small, that is this exact risk surfacing —
  file it as a defect referencing `ADR-0030`, don't just note "audio seemed off."
- **Row 16-17, interruption recovery.** No automated test anywhere exercises this. A lost recording
  here is not a minor bug — see ADR-0030's Native Trigger #1.
- **Row 13, duplicate submission.** The idempotency guarantee is real and DB-enforced
  (`@@unique([sessionId, clientRequestId])`) — a genuine duplicate here would be a serious defect,
  not a cosmetic one.
- **Shared-device note (not a row above, check manually if testing on a shared/kiosk device):** the
  offline-queue status line ("N waiting to send") is scoped by session, not by the individual
  capture token — on a device two different participants use one after another in the *same*
  session, the second person may see a leftover count from the first. No contribution *content* is
  exposed by this, only a count. Documented, not yet fixed — see the Track C mobile report.

## Do not claim success for a row not executed

An empty "Result" cell means "not run," not "assumed fine." The final Phase 6 mobile report quotes
this table directly — do not backfill optimistic results after the fact.
