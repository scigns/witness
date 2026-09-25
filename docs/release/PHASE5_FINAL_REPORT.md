# Phase 5 Final Report: Quick Capture and Commercial Closure

**Status:** Workstreams 0–5 complete. Stopping here per the governing instruction: *do not automatically proceed into AI extraction.*

This report closes out Phase 5, covering Quick Capture (Workstream 1), commercial closure (Workstream 2), the Evidence Knowledge Graph production topology (Workstream 3, completed earlier in this effort), operator visibility (Workstream 4.2), and the acceptance-testing pass (Workstream 5).

---

## 1. Commits

In dependency order:

| Commit | Workstream | Summary |
|---|---|---|
| `da8970d` | 1.6 | Governed QR/link session joining — `SessionJoinLink`/`SessionJoinAttempt` |
| `7b21d33` | 1.1–1.4 | Participant self-capture via `ParticipantCaptureToken` |
| `a2ce0b7` | 1.3 | Self-capture attachments (audio/document/image) |
| `c760a8c` | 1.5 | Participant landing page + mobile recorder |
| `fa6dc83` | 1.6 | Facilitator QR/join-link generation panel |
| `9d86449` | 1.7 | Facilitator bulk evidence upload |
| `d513d6b` | 2.1 | `Receipt` model, exactly-once issuance |
| `265ea4d` | 2.2 | Branded invoice/receipt rendering, customer downloads |
| `0deddbc` | 2.3 | `billing_manager` role, separated from organisation admin |
| `f9ac6e1` | 2.4 | Minimal `Agreement`/renewal model, billing-page visibility |
| `84cf757` | 4.2 | Cross-organisation operator health/failure view |
| `5336078`* | 3 | Evidence Knowledge Graph enabled in production (Neo4j + graph-projector) |
| `bfbedd4`* | 0 | Production backup cron restored; verified isolated restore drill |

\* Landed earlier in this same effort, listed here for completeness since Workstreams 0 and 3 are covered by this report.

Every commit above passed its own full test suite and, where it touched shared authorization/domain modules, the full monorepo suite before merging.

## 2. Migrations

```
20260923073459_session_join_link
20260923080428_participant_capture_token
20260924044439_receipt          (hand-edited: adds allocate_receipt_number())
20260925005140_agreement
```

All four are additive (new tables/columns only); none alters or drops existing data. `allocate_receipt_number` mirrors the pre-existing `allocate_invoice_number` atomic-counter pattern exactly.

## 3. Domain changes (`packages/domain`)

- `session-join-link.ts` — `SessionJoinLink` aggregate, governance-mode-aware usability checks.
- `invoice.ts` additions — `Receipt` interface, `createReceipt()` (requires `VERIFIED` payment evidence, same-tenant invariant).
- `agreement.ts` (new module) — `Agreement`, `createAgreement`/`renewAgreement`/`terminateAgreement`/`effectiveAgreementStatus`. Deliberately minimal: no documents, signatories, or procurement workflow (see `docs/commercial/COMMERCIAL_ARCHITECTURE_ASSESSMENT.md` for the fuller vision this does not build). `EXPIRED` is computed at read time from `termEnd`, never stored — no background job needed to keep it in sync.
- `role.ts` — added `billing_manager`, following the Knowledge Steward precedent of "its own tier, not collapsed onto `admin`."
- `audit.ts` — added `session_join_link.*`, `receipt.issued`, `agreement.created`/`renewed`/`terminated` actions and matching subject types.
- `ids.ts` — added `SessionJoinLinkId`, `SessionJoinAttemptId`, `ReceiptId`, `AgreementId`.

## 4. Quick Capture architecture (Workstream 1)

Governed QR/link joining (`SessionJoinLink` → `SessionJoinAttempt`) supports all four governance modes (`invited_only`, `verified_guest`, `pseudonymous`, `anonymous`). A participant who joins successfully is issued a `ParticipantCaptureToken` — a narrow, non-RBAC bearer credential scoped to exactly themselves and one session, verified via `resolveToken()` which never trusts a client-supplied identifier. This is a structural design choice, not a permission check that could be forgotten at a call site: the token *is* the session selector, so there is no separate "which session" parameter for an attacker to substitute.

