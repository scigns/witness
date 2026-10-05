# Witness — Commercial Runtime & Market Readiness Handoff

Date: 5 October 2026

Repository:

`scigns/witness`

This document is the engineering handoff from the Claude implementation session to Codex.

It records the product intention, architectural decisions, completed work, branch dependencies,
current implementation state, known risks, and remaining milestones.

Do not restart discovery from zero.

Inspect the repository and verify this handoff against the actual code before making changes, but
preserve the decisions recorded here unless the code provides concrete evidence they are incorrect.

---

## 1. PRODUCT INTENTION

Witness is an open-source Digital Public Infrastructure platform for turning organisational and
community conversations into traceable institutional memory.

The product is intended to support:

- evidence capture
- provenance
- decisions
- commitments
- participation
- organisational memory
- governance
- accountability
- controlled institutional access
- auditability
- consent-aware workflows

Witness is not being positioned primarily as an "AI product."

AI may later assist particular workflows, but it is not the core commercial proposition.

The product being sold is:

- governance
- evidence
- participation
- provenance
- organisational control
- institutional memory
- security
- deployment/isolation
- capacity
- support

---

## 2. COMMERCIAL OBJECTIVE

Witness is moving from Developer Preview toward real customer onboarding.

The immediate commercial requirement is:

WE MUST NOT SELL AN ORGANISATION A SUBSCRIPTION THAT WE CANNOT ACTUALLY PROVISION, CONTROL, MEASURE,
SECURE AND SUPPORT.

For a paying organisation, Witness must be able to:

1. create/identify the organisation;
2. assign its subscription;
3. resolve its plan and entitlements;
4. determine its permitted infrastructure/resource profile;
5. allocate the correct technical isolation;
6. enforce resource limits;
7. measure usage;
8. expose appropriate usage information;
9. activate/deactivate capabilities according to subscription state;
10. maintain tenant isolation;
11. provide an audit trail;
12. give signed-in users a clear application environment.

This is the current P0.

---

## 3. PUBLIC WEBSITE VS APPLICATION

These are deliberately different products/surfaces.

## Public website

`https://www.buildwithwitness.com`

Purpose:

- explain Witness
- build trust
- explain use cases
- explain plans/deployment
- provide contact/start pathways
- support customer acquisition

It is NOT the primary place existing users work.

## Authenticated application

`https://app.buildwithwitness.com`

Purpose:

- sign in
- access organisation/workspaces/programs
- capture and review evidence
- work with records
- make/trace decisions
- use Witness operationally
- access Help & Knowledge
- inspect organisation/subscription/usage where authorised

The application must not feel like a duplicate marketing website.

For authenticated returning users, `/workspaces` should become the principal working landing
experience unless the repository contains a stronger existing canonical route.

Deep links must remain intact.

Pricing should not remain a primary work-navigation item beside operational features such as Records
and Capture.

Subscription/plan/usage information belongs under the organisation/account area.

---

## 4. IMPORTANT DOMAIN DECISION

## Organisation

Organisation is the commercial and governance identity.

It represents who uses/buys Witness.

It relates to things such as:

- subscription
- billing
- users
- organisational governance
- commercial agreements
- entitlements
- institutional identity

## Tenant

Tenant is the technical isolation boundary.

It relates to:

- runtime isolation
- storage isolation
- database/data isolation
- deployment
- resource allocation
- infrastructure/security boundaries

Do NOT broadly rename Tenant to Organisation.

They are separate concepts.

The initial implementation may frequently use a 1:1 Organisation-to-Tenant relationship, but the
domain must not permanently assume that is the only possible relationship.

This distinction is captured in ADR-0034 / the commercial-entitlements work.

---

## 5. BILLING ARCHITECTURE DECISION

Do not introduce Lago.

Witness owns its commercial state.

Witness is authoritative for:

- organisations
- plans
- subscriptions
- invoices
- payments
- receipts/payment records
- entitlements
- commercial audit events

