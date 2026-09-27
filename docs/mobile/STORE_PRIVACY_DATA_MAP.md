# Store privacy data map — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — data inventory complete; HUMAN/LEGAL REVIEW REQUIRED items open, see below

What this app actually collects, sends, and stores, for Apple App Store
Privacy Nutrition Label and Google Play Data Safety form preparation.

**No legal claims are made in this document.** Rows marked
**HUMAN/LEGAL REVIEW REQUIRED** need product/privacy/legal sign-off before
the actual store forms are submitted — this table states verified technical
fact (what the code does), not the legal characterisation of that fact.

**No analytics SDK, no advertising SDK, and no crash-reporting SDK are
included in this app.** There is nothing in this table under those
categories because nothing collects that data — not because it was collected
and omitted.

## Data inventory

| Data | Collected | Sent to server | Stored locally | Persistent | Linked to participant | Shared externally | Purpose | Deletion |
|---|---|---|---|---|---|---|---|---|
| Join token | Yes (from a deep link/QR) | Yes (in the join URL path) | No — held in memory only during the join flow, never persisted | No | No (a join link is not participant-specific until joined) | No | Identify which session a join request is for | Discarded once join succeeds or fails; never written to disk |
| Capture token | Yes (issued by the server on join) | Yes (every participant-capture request, as `X-Witness-Capture-Token`) | Yes — OS Keychain (iOS) / Keystore-encrypted (Android); see `SECURE_TOKEN_STORAGE.md` | Yes, until explicit deletion | Yes — one participant, one session | No | Authenticate this device's participant-capture requests for one session | Deleted when the server authoritatively rejects it (expired/revoked/withdrawn); see `SECURE_TOKEN_STORAGE.md`'s lifecycle section |
| Display name | Only if the session's governance mode requires one (`pseudonymous`) | Yes (in the `joinSession` request) | Not separately — implied by whatever the server returns in later capture-context reads | No client-side persistence | Yes, if provided | No | Attribute contributions under a chosen name, per governance mode | Not held by the client at all once entered; server-side retention is a facilitator/organisation matter, out of this app's scope |
| Identity mode | Derived from governance mode, not entered by the participant | Read from the server, not sent | No | No | Yes | No | Determine attribution wording (named vs. anonymous) shown to the participant | N/A — not stored |
| Session context | Yes (session title, workspace name, facilitator name, governance mode) | Read from the server | No | No | No — describes the session, not the participant | No | Show the participant what they're joining, and what they're contributing to | N/A — refetched each load, not persisted |
| Consent decisions | Yes (the categories a participant checks before contributing) | Yes (`captureParticipantSelfConsent`) | No client-side copy | No | Yes | No | Gate what kinds of contribution/attribution the participant has actually agreed to | Client holds none; server-side retention is a facilitator/organisation matter, out of this app's scope |
| Text evidence | Yes (what the participant types) | Yes (`captureParticipantEvidence`) | Yes, only if submission fails offline — IndexedDB, until successfully submitted; see `OFFLINE_STORAGE_DESIGN.md` | Only transiently, while offline-queued | Yes | No | The participant's own contribution to the session | Removed from the local queue immediately on confirmed server submission |
| Audio evidence | Yes (a recording the participant makes and explicitly submits) | Yes (`captureParticipantEvidence` + `uploadParticipantCaptureAttachment`) | Yes, only if submission fails offline — same as text evidence | Only transiently, while offline-queued | Yes | No | The participant's own contribution to the session | Same as text evidence; also never persisted anywhere once the in-memory recording is submitted or discarded by the participant |
| Local queued evidence (general) | N/A — derived from the above | N/A | Yes — IndexedDB, unencrypted at rest; see `OFFLINE_STORAGE_DESIGN.md`'s explicit no-encryption-claim | Only until submitted | Yes | No | Retry a contribution that failed to send while offline, without losing it | Removed on confirmed submission; also removable by the participant clearing the app's local storage (standard OS behaviour) |
| Diagnostic data (console warnings) | Only the dev-only secure-storage-fallback warning (`SECURE_TOKEN_STORAGE.md`) | No | No | No | No | No | Alert a developer during local testing that the non-native storage fallback is active | N/A — console output only, never persisted, and this code path never runs in a shipped native build |
| Network metadata (IP address, etc.) | Implicit in any HTTPS request | Yes — ordinary HTTP transport, not app-collected | No | No | Not by this app (server infrastructure may log it independently — out of this app's scope) | No | Ordinary HTTPS request handling | Out of this app's scope — governed by the API's own infrastructure, not this document |

## HUMAN/LEGAL REVIEW REQUIRED

- The exact wording of `NSMicrophoneUsageDescription`
  (`ios/App/App/Info.plist`) and the Android microphone permission's
  store-listing rationale (Play Console's Data Safety / permissions
  declaration flow) — this document's copy is a plain factual placeholder,
  not reviewed legal/product copy.
- Whether "session context" and "consent decisions," while not persisted
  *by this app*, still require a data-safety disclosure on the strength of
  being transmitted to and processed by the server — a legal/privacy
  characterisation question, not a technical one this document can resolve.
- Data retention periods on the **server** side (how long consent records,
  evidence, and session data are retained by the organisation) are outside
  this app's scope entirely and are a pre-existing Witness platform question,
  not a new one this programme introduces — do not let store-form
  preparation block on re-deriving that answer here.
- Whether the Apple/Google store forms require this app to declare data
  "collected" even when the *organisation's* server (not this app or its
  vendor) is the ultimate controller — a categorisation question for
  whoever actually completes the store submission forms.

## What is deliberately absent

No location, no contacts, no Bluetooth, no advertising identifier, no
background microphone access, no broad storage access, no analytics SDK, no
advertising SDK, no crash-reporting SDK — see
`WITNESS_PARTICIPATE_V1_SCOPE.md` and the permission blocks in
`android/app/src/main/AndroidManifest.xml` / `ios/App/App/Info.plist` for
where each of these is explicitly not requested, and why.