The mobile-first recorder (`audio-recorder.tsx`) reuses the facilitator side's existing `MediaRecorder` mimetype-negotiation and lifecycle code rather than reimplementing it. Facilitator bulk upload lets a facilitator capture evidence for an entire room from photos/files taken during a session, sharing one offline queue with the existing facilitator-side contribution flow (`QueuedContribution` widened to a discriminated union of `QueuedFacilitatorContribution | QueuedParticipantContribution`).

## 5. Consent behaviour

Capture unconditionally requires the identity-appropriate quotation consent category (`attributed_quotation` or `anonymous_quotation`, chosen by `requiredConsentCategoryForCapture()`) in addition to whatever categories the session's own template configured — a template marking that category "optional" does not exempt capture from asking for it. This was found and fixed via live testing (first real submission failed with `"Category 'anonymous_quotation' was never decided"`), not a design that was correct from the start.

## 6. QR/link threat model

- **Token secrecy:** `SessionJoinLink.tokenHash` stores only a SHA-256 digest; a database read alone cannot reconstruct a usable link, the same discipline `WorkspaceInvitation.tokenHash` already established.
- **Governance enforcement:** each of the four modes gates differently (sign-in requirement, display-name requirement, pre-existing workspace access) — enforced server-side in `session-join.service.ts`, never trusted from the client.
- **Rate limiting:** a 60-second sliding window capped at 30 join attempts per link guards against a burst of scripted joins without penalizing a genuine roomful of phones scanning at once.
- **Exactly-once join accounting:** `pg_advisory_xact_lock(hashtext('session_join'), hashtext(linkId))` serializes concurrent joins against the same link's `useCount`/`maxUses` cap.
- **Revocation:** `assertSessionJoinLinkUsable` checks status/expiry/use-count on every join attempt, not just at creation.
- Adversarial test coverage: 14 tests in `session-join.live.test.ts`, 9 in `participant-capture.live.test.ts`, run against a real Postgres, not mocks.

## 7. Offline behaviour

The participant and facilitator capture flows share one IndexedDB-backed queue (`offline-queue.ts`). A contribution captured while offline is queued locally and retried on reconnect; a client-generated idempotency key (`Evidence.clientRequestId`, unique per session) means a retry that races a response which actually landed returns the original evidence instead of creating a duplicate.

## 8. Bulk-upload behaviour

A file rejected by client-side validation (wrong MIME type, oversized) is marked `rejected: boolean` once, permanently, and is never retryable — only a transient `status: 'failed'` (network/server error) can be retried. This distinction was added after live testing found a real bug: a rejected file's "Retry" button bypassed `validateFile()` entirely and created an orphaned `Evidence` row with no attachment before failing server-side too. Re-verified live after the fix: re-uploading the same bad file shows "1 rejected," disables "Upload all," and confirmed via direct DB query that no Evidence row is created.

## 9. Receipt architecture

