# ADR-0033: Provider-neutral meeting evidence import

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-04 |
| **Deciders** | CTO, Principal Architect, Product Lead |
| **Consulted** | Security Lead |
| **Informed** | Frontend Lead |
| **Supersedes** | none |
| **Related** | ADR-0003, ADR-0008, ADR-0010, ADR-0012, ADR-0022 |
| **Principles engaged** | P2 (consent), P3 (provenance), P4 (human disposes) |

## Context

Institutional meetings happen on Zoom, Microsoft Teams, and other platforms Witness does not
control. Customers have asked for meeting content — transcripts, recordings, chat, participant
lists — to enter Witness with the same provenance and consent discipline the rest of the product
already requires (ADR-0008: consent is a domain primitive; ADR-0012: human-in-the-loop
provenance). Today there is no code for this at all: a repo-wide search found only a system-context
diagram box ("Calendar & meetings: Exchange · Google · Teams · Zoom") and two agent persona
documents — no domain model, no ADR, no adapter.

The obvious failure mode, and the reason this needs an ADR before any code: it would be easy to
let "Zoom" or "Teams" leak into the core domain model — a `zoomMeetingId` field on some evidence
table, a Teams-shaped webhook handler sitting next to the domain logic — the same mistake
ADR-0022 names and avoids for payments by treating billing/payments as a replaceable port rather
than a Stripe-shaped core. A meeting-sourced transcript is also not automatically true: ADR-0012
already establishes that machine output proposes and a human disposes, and a transcript is exactly
this kind of proposal, not a record, until a person corroborates something from it.

No Zoom or Teams developer credentials exist in this environment. Building a live adapter against
either provider now would mean guessing at an API we cannot test against, which is worse than not
building it — Phase 1 is therefore domain model and port only.

## Decision

> We will define a provider-neutral meeting/evidence domain model
> (`MeetingProvider`, `Meeting`, `MeetingParticipant`, `MeetingArtifact`, `TranscriptSource`,
> `EvidenceImport`, `ConsentRecord`, `ExternalSourceReference`) with no Zoom- or Teams-specific
> code anywhere in the core domain, and we will treat every import as source material requiring an
> explicit human act — create evidence, record a decision, add context, register dissent, create
> an action — before it becomes part of the institutional record.

A provider adapter is a port implementation behind `MeetingProviderPort`, exactly analogous to
ADR-0022's billing/payment ports. Phase 1 ships the domain model, the port interface, and a
`manual`/fake provider for testing — no live Zoom or Teams call. A later phase, gated on real
provider credentials, implements one real adapter without touching the domain model.

## Options considered

### Option A — Provider-neutral domain + port, no live adapter yet *(chosen)*

**Description.** Domain model and port interface now; a manual/fake provider for tests; real
adapters deferred until credentials exist.
**Pros:** matches the brief's explicit Phase 1 scope; avoids guessing at an untestable API; keeps
the core domain clean per ADR-0003's hexagonal boundary; mirrors the proven ADR-0022 pattern so
there is exactly one "how do we integrate an external service" shape in the codebase, not two.
**Cons:** delivers no live meeting import yet — value is architectural, not immediately visible to
a user.

### Option B — Build the Zoom adapter directly against the core domain now

**Description.** Skip the port; have evidence-import code call the Zoom SDK directly.
**Pros:** faster to a demo if Zoom credentials appeared today.
**Cons:** couples the core domain to one vendor's shapes and auth model; a later Teams adapter
would either duplicate logic or force a late, disruptive refactor; violates ADR-0003's hexagonal
boundary and repeats a mistake ADR-0022 was written specifically to avoid for payments.
**Why not chosen:** we have no credentials to build or test it against anyway, and the brief
explicitly prohibits building two full plugins or guessing at unbuilt capability.

### Option C — Wait entirely until Zoom/Teams credentials exist

**Description.** Do nothing until a real integration is contracted.
**Pros:** zero speculative work.
**Cons:** the domain-model risk (letting vendor shape leak into core evidence/consent tables) is
highest right when a real integration is finally urgent and under time pressure — exactly the
condition under which shortcuts get taken.
**Why not chosen:** the domain model and port are cheap, reversible, and valuable even with zero
live providers, because they are what keeps a future real integration from distorting the core.

## Consequences

### Positive

- The core domain never depends on Zoom or Teams; a future BBB or other provider is just another
  port implementation.
- Consent and provenance rules apply uniformly to any meeting source, because `ConsentRecord` and
  `ExternalSourceReference` are modelled once, not per-provider.
- Imported material is structurally source material, not institutional truth, until a human
  creates evidence/decision/action/dissent from it — enforced by the data model, not just policy.

### Negative

- Ships no visible feature in this phase — pure architectural investment with no live provider.
- The eventual real adapter will surface integration details (rate limits, partial transcripts,
  webhook retries, OAuth token refresh) the port interface cannot fully anticipate until it is
  built against a real account; the interface may need a small revision at that point.
- Adds new tables (`Meeting`, `MeetingParticipant`, `MeetingArtifact`, etc.) that stay empty in
  production until a real provider or manual import is actually used — unused schema surface
  until then.

### Neutral

- Does not change any existing evidence, session or consent table — purely additive.

### Risks accepted

- We are accepting that the port interface is a best guess without a real provider to validate it
  against. Signal that it was wrong: the first real adapter implementation needs to change the
  port's method signatures rather than just filling them in.

## Compliance and enforcement

- A lint/architecture rule (or, short of that, a code review checklist item, honestly) that no
  file under the core domain package may import or reference `zoom`, `teams`, or any vendor SDK by
  name — only `services/api-gateway/src/meetings/providers/*` adapter files may.
- A test asserts `EvidenceImport` cannot be marked as evidence/decision/action without a human
  actor reference — i.e., no automatic promotion of imported material to institutional record.

## Reversal

Low cost to reverse: the domain model and manual/fake provider are additive tables and one port
interface with no external dependency. If meeting integration is deprioritised, the tables sit
unused with no running cost; if the port shape proves wrong once a real adapter is built, only the
port interface and its implementations change — the domain tables and consent/provenance rules do
not.

## References

- `architecture/decisions/ADR-0022-billing-and-payments-as-replaceable-ports.md` — the port
  pattern this ADR mirrors for an external integration.
- `architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md`,
  `architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md` — the consent/provenance
  rules this model must satisfy for any imported material.
- `architecture/SYSTEM_CONTEXT.md` — the only prior mention of Zoom/Teams in this repository.
