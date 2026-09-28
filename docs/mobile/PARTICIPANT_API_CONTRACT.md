# Witness Participate — participant API contract

**Owner:** Engineering (Mobile release programme)
**Status:** Active — describes the exact, already-implemented surface Witness Participate is
permitted to call. Nothing here is aspirational; every field is read from
`packages/contracts/src/index.ts`, `services/api-gateway/src/session-join/`, and their live tests.

This is the entire mobile-relevant API. Witness Participate must never become a generic Witness API
client — if a future feature seems to need a route not listed here, that is a signal to extend this
document deliberately (and re-run the adversarial suite in
`docs/mobile/WITNESS_PARTICIPATE_CURRENT_STATE.md` §9), not to reach for `apps/web`'s full client.

## Two authentication mechanisms, never mixed

| Mechanism | Header | Used by | Scope |
|---|---|---|---|
| **Join-link token** | none (in the URL path) | `GET/POST /api/v1/session-join/*` | Resolves to exactly one `SessionJoinLink` → one session. Possession alone is enough to view context or attempt to join; it is never sufficient to act as a participant. |
| **Capture token** | `X-Witness-Capture-Token` | `* /api/v1/participant-capture/*` | Resolves to exactly one `SessionParticipant` row → one session, one identity. Minted only as the result of a successful join. |

Neither mechanism is ever accepted by an `@Requires(...)`-guarded facilitator/admin/billing/
platform route — those routes authenticate via a cookie session or (development-profile-only,
loopback-restricted since commit `33545e5`) `X-Witness-Dev-User`, a structurally disjoint code path
(`AuthorizationGuard` never reads `X-Witness-Capture-Token`, and `ParticipantCaptureController`/
`SessionJoinController` never read a cookie or `X-Witness-Dev-User`). This is the security invariant
§9 of the governing instruction asks to be proven, not designed — it already exists, and is proven by
existing live tests cited per-route below.

Only `tokenHash` (SHA-256) is ever persisted for either token type — the raw value exists only in
the QR/URL (join link) or the client's own secure storage (capture token). Neither token, nor any
session/participant identifier derived from it, may be sent to crash reporting, analytics, or logs —
see `docs/mobile/STORE_PRIVACY_DATA_MAP.md`.

---

## `GET /api/v1/session-join/:token`

| | |
|---|---|
| **Auth** | None — token possession alone. Never sufficient to join. |
| **Token type** | Join-link token (raw, from QR/URL). |
| **Scope** | One session. |
| **Request** | Path param only. |
| **Response** | `SessionJoinContextView`: `organisationName`, `workspaceName`, `sessionId`, `sessionTitle`, `facilitatorDisplayName`, `governanceMode`, `status` (`active`\|`revoked`\|`expired`), `sessionStatus`, `expiresAt`, `requiresSignIn`, `requiresDisplayName`. |
| **Consent** | Not applicable — read-only, no participation implied. |
| **Idempotency** | N/A (GET). |
| **Expiry** | Reflected as `status: 'expired'` in the response body, not an error — the mobile client shows this as context, never as a failed request. |
| **Revocation** | Reflected as `status: 'revoked'`, same treatment. |
| **Errors** | `404 JOIN_LINK_NOT_FOUND` — the token does not resolve to any `SessionJoinLink` at all (malformed, or never existed). |
| **Retry** | Safe to retry unconditionally — pure read. |

## `POST /api/v1/session-join/:token/join`