External payment processors are adapters.

Architecture:

Witness commercial domain → PaymentProviderPort → Stripe or another future processor

The external processor moves money.

It is not the Witness commercial system of record.

Do not embed Stripe concepts into core domain models.

Do not store raw card credentials.

---

## 6. EXISTING PAYMENT CAPABILITY

A Claude audit established that the manual settlement flow is substantially already implemented.

Existing behaviour reportedly includes:

payment settlement → invoice becomes paid → subscription is activated → entitlements become active →
audit event/state update

and this occurs transactionally.

Verify this against the implementation before modifying it.

The important known gap is NOT the settlement engine.

The known gap is the operator workflow for originating/assigning commercial changes for
organisations that cannot self-serve.

We must support a real institutional onboarding path even before Stripe exists:

Platform operator → organisation → plan/subscription → invoice → external/manual payment →
authorised payment settlement → subscription ACTIVE → entitlements active → resource profile active

This allows Witness to sell institutional subscriptions before online checkout is finished.

---

## 7. HELP & KNOWLEDGE

PR #262:

`feat/help-knowledge-search`

Title:

Help & Knowledge: version-aware, permission-filtered search

Current intent:

Provide authenticated, version-aware application documentation searchable from inside Witness.

Important design:

Application Release → Documentation Snapshot → Search Index Version

Implementation deliberately uses PostgreSQL full-text search rather than adding
Meilisearch/OpenSearch.

Reasons include:

- smaller current corpus
- fewer infrastructure dependencies
- sovereign/air-gapped deployment compatibility
- easier security/version coordination

Search must remain server-side permission filtered.

Role/entitlement-restricted documents must never be returned and merely hidden by the frontend.

Current implementation includes:

- `documentation_snapshot`
- `documentation_chunk`
- Help search service
- authenticated API
- `/help`
- release-time indexing mechanism
- application-version matching
- role/entitlement filtering

Known deferred items include:

- optional future conversational/RAG layer
- pagination/relevance refinements
- some snapshot invariant hardening
- provider integrations

Do not replace this with an AI chatbot.

Future AI help must sit on top of the authorised/version-aware documentation substrate.

---

## 8. COMMERCIAL ENTITLEMENTS

PR #264:

`feat/commercial-entitlements`

This PR introduces the commercial configuration required for market rollout.

The intended chain is:

Organisation → Subscription → Plan → Effective Entitlements → ResourceProfile → DeploymentIsolation
→ SupportLevel

Important invariant:

Plan names MUST NOT drive application behaviour.

Do not write:

`if plan === "enterprise"`

Instead resolve capabilities through the entitlement/commercial configuration system.

---

## 9. RESOURCE PROFILE

ResourceProfile represents desired customer capacity.

It is provider neutral.

It must not contain commands such as:

"create a Vultr VM"

or:

"use AWS instance X"

Instead it describes capacity.

Examples:

- compute class
- memory class
- storage allowance
- concurrency limits
- worker/job limits
- backup profile
- retention profile

The actual values must be configuration/data.

Do not hard-code marketing-plan assumptions throughout the application.

---

## 10. DEPLOYMENT ISOLATION

Current commercial-entitlements work introduces/supports:

- SHARED
- ISOLATED_DATA
- DEDICATED
- SOVEREIGN

These are commercial/technical desired-state classifications.

Do not claim DEDICATED means a dedicated VM unless the infrastructure actually provisions that.

The next runtime work must establish the provisioning/enforcement boundary.

Plans can provide defaults.

Organisation-specific negotiated overrides must remain possible.

---

## 11. SUPPORT LEVEL

Support level already exists in the domain.

Commercial-entitlements work uses the existing `support.level` concept/vocabulary rather than
inventing another parallel model.

Preserve existing conventions.

---

## 12. COMMERCIAL OVERRIDES

Institutional contracts need negotiated overrides.

The implementation should allow:

Plan defaults + authorised organisation override = effective commercial configuration

