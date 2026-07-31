# Indigenous Data Sovereignty

**Owner:** Governance Lead
**Status:** Draft — **requires compensated external review by Indigenous data governance experts
before Phase 4 implementation. This is a hard gate, not a target.**
**Decision record:** [ADR-0019](../../architecture/decisions/ADR-0019-indigenous-data-sovereignty.md)
**Principle:** P5

---

## Who wrote this, and what that means

This document was drafted by people who are **not** the holders of the expertise it concerns. That is
a limitation, not a disclaimer — and the correct response to it is not a careful caveat but a funded
external review, which is why the status above is a gate on implementation rather than a note.

We publish the draft anyway, openly, because a document written in private and presented as finished
would be harder to challenge than one visibly in progress.

## Why this is architecture, not policy

Witness will be used to record the knowledge of Indigenous and traditional-owner communities: land
negotiations, cultural heritage consultations, native title processes, community governance.

The history is not neutral. Indigenous knowledge has been recorded, archived, published and profited
from without consent for two centuries — often by researchers and governments acting in good faith by
the standards of their time. Archives worldwide hold recordings communities never agreed to and
cannot retrieve.

A system that captures conversations and makes them searchable is, without deliberate design, an
extremely efficient instrument for repeating that harm. Better technology would simply mean a faster
version of the same thing.

**Standard privacy frameworks do not address this.** GDPR-style models are built on *individual*
rights and cannot express:

- Knowledge belonging to a **community**, not to the individual who happened to speak it
- Authority to consent resting with **custodians** under customary law
- Knowledge restricted by **cultural protocol** — by gender, initiation status, season or kinship —
  where "who may see this" is not a role in an access control list
- The right to withdraw knowledge **entirely and permanently**, including from derived works
- Knowledge that must **never** be exported, aggregated or published under any circumstances

## The frameworks we build against