| | |
|---|---|
| **Auth** | None. `verified_guest`/`invited_only` governance modes independently require a real OIDC session inside the service (`SessionJoinService.resolveIdentity`) — the route itself grants nothing by header alone. |
| **Token type** | Join-link token in, capture token out. |
| **Scope** | Creates one `SessionParticipant` + one `ParticipantCaptureToken`, both scoped to this session only. |
| **Request** | `{ clientRequestId: uuid, displayName?: string }` (`joinSessionRequestSchema`). `displayName` required only when `requiresDisplayName` was true in the context response. |
| **Response** | `JoinSessionResult`: `participantId`, `sessionId`, `workspaceId`, `identityMode`, `displayName`, `captureToken` (raw — store it now, it is never returned again). |
| **Consent** | Not yet — joining is distinct from consenting. Consent is captured separately, after join, via the capture-token endpoint below. Never assume consent from a successful join. |
| **Idempotency** | Full: a repeated `POST` with the same `clientRequestId` against the same link replays the original result (same `participantId`/`captureToken`) rather than creating a second participant — enforced under a Postgres advisory lock (`session-join.service.ts:265-283`), proven in `session-join.live.test.ts`. **The mobile client must generate one `clientRequestId` per join attempt and reuse it on retry, never generate a fresh one per retry.** |
| **Expiry** | `400 JOIN_LINK_EXPIRED` (fixed this session — previously an unhandled `500`; see `session-join.controller.test.ts`). |
| **Revocation** | `400`-class domain error via the same `translateDomainErrors` path, same fix. |
| **Rate limit** | 30 joins per 60-second window **per join link** (not per device) — `JOIN_RATE_LIMIT_MAX_PER_WINDOW`/`_WINDOW_MS`, `session-join.service.ts:80-81`. A `429`-class response should trigger the client's ordinary backoff-and-retry, not a hard failure state. |
| **Errors** | `404 JOIN_LINK_NOT_FOUND`; `400` for expired/revoked/wrong-status/rate-limited; `400 VALIDATION_FAILED` for a malformed body. |
| **Retry** | Safe, given the idempotency guarantee above — retry with the **same** `clientRequestId`. |

---