Example:

Plan default storage: 100 GB

Negotiated organisation allowance: 250 GB

Effective storage: 250 GB

Overrides must:

- be authorised;
- be platform-admin controlled;
- be auditable;
- not silently mutate the base plan for every customer.

PR #264 reportedly verifies `commercial_override:manage` as platform-only.

Organisation administrators must not be allowed to increase their own commercial resource
allocations.

---

## 13. CURRENT ACTIVE WORK

Claude started the next commercial runtime branch from:

`feat/commercial-entitlements`

rather than `main`.

This is intentional because runtime work structurally depends on ResourceProfile /
DeploymentIsolation / SupportLevel introduced by PR #264.

This is a STACKED branch.

Determine the exact current branch using:

`git branch --show-current`

Do NOT recreate it if it already exists.

Do NOT accidentally branch the work from old main.

Once PR #264 merges, rebase/retarget the runtime branch appropriately.

---

## 14. CURRENT COMMERCIAL RUNTIME MILESTONE

Working concept/name:

Commercial Runtime Readiness

The goal is to connect the commercial domain to real runtime controls.

Required chain:

Organisation → Subscription → Effective Commercial Configuration → Tenant → Resource Allocation →
Usage → Enforcement → Operational Visibility

A subscription record alone is not sufficient.

Paid/active must not mean unlimited infrastructure.

---

## 15. STORAGE AND RESOURCE AUDIT

Claude attempted a storage/quota/usage audit but the background agent was terminated because the
Claude session limit was reached.

Therefore THIS AUDIT IS NOT COMPLETE.

Codex should continue this investigation.

Find all persistent and costly resource paths, including:

- PostgreSQL data
- evidence files
- uploaded documents
- attachments
- media
- exports
- generated artifacts
- temporary files
- backups
- logs where relevant
- caches/queues where relevant

For each determine:

- global or tenant scoped?
- organisation scoped?
- bounded or unbounded?
- current measurement capability?
- current enforcement?
- deletion/retention behaviour?

Do not assume all storage should count toward customer quota.

Distinguish:

CUSTOMER-ENFORCEABLE STORAGE

from:

OPERATIONAL INFRASTRUCTURE USAGE.

---

## 16. P0 — STORAGE QUOTA ENFORCEMENT

Implement real storage allocation.

We need:

ALLOCATED USED AVAILABLE

per organisation/tenant.

At minimum, customer-controlled persistent storage must be bounded.

Potential examples:

- uploads
- evidence attachments
- customer files
- retained exports

Where possible separately expose operational measurements such as:

- DB footprint
- backup footprint

Do not double-count resources.

Quota enforcement must occur server-side.

Required flow:

request → authenticate → resolve organisation → resolve effective commercial configuration →
evaluate resource allowance → reserve/check capacity → persist upload/resource → account usage

The frontend is not an enforcement boundary.

Account for simultaneous upload/race scenarios.

---

## 17. USAGE METERING

Implement one authoritative usage service.

Conceptually:

`getOrganisationUsage(organisationId)`

Possible output:

storage:

- allocated
- used
- available
- percentage

database:

- observed usage

backups:

- observed usage

users:

- allowed
- active

other bounded resources:

- relevant allocation/usage

Also include measurement timestamp/source where useful.

Do not represent guessed infrastructure values as exact billing truth.

---

## 18. CAPACITY THRESHOLDS

Add configurable threshold behaviour.

Suggested operational thresholds:

- 70%
- 85%
- 95%
- 100%

These should be configuration, not repeated magic numbers.

Crossing thresholds should emit a usable event/state for future notifications/operations.

Do not build a large notification framework solely for this.

---

## 19. INFRASTRUCTURE PROVISIONING BOUNDARY

DeploymentIsolation cannot remain a label forever.

Create or reuse a provider-neutral infrastructure/provisioning boundary.

Conceptually:

DeploymentProvider

Inputs such as:

