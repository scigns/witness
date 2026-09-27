# Offline storage design — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — implemented; IndexedDB-without-native-bridge decision to be revisited only on physical-device evidence

Two genuinely different kinds of local data, deliberately kept in two
different stores, with two different security properties. Conflating them —
storing everything in "whatever Capacitor storage is easiest" — was the
mistake this design specifically avoids.

## The two stores

| | Credential storage | Offline evidence queue |
|---|---|---|
| **What** | `CaptureSession` (session id, workspace id, participant id, capture token) | Queued text/audio contributions awaiting submission |
| **Where** | OS Keychain / Keystore, via `secure-capture-session-store.ts` — see `SECURE_TOKEN_STORAGE.md` | IndexedDB, via `@witness/participant-client`'s `offline-queue.ts`, unchanged from `apps/web`'s |
| **Size per item** | A few short strings | Up to several MB per audio recording |
| **Sensitivity** | High — the capture token is a bearer credential | Lower — a participant's own not-yet-submitted contribution, which they typed or recorded on this device moments ago |
| **Lifetime** | Until explicit deletion (see `SECURE_TOKEN_STORAGE.md`) | Until the item is confirmed submitted, then removed |

Never the reverse: the evidence queue never holds the capture token as its
*own* long-lived record — each queued item carries the capture token it needs
to retry with (`QueuedParticipantContribution.captureToken`), but that's
IndexedDB, not Keychain/Keystore. This is an accepted, bounded exposure, not
an oversight — see "IndexedDB and the queued token" below.

## Why IndexedDB, not a native filesystem bridge, for v1

The governing instruction asked this to be evaluated, not assumed: does a
Capacitor WebView need a native filesystem bridge for offline audio storage,
given that "avoid putting large binaries into a key/value Preferences store"
is real advice for *some* mobile storage mechanisms?

It does not, for this app, because:

- IndexedDB (not Preferences) is what `@witness/participant-client`'s
  `offline-queue.ts` already uses — inherited unchanged from `apps/web`,
  where it already stores audio `Blob`s directly as IndexedDB values
  (`QueuedParticipantContribution.attachment.blob: Blob`).
- IndexedDB with native `Blob` support is present in the WebView on both
  platforms Capacitor targets (Chromium-based `WebView` on Android, `WKWebView`
  on iOS) — this is standard web-platform capability, not something Capacitor
  itself needs to add.
- A native filesystem bridge would mean a second, parallel queue
  implementation (native-side file writes plus a native-side metadata store)
  purely to hold the same kind of data IndexedDB already holds correctly —
  directly against "participant logic should not be duplicated
  unnecessarily between web and native clients."

Per the governing instruction's own framing, this is deferred until real
evidence says otherwise, not decided permanently: if physical-device testing
(`PHYSICAL_DEVICE_ACCEPTANCE.md`) surfaces IndexedDB `Blob` reliability or
quota problems specific to a real device WebView, a native bridge becomes the
next thing to build — the `CaptureSessionStore`-style port/adapter split
already used for credentials would extend the same way to the queue if that
day comes. It has not been needed yet.

## Queue contents and lifecycle (unchanged from the web app)

`enqueue` / `listAll` / `listForSession` / `listForParticipantSession` /
`updateStatus` / `remove` — the full contract is `offline-queue.ts`'s, tested
in `packages/participant-client/src/offline-queue.test.ts` (8 tests: same-id
re-enqueue overwrites rather than duplicates; distinct ids produce distinct
items; `pending → syncing → synced` transitions are deterministic; an
unrecoverable error moves an item to `failed`, never to `synced`; updating a
nonexistent id is a no-op, not an error; `remove()` actually removes;
`listForParticipantSession` never leaks a different session's items;
`isNetworkFailure` is true only for a genuine network failure, not any
non-2xx response).

Each queued item preserves exactly what a retry needs:
`clientRequestId` (the id itself, doubling as the idempotency key — a retried
submission with the same id can never create duplicate evidence, see
`participant-capture.live.test.ts`'s "THREAT: an idempotent retry... never
creates a second evidence row"), evidence-state (`status`), a file reference
(the `Blob` itself, held directly), and retry metadata (`lastError`,
`createdAt`). A confirmed-submitted item is removed from the queue
immediately (`CaptureScreen`'s `flushQueue`) — it is never left around
"just in case," so sensitive queued evidence (an unsubmitted audio
recording, potentially of someone's own voice describing something
sensitive) does not linger on the device once the server has it.

## IndexedDB and the queued capture token

Each queued item carries the capture token needed to retry it. This is a
narrower exposure than it might sound:

- The token was already resident in this WebView's JavaScript memory to
  perform the *original* submission attempt that failed — queuing does not
  expose it to anything that couldn't already see it.
- It is the same value already held in the (separately protected) secure
  credential store for the same session — queuing a second copy does not
  create a new secret, only a second copy of an existing one, for the
  duration that item remains queued (typically until the device is back
  online, then removed).
- It is scoped to exactly the session/participant that created it — the
  cross-session/cross-participant isolation `offline-queue.test.ts` proves
  applies here too.

## What this design does not claim

**No claim of encryption for the offline queue.** Unlike the credential
store, IndexedDB in a WebView is not encrypted at rest by this app, and this
document does not claim otherwise — see the governing instruction's "do not
claim encryption unless proven." The data it holds (a participant's own
not-yet-submitted text or audio contribution, plus the token to submit it
with) is judged an acceptable local-at-rest risk for the same reason the
capture token's own lingering-on-iOS-after-deletion risk is (`SECURE_TOKEN_STORAGE.md`):
bounded by server-side session/participant state, transient (removed on
confirmed submission), and never containing organisation-privileged data —
this queue holds only what one participant contributed, from their own
device, never anything a facilitator, another participant, or the
organisation could not have simply asked this participant for directly.
