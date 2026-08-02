# ADR-0019: Indigenous data sovereignty

| | |
|---|---|
| **Status** | Accepted — **requires external review before Phase 4** |
| **Date** | 2026-07-31 |
| **Deciders** | Governance Lead, CTO, Steering Committee |
| **Consulted** | *Outstanding: external Indigenous data governance review, compensated, before implementation* |
| **Related** | ADR-0008 (consent), ADR-0012 (provenance) |
| **Principles engaged** | **P5 (Indigenous Data Sovereignty designed in)** |

## Context

Witness will be used to record the knowledge of Indigenous and traditional-owner communities — land
negotiations, cultural heritage consultations, native title processes, community governance.

The history here is not neutral. Indigenous knowledge has been extracted, recorded, published,
archived and profited from without consent for two centuries, often by researchers and governments
acting in good faith under the standards of their day. Archives around the world hold recordings that
communities never agreed to and cannot get back. A system that captures conversations and makes them
searchable is, without deliberate design, a very efficient instrument for repeating that harm.

Standard privacy frameworks do not address this. GDPR-style models are built on **individual** rights,
and they cannot express:

- Knowledge that belongs to a **community**, not to the individual who spoke it
- Authority to consent that rests with **custodians** under customary law, not the speaker
- Knowledge that is **restricted by cultural protocol** — by gender, initiation status, season, or
  kinship — where "who may see this" is not a role in an access control list
- The right to withdraw knowledge **entirely and permanently**, including from derived works
- Knowledge that must **never be exported**, aggregated or published under any circumstances

## Decision

> We will treat Indigenous Data Sovereignty as an architectural requirement, implementing the **CARE
> Principles** and **OCAP®** as system capabilities, not as policy documentation.

Five concrete mechanisms:

1. **Community as a first-class subject type.** `subject_type = community`, able to hold consent
   grants in its own right. Not a group of individuals — a subject.
2. **Delegated consent authority.** `consent_delegation` records that named custodians hold authority
   to grant or revoke on the community's behalf, with the basis for that authority recorded.
3. **Community restriction on entities and assertions.** `community_restriction_id` is enforced at the
   policy decision point **above all other roles, including system administrator**. A platform
   administrator cannot read community-restricted knowledge. This is deliberate and is the single most
   important line in this ADR.
4. **Non-exportable classification.** Knowledge may be marked permanently non-exportable — excluded
   from every export, API response, search index and backup restore path.
5. **Total withdrawal.** A community may withdraw knowledge entirely, triggering hard erasure across
   every store and every derived work, verified, with only a non-reversible tombstone remaining.

## Options considered

### Option A — Rely on general consent and access control

**Pros:** no additional complexity.
**Cons:** cannot express collective authority, custodianship, cultural protocol or non-exportability.
Would reproduce the extractive pattern with better technology. Rejected.

### Option B — Policy and training only, no technical enforcement

**Pros:** flexible; no engineering cost.
**Cons:** a policy an administrator can override is not a control. Communities have every reason,
based on experience, not to accept a promise where a mechanism is possible. Rejected.

### Option C — Architectural enforcement *(chosen)*

**Pros:** the guarantee is structural; a community can verify it in open source rather than trust us;
supports genuine community-controlled deployment.
**Cons:** substantial complexity; an access control model where administrators are not the top of the
hierarchy is unusual and will surprise operators; risk of us — mostly non-Indigenous engineers —
encoding our own misunderstanding of customary governance into software.

### Option D — Separate deployment for Indigenous organisations

**Pros:** maximum control for those communities.
**Cons:** does not help the far more common case where a *government* records a consultation with a
community. That is exactly where the risk concentrates, and it needs to work in the government's
instance. **Also supported** — community-controlled deployment is a first-class topology — but it is
not sufficient on its own.

## Consequences

### Positive

- Communities retain genuine, verifiable control over their knowledge.
- Custodial authority is representable rather than flattened into individual consent.
- Administrator override is impossible by construction — the strongest assurance we can offer.
- The architecture supports community-controlled deployment as a first-class topology.

### Negative

- Meaningful complexity in the authorisation model, and an unusual hierarchy that operators must be
  taught rather than assume.
- Operational awkwardness: a platform administrator debugging an issue involving restricted knowledge
  cannot inspect the data. Support procedures must work around this rather than around the control.
- Risk of designing this badly. **We are not the experts here** and cannot become them by reading.
- Export and backup paths become more complex, with permanently excluded classes.

### Risks accepted

- **That we have modelled customary governance incorrectly.** This is the primary risk and it is not
  resolvable by engineering effort. Mitigation: the external review below is a hard gate, and the
  model must be revised on its findings even at significant cost.
- Legitimate operational access being blocked in an emergency. Accepted deliberately — a break-glass
  mechanism that administrators could invoke would defeat the guarantee entirely. Communities may
  configure their own emergency delegation if they choose to; we will not build a back door for
  operators.

## Compliance and enforcement

- Community restriction is evaluated at the PDP **before** any role-based decision; there is no role
  that bypasses it.
- Adversarial CI test: a system administrator attempting to read community-restricted knowledge
  through API, GraphQL, search, graph traversal, export and backup restore. **All must fail.**
- Non-exportable content is excluded at the serialisation layer, verified by test.
- Community entities are **never** auto-merged by entity resolution (`KNOWLEDGE_GRAPH.md` §6).
- All changes to this area require **Governance Lead** approval, and the Governance Lead holds an
  absolute veto on any weakening — not overridable by the CTO or the Founder.

### ⚠️ Outstanding action — hard gate

**This ADR must be reviewed by external Indigenous data governance experts, on a compensated basis,
before Phase 4 implementation begins.** It was written by people who are not the holders of this
expertise, and accepting it without that review would be exactly the pattern it exists to prevent.
Owner: Governance Lead. Tracked in [`STATUS.md`](../../STATUS.md) and the risk register.

## Reversal

Not contemplated. Weakening these guarantees would be a breach of the commitment the project makes to
the communities it serves. Any change requires Steering Committee approval and is subject to the
Governance Lead's veto.

## References

- [CARE Principles for Indigenous Data Governance](https://www.gida-global.org/care) — Global
  Indigenous Data Alliance
- [OCAP® — Ownership, Control, Access, Possession](https://fnigc.ca/ocap-training/) — First Nations
  Information Governance Centre
- [UN Declaration on the Rights of Indigenous
  Peoples](https://www.un.org/development/desa/indigenouspeoples/declaration-on-the-rights-of-indigenous-peoples.html),
  Art. 31
- [Maiam nayri Wingara Indigenous Data Sovereignty Principles](https://www.maiamnayriwingara.org/)
- [`docs/governance/INDIGENOUS_DATA_SOVEREIGNTY.md`](../../docs/governance/INDIGENOUS_DATA_SOVEREIGNTY.md)