- tenant
- desired isolation
- resource profile

Outputs/state such as:

- provisioning state
- operational state
- allocation status

The core domain must not be coupled directly to:

- AWS
- Azure
- Vultr
- DigitalOcean
- Docker hostnames

Provider-specific implementation belongs behind an adapter.

Do not make irreversible production infrastructure changes without explicit approval.

---

## 20. FINANCE / UNIT ECONOMICS REQUIREMENT

Engineering controls must allow the business to understand the economics of each customer.

Ultimately we need to reason about:

subscription revenue

minus:

- compute
- storage
- backups
- bandwidth
- payment fees
- operational support

equals:

contribution margin.

Do NOT build a full accounting platform.

But make resource profiles and actual usage sufficiently observable that costs can later be assigned
or estimated.

A platform administrator should eventually be able to inspect an organisation and understand:

- plan
- subscription status
- storage allocation
- storage consumption
- active users / allowance
- deployment isolation
- support level
- relevant overrides
- billing/payment status
- runtime health/warnings

---

## 21. MANUAL INVOICE / ACTIVATION

Claude's payment audit completed successfully before the session limit.

Finding:

manual settlement mechanics already substantially exist.

Remaining work should focus on operator commercial origination/onboarding.

We need a usable workflow for:

Create/select organisation → assign plan → establish subscription → create/associate invoice →
receive external payment → authorised operator settles payment → subscription activates →
entitlements become effective → resource profile becomes effective

Do not invent a duplicate payment model.

Reuse the existing commercial aggregates/services.

---

## 22. STRIPE / AUTOMATIC PAYMENT

Automated payment-provider integration remains deferred from the current P0, but Witness should
remain ready for it.

Payment architecture:

Witness → PaymentProviderPort → future Stripe adapter

Do not block institutional market rollout solely on Stripe.

The manual invoiced flow should allow real customers to purchase and receive service.

When Stripe work begins later:

- signed webhooks
- idempotency
- replay protection
- payment reconciliation
- payment-attempt tracking
- no raw card storage

are required.

---

## 23. AUTHENTICATED APP UX

Claude attempted an authenticated-app shell audit but the background agent was terminated due to
Claude's usage limit.

Therefore THIS AUDIT IS NOT COMPLETE.

Codex should continue it.

The intended product separation is:

`www.buildwithwitness.com` = public/commercial website

`app.buildwithwitness.com` = signed-in operational product

The current live app has historically mixed marketing and product navigation.

Clean this up.

---

## 24. `/workspaces` AS RETURNING-USER LANDING

For existing authenticated users, `/workspaces` should become the primary working destination unless
repository/domain inspection reveals a stronger established route.

The page should immediately answer:

"Where can I work?"

Prioritise:

- organisation context
- available workspaces/programs
- recent/continuable work where existing data supports it
- capture/action entry points where authorised
- Help & Knowledge

Do not fill it with marketing copy.

Do not build speculative dashboards without useful real data.

---

## 25. AUTHENTICATED APP INFORMATION ARCHITECTURE

Audit current routes/components first.

Use existing design system and domain terminology.

A likely hierarchy is approximately:

Workspaces / Programs Sessions Evidence / Records Decisions Actions Reports Help & Knowledge

Administration/account area may contain:

Organisation People Billing / Subscription Usage Governance Settings

Do not blindly rename working domain concepts.

Inspect existing terminology first.

The goal is clarity, not cosmetic churn.

---

## 26. PRICING INSIDE THE APP

Pricing should not be a top-level everyday work-navigation item.

For signed-in customers, commercial information belongs under:

Organisation → Subscription / Plan / Usage

The public website may continue to expose pricing for customer acquisition.

The signed-in app should focus on work.

---

## 27. FIRST-TIME / EMPTY EXPERIENCE

An authenticated user with no accessible workspace/program must not see an unexplained blank page.

Explain:

- current organisation context
- whether access exists/pends
- what the user can do next
- appropriate admin/contact route