## `GET /api/v1/participant-capture/me`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Scope** | The exact participant/session the token was minted for — never another. |
| **Response** | `ParticipantCaptureContextView`: `sessionId`, `sessionTitle`, `sessionStatus`, `facilitatorDisplayName`, `participantId`, `displayName`, `identityMode`, `consentStatusSummary`, `requiredConsentCategories`. |
| **Consent** | Read-only; tells the client whether consent is still needed. |
| **Idempotency** | N/A (GET). |
| **Expiry/Revocation** | `401` — token expired (`CAPTURE_TOKEN_TTL_HOURS = 24` from mint, `participant-capture.service.ts:64`), revoked, or the underlying participant withdrew. Proven live: "an expired capture token is rejected even though the row still exists," "a withdrawn participant cannot continue capturing even with a still-valid token" (`participant-capture.live.test.ts`). |
| **Errors** | `401` for any invalid/expired/revoked token; no `404` — token validity and existence are checked together, deliberately (never confirm or deny a token's existence separately from its validity). |
| **Retry** | Safe, unconditionally. |

## `POST /api/v1/participant-capture/consent`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Request** | `{ categoryDecisions: [{ category: string, granted: boolean }, ...] }` (`participantCaptureConsentRequestSchema`), at least one decision. |
| **Consent** | **This is the consent-granting call itself.** Every category the session's `SessionConsentConfiguration` requires must be present with `granted: true`, or capture remains blocked — never assumed. A category not part of the session's configuration is rejected (`400`), not silently ignored — the fixed root cause of MOBILE-002. |
| **Idempotency** | Re-submitting decisions overwrites the participant's prior recorded decisions (this is a "current state," not an append-only log at the participant-capture layer — the full history remains in `ParticipantConsentRecord`'s own domain model). |
| **Errors** | `400 CATEGORY_NOT_IN_CONFIGURATION`/similar `DomainError` codes (translated, never raw `500` — this exact controller was MOBILE-002's fix point); `401` for an invalid token. |
| **Retry** | Safe — submitting the same decisions twice is a no-op in effect. |

## `POST /api/v1/participant-capture/evidence`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Request** | `participantCaptureEvidenceRequestSchema`: `evidenceType` (e.g. `audio_note`), `title`, `content`, `language?`, `sessionOffsetSeconds?`, `tags?`, `sourceAgendaItemId?` (the active prompt, if any — omit for open reflection), `clientRequestId` (uuid, required). |
| **Consent** | Gated — capture is refused if the participant has not granted the categories `requiredConsentCategoryForCapture` (`packages/domain/src/evidence.ts`) computes for this attribution mode, checked server-side, never trusted from the client. |
| **Idempotency** | Full — `@@unique([sessionId, clientRequestId])` at the database level. A retried `POST` with the same `clientRequestId` returns the **original** `evidenceId`, never creates a second row. **The mobile client must persist one `clientRequestId` per contribution attempt locally before the first network call, and reuse it on every retry of that same attempt** — this is what makes "retry never duplicates evidence" (§15 of the governing instruction) true. |
| **Response** | `ParticipantCaptureEvidenceResult`: `evidenceId`, `reviewStatus`. Do not show "Received"/"Submitted" to the participant until this response actually arrives — a local-only success is not a submission. |
| **Errors** | `400` for a consent-category gap (translated `DomainError`), `401` for an invalid token, `400 VALIDATION_FAILED` for a malformed body. |
| **Retry** | Safe by construction — see Idempotency. |

## `POST /api/v1/participant-capture/evidence/:evidenceId/attachment`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`, and the token's own participant must be the one who created `evidenceId` — cross-participant forgery is rejected (`401`), proven live: "one participant's token cannot attach a file to another participant's evidence." |
| **Request** | `multipart/form-data`, one file field. Attachment kind (`audio`\|`document`\|`image`) is inferred server-side from the file, not asserted by the client. |
| **Consent** | `audio` attachments require `audio_recording` consent specifically; `document`/`image` require `evidence_submission` — genuinely separate categories, never conflated (this exact boundary was MOBILE-002's second root cause). |
| **Idempotency** | Not idempotent at this endpoint — one evidence row accepts at most one attachment; a second attempt against the same `evidenceId` after a successful first upload is a client-side bug, not a supported retry path. Retry the whole evidence-capture step (a fresh `clientRequestId`) if the attachment step is what actually failed and the evidence row already exists — do not silently re-POST the same file to the same `evidenceId` expecting a different result. |
| **Errors** | `401` for a wrong-participant or invalid token; `400` for a missing/oversized/unrecognised file. |
| **Retry** | Safe only up to the point described above. |

## `GET /api/v1/participant-capture/prompt`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Response** | `ParticipantPromptView` or `null` — `null` means no agenda item is currently `current` (open reflection); otherwise `{ id, title, promptText, position, totalPrompts, status }`. Never a scheduling field or facilitator identity — this is a deliberately narrow subset compared to the facilitator-only `AgendaItemView`. |
| **Idempotency** | N/A (GET). Poll on an interval (the web client uses 20s, `LIVE_STATE_POLL_MS`) rather than assuming a push mechanism exists — none does. |
| **Errors** | `401` for an invalid token. |

## `GET /api/v1/participant-capture/insights`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Response** | `FeaturedInsightView[]` — each: `id`, `knowledgeAssertionId`, `statement`, `badge` (`under_discussion`\|`contested`\|`community_validated`), `displayOrder`, `responseTally` (aggregate counts only — never a participant list), `myResponseType` (this participant's own prior response, if any). |
| **Governance** | Only already-*confirmed* `KnowledgeAssertion`s a facilitator deliberately curated ever appear here — never a candidate, never anything AI-suggested and unconfirmed. Always render as provisional ("what we're hearing"), never as settled fact, regardless of `badge`. |
| **Errors** | `401` for an invalid token. |

## `POST /api/v1/participant-capture/insights/:insightId/response`

| | |
|---|---|
| **Auth** | `X-Witness-Capture-Token`. |
| **Request** | `responseType` (one of `reflects`, `needs_nuance`, `missing_context`, `sees_differently`) plus an optional `comment`. |
| **Governance** | Append-only; never mutates the `KnowledgeAssertion` it responds to — proven byte-identical before/after in `session-featured-insights.live.test.ts`. This must never become an edit UI in the mobile client — it is a reaction, structurally incapable of changing canonical Knowledge. |
| **Idempotency** | Not idempotent — a second response from the same participant to the same insight is a **new**, additional response (disagreement over time is preserved, not collapsed). The client should reflect `myResponseType` once set and treat re-responding as a deliberate user action, not a retry. |
| **Errors** | `404 FEATURED_INSIGHT_NOT_FOUND` — including a since-removed insight, handled the same way (never a `500`); `400` for an unrecognised `responseType`; `401` for an invalid token. |

## `POST /api/v1/participant-capture/feedback` and `.../feedback/:feedbackId/testimonial-consent`

Out of the P0 critical path (join → consent → capture → offline/recover → submit) — these exist for
the post-session/"I'm done for now" moment only (Track B/E). Documented for completeness; **the
mobile client must not surface these until the participant has explicitly finished or the session
has closed** (§13 of the Track E work this inherits — survey timing is a product invariant, not an
incidental UI choice).

---

## What is deliberately absent from this contract

No route here ever accepts an organisation, workspace-admin, billing, invoice, platform, or
knowledge-graph-write action — verified by direct inspection of both controller files (§14 of
`WITNESS_PARTICIPATE_CURRENT_STATE.md`), not merely by omission from this document. Witness
Participate must never be given a client library, SDK, or generated code that could call any route
outside this document — the narrowness is enforced by what gets built, not by what gets hidden.
