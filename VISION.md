# Vision

**Horizon:** 2026 – 2036
**Owner:** Founder & Chief Technology Officer
**Status:** Living document — reviewed annually at the Steering Committee

---

## The problem, stated plainly

Institutions forget.

A ministry runs a two-year consultation with sixty communities. It produces a policy. Three years
later the policy is reviewed by a team where nobody was present for the consultation. The
recordings are on a departed officer's laptop. The minutes record *what was decided* but not *why*,
*who objected*, *what evidence was weighed*, or *what was promised in return*. The communities are
consulted again, asked the same questions, and give the same answers — which is how trust dies.

This is not a failure of individuals. It is a failure of infrastructure. We have built excellent
digital public infrastructure for **identity** (national ID), **payments** (instant transfer rails)
and **data exchange** (X-Road and equivalents). We have built almost nothing for **institutional
memory**.

The cost is measurable: repeated consultation, contradicted commitments, lost corporate knowledge
at every election and every restructure, and — most corrosively — communities who correctly
conclude that being consulted changes nothing.

## What we believe

1. **Conversation is where institutional knowledge is actually created.** Documents are the
   residue, and a lossy one.
2. **Memory is infrastructure.** Like identity and payments, it should be a public good — open,
   sovereign, interoperable, and not rented from a vendor.
3. **Provenance is the product.** A claim you cannot trace is a rumour. Institutional memory
   without an evidence chain is worse than none, because it is confidently wrong.
4. **Consent is the licence to operate.** Systems that record people without their meaningful,
   revocable consent do not deserve to exist, and will eventually be shut down by regulators or
   by public revolt. Building consent in from day one is both ethics and durability.
5. **Sovereignty is not optional for public institutions.** A government that cannot run its own
   memory on its own soil, inspect its own source code, and leave without losing its data is not
   sovereign in any meaningful sense.
6. **The knowledge belongs to the people who created it.** Especially when those people are
   Indigenous communities whose knowledge has been extracted, published and profited from without
   consent for two centuries.

## The ten-year vision

> **By 2036, any public institution anywhere in the world can stand up sovereign institutional
> memory in a day, at zero licence cost, and never lose the reasoning behind a decision again.**

What that looks like concretely:

**Year 1–2 — Credible foundation.** Witness runs a full pipeline from recording to reviewed
knowledge graph. Three reference deployments in production with real institutions: one national
government, one Indigenous organisation, one development partner. Every architectural claim in
this repository is proven in the field.

**Year 3–5 — Institutional trust.** Witness is a procurement-approved option, not a pilot.
Formal security certification (ISO 27001-aligned controls, national IRAP/FedRAMP-equivalent
assessments where relevant). Interoperability with the records-management and open-data systems
governments already run. A commitment made in a community hall in 2027 is still trackable in 2032,
across three changes of government.

**Year 5–10 — Public infrastructure.** Witness is stewarded by a neutral foundation, not a
company. Multiple independent implementers and support vendors. Adopted as a Digital Public Good.
The knowledge graph schema is a recognised interoperability standard for civic decision records.
Institutions treat losing institutional memory the way they now treat losing financial records:
as a governance failure, not an inevitability.

## How we will know it worked

We reject vanity metrics. Meetings ingested is not a measure of success — a system that ingests a
million meetings nobody queries has failed.

| Signal | What it proves |
|---|---|
| **Decision retrieval rate** — % of decisions that are later successfully retrieved with their rationale | The memory is actually used |
| **Commitment closure rate** — % of recorded commitments reaching a terminal state | Accountability loop is closed |
| **Consultation reuse** — reduction in communities asked the same question twice | The core harm is reduced |
| **Cross-cohort survival** — knowledge successfully retrieved by staff who were not present | The turnover problem is solved |
| **Correction rate trend** — human corrections to AI extraction, trending down | Extraction is trustworthy |
| **Exit success** — operators who successfully export and leave | Sovereignty is real, not marketing |
| **Independent deployments** — installs we did not run ourselves | It is infrastructure, not a service |
| **Community-controlled deployments** — Indigenous organisations self-hosting | The hardest trust bar is cleared |

The **exit metric** deserves emphasis: we consider a successful, complete, painless migration
*away* from Witness to be a feature working as designed. Lock-in is the failure mode we are here
to eliminate; we will not reproduce it.

## Anti-goals

- We will not build a proprietary edition, a closed core, or a "community edition" with the
  interesting parts removed.
- We will not accept a funding structure that requires user lock-in to service the debt.
- We will not add features that score, rank, profile or evaluate individuals.
- We will not ship a default configuration that sends institutional data to a third-party model
  provider.
- We will not chase general-purpose AI-assistant features because they demo well.
- We will not take a shortcut on consent, provenance or accessibility to hit a date. Dates move.

## The stance

Witness is being built as if it will become critical national digital infrastructure, because
if it succeeds it will be. That imposes obligations most software does not carry: legibility to
outsiders, auditability by adversaries, operability by the under-resourced, and a governance
structure that survives the departure of everyone currently working on it — including its
founders.

We are building this to be inherited.

---

See also: [`MISSION.md`](MISSION.md) · [`ROADMAP.md`](ROADMAP.md) · [`GOVERNANCE.md`](GOVERNANCE.md)
· [`docs/governance/DIGITAL_SOVEREIGNTY.md`](docs/governance/DIGITAL_SOVEREIGNTY.md)