Do not expose administrator-only controls.

---

## 28. SECURITY REQUIREMENTS

This market-readiness work is security-sensitive.

Test at minimum:

- cross-organisation resource visibility
- quota bypass
- concurrent upload quota race
- cross-organisation override mutation
- commercial override privilege escalation
- manual payment privilege abuse
- subscription spoofing
- client-side entitlement bypass
- tenant crossover
- IDOR
- storage path traversal
- unbounded uploads
- malicious upload metadata
- signed URL misuse if relevant
- invalid resource-profile values
- fail-closed behaviour

Commercial/resource administration remains platform-admin-only where appropriate.

Organisation administrators may inspect only their own permitted commercial/usage information.

---

## 29. OBSERVABILITY

Add appropriate operational signals for:

- quota rejection
- approaching quota
- resource measurement failures
- failed commercial configuration resolution
- subscription activation
- payment settlement
- provisioning failures
- tenant/runtime failures

Do not put customer evidence/content into telemetry unnecessarily.

---

## 30. CURRENT TASK LIST WHEN CLAUDE STOPPED

Claude reported:

16 tasks total.

3 done.

1 in progress.

12 open.

The visible work included:

IN PROGRESS:

- Implement ResourceProfile runtime resolution + storage quota enforcement

OPEN:

- Implement usage metering API (`getOrganisationUsage`)
- Implement threshold events (70/85/95/100%) as configuration
- Platform admin resource/usage dashboard + organisation self-service usage view
- Implement manual/invoiced subscription activation flow

Additional tasks were present in Claude's task list but were not visible in the final terminal
output because the session ended.

Reconstruct the remaining tasks from this handoff and repository state rather than inventing
unrelated work.

---

## 31. COMPLETED MILESTONES

Relevant completed/advanced milestones include:

## Commercial front door

Public website/commercial front-door work has already been built and deployed previously.

Do not restart the marketing-site project.

## Help & Knowledge

PR #262 open.

Version-aware, permission-filtered documentation search implemented and validated.

## Commercial Entitlements

PR #264 open.

Includes:

- ResourceProfile
- DeploymentIsolation
- SupportLevel integration
- effective commercial configuration
- organisation-specific commercial overrides
- operator APIs/UI
- migration/tests/security validation

## Billing foundations

Existing repository already contains substantial commercial domain functionality including:

- invoices
- payments
- subscriptions
- manual settlement
- entitlement activation

Do not duplicate these.

---

## 32. OPEN / DEFERRED FEATURES

These are not current P0 unless required by dependencies.

## Zoom / Teams / BBB meeting-source integration

Desired eventually.

Architecture should be provider neutral.

Imported meeting material must remain source material, not automatically institutional truth.

Potential future domain:

MeetingProvider Meeting Participant TranscriptSource MeetingArtifact EvidenceImport ConsentRecord
ExternalSourceReference

Do not implement this before commercial runtime readiness.

## AI Help / RAG

Deferred.

Help & Knowledge substrate must remain authoritative.

## Automated Stripe checkout

Deferred until commercial runtime/manual institutional onboarding is reliable.

## CommercialAgreement aggregate

Known existing gap / Gate F.

Do not let it derail current runtime work unless actual implementation requires it.

## Formal ADR ratification

Governance process may continue separately.

Do not block safe reversible implementation merely for ceremony unless the repository's constitution
explicitly requires approval.

---

## 33. KNOWN REPOSITORY / CI ISSUES

There are previously identified unrelated repository-wide CI problems tracked separately.

Examples previously referenced:

- issue #263
- issue #265
- `apps/web/test/brand-contract.test.ts`

Do not contaminate feature PRs merely to fix unrelated main/repository failures.

First establish whether a failing check:

A. was introduced by current work; or B. reproduces on the appropriate base branch.

Fix A in the current branch.

Track/fix B separately.

Never silently bypass required security gates.

---