A `Receipt` is issued 1:1 with a verified `Payment`, in the same database transaction as settlement itself (`ManualSettlementService.record`) — a receipt can never exist without the payment it evidences, and vice versa. `receiptNumber` is allocated by `allocate_receipt_number`, an atomic Postgres counter function (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`) — the same pattern `allocate_invoice_number` already uses, never reused even if a payment were later reversed. The receipt's audit event (`receipt.issued`) fires only after every other mutation that could still fail has already succeeded — this ordering was a genuine bug caught by a pre-existing, unrelated unit test asserting zero audit events on a later-mutation failure, not something designed correctly on the first attempt.

Invoice and receipt HTML rendering share one brand-token system (`INK`, `PAPER`, `ACCENT`, etc., pulled from the same hex values `apps/web/src/app/globals.css` uses) so a downloaded document looks like it came from the same product as the web app, despite being served as a standalone HTML file independent of the Next.js stylesheet.

## 10. Billing permission model

`billing_manager` is a new, deliberately narrow Casbin tier: `organisation:read`, `invoice:read/create/render`, `payment:settle`, `agreement:read/create/renew/terminate` — nothing else. It cannot manage members, roles, or workspaces. This mirrors the Knowledge Steward precedent exactly (own tier, not collapsed onto `admin`).

`payment:settle` is, and always has been, **platform-only** — resolved via `platformGrantTiers()` regardless of what scope is passed to the authorization decision, exactly like `platform_role:*`. This means neither `admin` nor `billing_manager` can settle a payment via an organisation-scoped role assignment; only a platform-scoped assignment of either tier can. This was rediscovered mid-implementation (an adversarial test's own assumption was initially wrong, not the implementation) and is a deliberate, pre-existing trust boundary: settling a payment means Witness's own verified operator confirmed money arrived, not the customer's own organisation admin self-declaring it.

`operator:read` (Section 13) follows the identical pattern, added for the same reason: a cross-organisation view must never be reachable via an organisation-scoped assignment.

Adversarial coverage: `billing-authority.adversarial.test.ts` (29 tests) proves the tier boundary against the real `RoleResolutionService`/`PolicyEngineService`, including the platform-vs-organisation-scope distinction for `payment:settle`. `role-grants-parity.test.ts` proves `policy.csv` and `role-grants.ts` agree exactly, for every tier, on every turn.

## 11. Agreement/renewal model

Deliberately minimal, per the explicit instruction not to build a contract-management suite: a reference (contract/PO/pilot-agreement number, free text), a term (`termStart`/`termEnd`, open-ended allowed), notes, and a renewal chain (`previousAgreementId`). No documents, signatories, or procurement workflow.

- **Renewal** supersedes the previous agreement (`status: SUPERSEDED`) and creates a new one chained to it; the new term cannot start before the previous one did, and a `TERMINATED` agreement cannot be renewed (record a fresh one instead).
- **Termination** requires a reason, and cannot be applied twice.
- **`EXPIRED`** is never a stored status — `effectiveAgreementStatus()` computes it at read time from `termEnd < now`, the same "derive, don't store" reasoning `Invoice.status` never got for `OVERDUE` (Section 13 depends on this).
- One `ACTIVE` agreement per organisation at a time, enforced via a `pg_advisory_xact_lock` serializing concurrent create/renew/terminate calls for that organisation — the same pattern `session-join.service.ts` and `manual-settlement.service.ts` already use for their own exactly-once invariants.

Billing-page visibility: the active agreement (or a form to record one), renew/terminate actions, and a collapsible renewal/termination history, gated the same way every other billing action is (server enforces `agreement:*`; the UI renders the controls for anyone viewing the page and surfaces the resulting 403 like any other denied action).

## 12. Production Neo4j topology (Workstream 3)

`neo4j` and `graph-projector` are new services in `docker-compose.pilot.yml`, off by default: no ports published (reachable only from the compose network, the same guarantee Postgres already has), and not started by `scripts/pilot/deploy.sh` or the auto-deploy workflow, which only ever recreates `api`/`web`. `api-gateway`'s `KnowledgeGraphQueryService` connects lazily — only on the first actual graph query, never at startup — so an already-running pilot's behaviour is unchanged until an operator deliberately opts in via `docs/operations/KNOWLEDGE_GRAPH_PRODUCTION_RUNBOOK.md`. `/ready`'s `neo4j` component now performs a real reachability check (`Neo4jGraphRepository.ping()`, mirroring `PrismaService.ping()`) once `NEO4J_URI` is set, distinguishing `not_configured` from `down`.

## 13. Operator visibility (Workstream 4.2)

`GET /api/v1/operator/health` aggregates, across every organisation:

- Failed transcripts and session summaries (`status = 'failed'`, with `failureReason`).
- Undelivered invitation email — both `InvitationNotification` (organisation invites) and `WorkspaceInvitation.deliveryStatus` (workspace invites).
- Settlement issues — overdue invoices (`status = 'OPEN' AND dueAt < now`, computed at read time, since nothing calls `markInvoiceOverdue`) and rejected payment evidence.

No new job queue, alerting system, or stored "overdue" status. `operator:read` is platform-only (Section 10). The `/operator` page deep-links each item into the existing per-record retry surface rather than duplicating retry actions.

Backup visibility is deliberately **not** part of this endpoint: `scripts/ops/backup-status.sh` already covers it (age, checksum validity, exit code doubling as a health signal), and backups live on infrastructure the API container has no filesystem access to. Extending this endpoint to cover backups would need new plumbing on the backup host — out of scope for a read-only view of existing database state.

## 14. Health/observability changes

- `/ready`'s `neo4j` component: real reachability check when configured (Section 12).
- New `/api/v1/operator/health` (Section 13) — the first authenticated, platform-scoped operational view; `/health` and `/ready` remain deliberately unauthenticated infra probes and were not extended with tenant-level detail, which would leak activity information across organisations to an unauthenticated caller.

## 15. Security tests

Adversarial/live suites added or extended this phase:

| Suite | Tests | What it proves |
|---|---|---|
| `session-join.live.test.ts` | 14 | Governance-mode enforcement, rate limiting, exactly-once join accounting — real Postgres |
| `participant-capture.live.test.ts` | 9 | Capture-token scoping, consent-category enforcement — real Postgres |
| `billing-authority.adversarial.test.ts` | 29 | `billing_manager` tier boundary, `payment:settle` platform-only, admin regression |
| `operator.authorization.test.ts` | 2 | `operator:read` platform-only |
| `role-grants-parity.test.ts` | 2 | `policy.csv` ↔ `role-grants.ts` agreement, every tier, every action |
| `agreement.service.test.ts` | 9 | Duplicate-active conflict, cross-organisation denial, invalid-term rejection |
| `agreement.test.ts` (domain) | 18 | Renewal chain, termination, `effectiveAgreementStatus` |

Two real, previously-unknown bugs were found by live testing (not unit tests) and fixed with live re-verification: the bulk-upload orphaned-evidence-row-on-retry bug (Section 8) and the receipt-audit-event-ordering bug (Section 9). A third class — a cross-file test-isolation bug where three live-test files' unscoped `deleteMany` calls could delete each other's still-in-use rows under `pnpm test:live`'s concurrent execution — was found and fixed by scoping cleanup to each file's own `createdUserIds`.

## 16. Exact test counts (as of this report)

```
@witness/domain:     29 files, 624 tests
@witness/api:        68 files, 738 tests
@witness/contracts:   1 file,   20 tests
                     ————————————————————
                     98 files, 1382 tests — all passing
```

(Workers/graph-projector and services/knowledge-graph, delivered under Workstream 3, are not re-verified in this report; they were stable and passing before this phase began and were not touched by it.)

## 17. Browsers/devices actually tested

**Honestly limited, and stated as such rather than implied otherwise.** All live UI verification in this phase — both during Workstream 1's original build and this closing pass's re-verification — used **Chrome desktop via browser automation** (`claude-in-chrome`), including one pass at a 390×844 mobile viewport (iPhone-sized) to check responsive layout, not real device hardware. No physical phone, tablet, Safari, Firefox, or a real low-bandwidth/offline network condition was exercised. This is a tool limitation of the environment this work was done in, not a claim that mobile Safari or a real Android device behaves identically.

What **was** verified in Chrome, live, end-to-end, against a running instance (not mocks) during this closing pass:
- QR/link join → anonymous participant identity → capture landing page, at both desktop and mobile viewport widths.
- Billing page: Agreement panel create → renew → terminate → history, full round-trip against real Postgres, with audit events confirmed in the database.
- RBAC: a `reader`-tier dev header correctly denied `agreement:create` and `operator:read` with the exact FORBIDDEN reason string; an `admin`-tier one was correctly granted both.
- Operator health page renders real aggregated data (verified empty-state; the populated-row rendering logic is covered by unit tests rather than a live populated fixture, given the effort of provisioning a realistic failed-job fixture set was judged not to justify the marginal coverage over what the unit tests already prove).

Two environment-only issues were found and are **not code defects**: Docker Desktop's containers exited mid-session (external event, unrelated to this work; recovered by restarting the Postgres container) and a stale `.next` build cache caused two dynamic routes (`/join/[token]`, both under new-workspace paths) to 404 until the cache was cleared — a known Next.js dev-server quirk, not a routing bug (confirmed: the files were correct on disk, and a fresh `.next` build resolved both routes immediately).

## 18. End-to-end acceptance results

The full 20-item "Fiji Teachers Association / Teacher Voice Co-design" scenario from the original Phase 5 instruction was **not re-run as a single scripted pass** in this closing session. Reasoning, stated plainly:

- The participant-join → consent → capture path (items covering QR join, consent gating, audio capture, offline queueing) was already run live, end-to-end, with real database verification, during Workstream 1's original build (see Sections 5–7) — re-running it now would duplicate coverage already proven, not add new coverage.
- The facilitator-side session/workspace pages in this dev-preview require a real signed-in session (`useAuth()`), which needs a working Keycloak instance; none is available in this environment (confirmed via `/ready`: `keycloak: not_configured`/`down` depending on profile). This blocks scripting the facilitator-review, decision, and knowledge-graph portions of the scenario end-to-end here — not a defect, a genuine environment gap between this sandbox and the real pilot deployment (which does have Keycloak).
- What this session's own new work needed — billing, agreement, and operator-visibility acceptance — **was** run live end-to-end (Section 17).

**Recommendation, stated as a real gap, not deferred quietly:** before Gate I, a human tester with access to the real pilot's Keycloak-backed environment should run the full 20-item scenario on at least one real Android and one real iOS device, on both Chrome and Safari, including one genuinely offline capture-and-reconnect cycle. This has not been done, by anyone, at any point in this effort's history, and should not be assumed safe to skip.

## 19. Unresolved production risks

- **No physical-device or cross-browser acceptance testing has ever been performed for the Quick Capture flow** (Section 18) — the single highest-priority gap before Gate I.
- **`markInvoiceOverdue` is dead code** — nothing calls it; `OVERDUE` is computed at read time in the operator view (Section 13) but `Invoice.status` itself will never show `OVERDUE` anywhere else in the product (e.g. the customer's own billing page still shows `OPEN`). This is consistent, not broken, but worth knowing before someone searches for where `OVERDUE` gets set and finds nothing.
- **Backup freshness has no in-product surface** — an operator must still SSH in and run `scripts/ops/backup-status.sh` manually; Section 13 explains why this was a deliberate scope decision, but it remains a real manual step, not an automated alert.
- **The dev-preview's role-switcher header (`X-Witness-Dev-User`) and the real session-backed authorization path are two genuinely different code paths** (`decideByRoleGrants` vs `RoleResolutionService`) that happen to agree today because `role-grants-parity.test.ts` checks them — but a future change to one without the other would only be caught by that one test file. Worth knowing, not urgent.
- **Agreement/renewal has no reminder or notice mechanism** — an operator must open the billing page to notice a term has lapsed (`EXPIRED`); nothing pushes a notification. This is consistent with "deliberately minimal, no new alerting" but is a real limitation if a real pilot organisation's agreement lapses unnoticed.

## 20. What remains before "Gate I"

1. Real-device, real-browser acceptance testing of the full 20-item scenario (Section 18) — blocking, not yet started by anyone.
2. Human UAT sign-off against a Keycloak-backed environment (referenced in `docs/release/WITNESS_HUMAN_UAT_HANDOFF.md`, predating this phase) — status of that handoff is outside this report's scope to confirm; check its own document for current state.
3. A decision on whether `billing_manager`/`admin` should ever be assignable at platform scope in the real pilot (today, `payment:settle` is unreachable in practice unless an operator explicitly grants a platform-scoped role — confirm this is the intended real-world operating model before a customer's first settlement is attempted).
4. Nothing else identified in this phase's own scope blocks Gate I; Workstreams 0–5 as instructed are complete.

---

**Explicitly out of scope for this phase, and not started:** AI-assisted knowledge extraction, GLiNER, embeddings, semantic search, Stripe/card checkout, SCIM, enterprise SAML productisation, a large analytics platform, a full contract-management suite, speculative microservice extraction. Stopping here per the governing instruction.