| Framework | Source | What it requires of us |
|---|---|---|
| **CARE Principles** | [Global Indigenous Data Alliance](https://www.gida-global.org/care) | Collective Benefit · Authority to Control · Responsibility · Ethics |
| **OCAP®** | [First Nations Information Governance Centre](https://fnigc.ca/ocap-training/) | Ownership · Control · Access · Possession |
| **UNDRIP Art. 31** | United Nations | Right to maintain, control, protect and develop cultural heritage and traditional knowledge |
| **Maiam nayri Wingara** | Australian Indigenous Data Sovereignty Collective | Indigenous governance of Indigenous data |

CARE is deliberately positioned as complementary to FAIR (Findable, Accessible, Interoperable,
Reusable). Where they conflict — and for restricted knowledge they conflict directly — **CARE wins**.
Witness is not obliged to make everything findable, and for some knowledge it is obliged not to.

## The five mechanisms

Each is a system capability with a test, not a statement of intent.

### 1. Community as a subject

`subject_type = community`. A community holds consent grants in its own right — not as a collection
of individuals, but as a subject. Individual members may separately hold their own grants; the two are
distinct and both must be satisfied.

### 2. Delegated custodial authority

`consent_delegation` records that named custodians hold authority to grant or revoke on the
community's behalf, **with the basis of that authority recorded** — a council resolution, a customary
role, a written protocol.

We record the basis rather than asserting the authority ourselves, because who holds authority is a
matter of the community's own governance and not something a software vendor determines.

### 3. Community restriction, enforced above administrators

`community_restriction_id` on entities and assertions. Enforced at the policy decision point
**before** any role-based decision.

> **A platform administrator cannot read community-restricted knowledge.**
> There is no role that bypasses this. There is no break-glass mechanism.

This is the most important line in this document, and it is deliberately absolute. A break-glass
override that administrators could invoke would defeat the guarantee entirely — and communities have
extensive, well-founded experience of assurances that held until they were inconvenient.

**The operational cost is real:** an administrator debugging an issue involving restricted knowledge
cannot inspect the data. Support procedures work around the control; the control does not bend for
support. A community may configure its own emergency delegation if it chooses. We will not build a
back door for operators.

### 4. Non-exportable classification

Knowledge may be marked permanently non-exportable — excluded from every export, API response, search
index, aggregate and backup restore path. Enforced at the serialisation layer and verified by test.

### 5. Total withdrawal

A community may withdraw knowledge entirely. Hard erasure across every store and every derived work,
verified, leaving only a non-reversible tombstone.

Unlike individual erasure, community withdrawal may be **retrospective across an entire engagement** —
every session, every assertion, every graph node derived from a whole consultation.

## Additional protections

**Entity resolution never auto-merges Community entities.** Group identity is a matter of
self-determination, not string similarity. A system deciding that two community names refer to the
same community is making a determination it has no standing to make.

**Sensitivity never declassifies automatically.** Restricted material stays restricted until a human
with authority decides otherwise, and that decision is itself audited.

**Re-identification requires elevated authority.** Linking a pseudonymous community submission to a
named individual is a re-identification event and is treated as one.

## Community-controlled deployment

The strongest configuration: the community runs its own Witness instance, on its own infrastructure,
under its own governance. Fully supported as a first-class topology.

But the more common and higher-risk case is a **government** recording a consultation *with* a
community, in the government's instance. That is where the risk concentrates, and the mechanisms above
exist so that community control is real even when the infrastructure is not theirs.

## What we cannot do with software

Honesty about limits is part of doing this properly:

- **We cannot make a government behave well.** We can make certain misbehaviours technically difficult
  and others auditable.
- **We cannot determine who holds customary authority.** We record what the community tells us.
- **We cannot encode cultural protocol we do not understand.** We provide mechanisms; communities
  configure them.
- **We cannot undo two centuries of extraction.** We can avoid adding to it.
- **We cannot substitute good technology for a good relationship.** If an institution is not in genuine
  relationship with a community, Witness will not fix that, and a well-configured consent record may
  even make a bad process look legitimate.

That last point is the risk we watch most closely. A system that produces excellent documentation of
consultation could make an extractive consultation *more* defensible rather than less. The mitigation
is partly design — surfacing to communities what was recorded and how it was used — and partly
refusing to market Witness as consultation compliance.

## Our obligations as a project

1. **Compensated external review before Phase 4.** A hard gate. Asking people whose knowledge has
   historically been taken without payment to advise us for free would be the same pattern in a new
   costume.
2. **Indigenous data governance expertise represented and compensated on the Steering Committee.**
3. **The Governance Lead's veto** covers any weakening of these guarantees, overridable by nobody.
4. **Adversarial tests** attempting administrator access to community-restricted knowledge through
   every path — API, GraphQL, search, graph traversal, export, backup restore. All must fail.
5. **We will change the model if the review says we have it wrong**, even at significant cost. A review
   we only accept when it agrees with us is not a review.

## Open questions

Genuinely unresolved. Recorded rather than glossed.

| # | Question |
|---|---|
| IDS-1 | How is custodial authority verified without imposing an external definition of legitimacy? |
| IDS-2 | What happens when custodial authority is contested within a community? |
| IDS-3 | Can a community delegate revocation to an individual without ratification? (CF-4) |
| IDS-4 | How are seasonal or ceremonial access restrictions expressed in a policy engine? |
| IDS-5 | What happens to community-restricted knowledge if the community's governance body dissolves? |
| IDS-6 | How do we support communities who want Witness but lack infrastructure to self-host, without recreating dependency? |

**IDS-6 is the one that most troubles us.** The sovereign self-hosted model assumes an organisation
with servers and IT capacity. Many communities have neither. Telling them sovereignty is available in
principle while being unreachable in practice would make it a privilege of the well-resourced — which
is the opposite of the point. We do not have an answer yet, and we would rather say so.