## 34. BRANCH / PR DISCIPLINE

Do not lose the stacked relationship.

Current relevant stack:

main │ ├── PR #262 — feat/help-knowledge-search │ └── PR #264 — feat/commercial-entitlements │ └──
current commercial-runtime branch

PR #262 and #264 are separate feature concerns.

The commercial-runtime branch was intentionally based on `feat/commercial-entitlements`.

Do not accidentally merge Help & Knowledge into the commercial runtime branch unless Git history
legitimately contains it.

Before changing anything:

- inspect current branch
- inspect merge base
- inspect `git status`
- inspect `git log`
- inspect diff versus parent/base

Do not rewrite or force-push established branches without a concrete reason.

---

## 35. BUILD ORDER FROM HERE

Codex should proceed in this order:

1. Inspect current branch/status and preserve all Claude work.
2. Verify stacked-base relationship with `feat/commercial-entitlements`.
3. Read PR #264 implementation and domain model.
4. Continue storage/resource audit.
5. Finish ResourceProfile runtime resolution.
6. Implement storage quota accounting.
7. Implement server-side quota enforcement.
8. Add concurrency/race-safety where required.
9. Implement authoritative organisation usage service/API.
10. Implement configurable threshold events.
11. Add platform admin resource/usage visibility.
12. Add organisation-appropriate self-service usage visibility.
13. Implement missing operator commercial origination/activation workflow using existing settlement
    domain.
14. Verify subscription lifecycle behaviour.
15. Establish provider-neutral deployment/provisioning boundary.
16. Add observability.
17. Threat-model and add adversarial/security tests.
18. Run relevant unit/integration/live DB suites.
19. Finish authenticated application shell/navigation audit.
20. Clean authenticated application navigation.
21. Make `/workspaces` a strong returning-user landing experience.
22. Move subscription/pricing controls to appropriate organisation/account context.
23. Test mobile/tablet/desktop/accessibility.
24. Open clean reviewable PR(s).

If frontend work makes the runtime PR too large, split:

`feat/commercial-runtime-readiness`

and:

`feat/authenticated-app-shell`

Domain/API contracts should come first.

---

## 36. DEFINITION OF COMMERCIAL RUNTIME DONE

A real organisation should be able to:

Create organisation → assign subscription → resolve entitlements → assign effective resource profile
→ establish tenant → activate subscription → users sign in → users access purchased capabilities →
users land in their working environment → usage is measured → storage limits are enforced → one
organisation cannot access another's resources → operator can inspect usage → organisation can
inspect appropriate plan/usage → negotiated override works → commercial changes are audited

That is the release criterion.

Not another architecture document.

---

## 37. DEFINITION OF MARKET-READY NEXT STAGE

Before broad paid rollout we should be able to confidently answer:

- What did this organisation buy?
- What can they access?
- What infrastructure capacity are they entitled to?
- What are they actually consuming?
- Can they exceed their allocation?
- Can they access another organisation's data?
- What happens when they hit capacity?
- What happens if payment/subscription state changes?
- Can an operator intervene safely?
- Can the organisation understand its own plan and usage?
- Does the app take users directly to useful work?

If any answer is unknown, that is a market-readiness gap.

---

## 38. CODEX OPERATING INSTRUCTIONS

Act as the senior engineering team responsible for finishing Witness for real market use.

Do not restart architecture from scratch.

Do not generate large speculative documents instead of implementing.

Read the repository first.

Reuse existing domain models and services.

Keep one coherent concern per branch.

Make the smallest complete vertical slice.

Run tests throughout implementation.

Treat tenant isolation, authorisation, provenance, payment settlement and resource enforcement as
security boundaries.

Do not make destructive production changes without explicit human approval.

Do not ask for permission between safe reversible development steps.

If blocked by an external credential or irreversible infrastructure operation:

- complete everything else;
- document the exact human action;
- continue with unblocked work.

Stay focused on shipping a commercially operable Witness.
