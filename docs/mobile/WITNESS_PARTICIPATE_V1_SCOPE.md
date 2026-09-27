# Witness Participate — v1 product scope

**Owner:** Engineering (Mobile release programme)
**Status:** Active — authoritative scope for the first store-distributable release

This is the scope decision, not the audit (`WITNESS_PARTICIPATE_CURRENT_STATE.md`) and not the
runtime decision (`ADR-0031`). It exists so "what ships in v1" has one place to be stated, checked
against, and updated — rather than being inferred from a scattering of commit messages.

## IN — v1

- Session join via a Witness invitation link / QR-scanned deep link.
- Session context (title, facilitator, governance mode) shown before any action is required.
- All four governance modes behave per their existing server-authoritative semantics — see
  `PARTICIPANT_API_CONTRACT.md`'s governance table. No new mode, no weakened mode.
- Consent review and grant, server-enforced, never assumed.
- **Text evidence contribution.**
- **Audio evidence contribution**, reusing the existing recorder/codec-negotiation logic.
- Current facilitator prompt display, and preserving the prompt/evidence relationship on submission.
- The existing "what we're hearing" featured-insight read and community-validation response flow
  (Track E) — already built server-side, already governed, already tested; excluding it from the
  mobile client would be removing working functionality, not scoping it out.
- Offline queue with deterministic, honestly-labelled submission status
  (local/queued/uploading/submitted/failed) and idempotent, non-duplicating retry.
- Deep links (iOS Universal Links, Android App Links) for the canonical join URL.
- Secure, platform-appropriate storage of the participant's own capture token.
- A real, signed-toward-TestFlight iOS build and a real, signed-toward-Play-internal-testing Android
  build.

## OUT of v1 — explicit fast-follow, not removed

- **Photo and document capture UI.** The backend attachment contract already supports `audio`,
  `document`, and `image` (`packages/domain/src/evidence-attachment.ts`'s `ATTACHMENT_KINDS`,
  `POST /api/v1/participant-capture/evidence/:evidenceId/attachment` in
  `PARTICIPANT_API_CONTRACT.md`) — **nothing is removed, weakened, or rewritten in that contract by
  this decision.** Only the *mobile client UI* for photo/document capture is deferred. Tracked as its
  own fast-follow epic (see below) so it does not silently disappear from the roadmap.
  - **Why deferred:** it is the one v1 capability that would add its own permission (camera),
    its own store privacy declaration, its own attachment-retry semantics, and its own physical-device
    test matrix — none of which gate the first store-distributable release, and all of which are
    real, non-trivial scope on their own.
  - **Why safe to defer:** text already provides the required non-audio contribution path (§ IN
    above); audio remains the primary rich-contribution path.
- Facilitator/admin capabilities of any kind — not merely hidden, structurally absent (see
  `WITNESS_PARTICIPATE_CURRENT_STATE.md` §14 and `PARTICIPANT_API_CONTRACT.md`'s closing section).
- Permanent participant-account creation. No governance mode in the current server implementation
  *requires* a newly-invented identity system to satisfy this product — `verified_guest`/
  `invited_only` already use real, existing OIDC sign-in; `anonymous`/`pseudonymous` need no account
  at all. If a future governance mode is added that genuinely requires one, that is a backend/domain
  decision with its own ADR, not something this mobile client invents unilaterally.
- In-app QR scanning (a custom camera-based scanner). v1 relies on the phone's own Camera app opening
  a Universal/App Link — this is both simpler and avoids requesting camera permission for no reason
  in a build that otherwise needs only microphone. Revisit only if this is shown to be a real adoption
  friction point.

## Fast-follow tracking

- **Witness Participate — photo/document capture** — tracked as its own GitHub issue (see
  `docs/mobile/MOBILE_RELEASE_GATES.md` for how this interacts with the release gates: it is
  explicitly not a gate for v1 store submission).

## What this scope decision does not change

- `packages/domain`'s `ATTACHMENT_KINDS`, the attachment endpoint, and its consent gating
  (`audio_recording` vs `evidence_submission`, kept genuinely distinct) are untouched.
- `apps/web`'s existing facilitator-side evidence review already handles document/image attachments
  from other sources (bulk upload, etc.) — that is unaffected; this scope decision is about the
  **participant mobile client** only.
