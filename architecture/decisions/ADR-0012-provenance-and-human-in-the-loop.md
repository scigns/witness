# ADR-0012: Provenance and human-in-the-loop

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | CTO, Principal Architect, Governance Lead, AI Lead |
| **Related** | ADR-0008, ADR-0009, ADR-0011 |
| **Principles engaged** | **P3 (provenance), P4 (machine proposes, human disposes)** |

## Context

An LLM reading a transcript will produce plausible, well-formed, confidently-stated assertions. Some
will be wrong. Some will be subtly wrong in ways that matter enormously — attributing a commitment to
the wrong person, inverting a conditional ("we will fund this if X" becoming "we will fund this"), or
inferring a decision from a discussion that reached no decision.

If those assertions enter the institutional record as fact, Witness does not preserve institutional
memory. It manufactures false institutional memory, with the authority of a system, at scale. That
is worse than the problem we set out to solve.

Separately, an assertion whose origin cannot be traced is useless for the auditor, the ombudsman and
the community member who wants to check what was recorded about them. "The system says so" is not
evidence.

## Decision

> We will make provenance a **required, non-nullable structural property** of every assertion, and we
> will require **human confirmation** before any model-derived candidate becomes institutional record.

**Provenance.** An `Assertion` cannot be constructed without a `ProvenanceChain` containing: source
utterance IDs with character offsets, the media object and time range, the extraction run with model
ID, model version, prompt ID and prompt hash, the confirming human and timestamp, and the consent
grant IDs under which processing was lawful. There is no "unknown" variant and no nullable field. An
assertion without provenance is not representable in the type system.

**Human-in-the-loop.** Extraction produces `CandidateAssertion` records. Candidates are a distinct
type from assertions — not a status flag on the same type — so the compiler prevents a candidate from
being used where an assertion is required. Only `curation.candidate.confirmed.v1` or
`.corrected.v1` creates an `Assertion`.

Confidence scores are always shown to users. We never present an inference as a fact.

## Options considered

### Option A — Auto-accept above a confidence threshold
**Pros:** dramatically higher throughput; human review is the known bottleneck (risk A-6).
**Cons:** confidence scores from LLMs are poorly calibrated, and the errors that matter most — a
misattributed commitment, an inverted conditional — are frequently high-confidence. Threshold-based
auto-acceptance would systematically admit the most dangerous errors. **Rejected**, and this is the
single most consequential rejection in the project.

### Option B — Human confirmation for everything *(chosen)*
**Pros:** no unverified model output ever becomes institutional record; neutralises most prompt-injection
risk structurally; every assertion has a named accountable human; corrections become a high-quality
evaluation signal.
**Cons:** human review is a hard throughput ceiling. A four-hour session may produce hundreds of
candidates. This is a real product constraint, not a rounding error.

### Option C — Auto-accept low-stakes types, review high-stakes
**Pros:** better throughput; keeps the gate where it matters most.
**Cons:** the boundary is not stable — an apparently low-stakes attendance record becomes high-stakes
in a dispute about who was in the room. Every attempt to draw the line produced a case that crossed
it. **Deferred, not rejected**: revisit with real data from Phase 5 evaluation, and if adopted it
requires its own ADR and Governance Lead approval.

### Option D — Provenance as optional metadata
Rejected. Optional provenance is absent provenance within two years.

## Consequences

### Positive
- **No unverified model output enters the institutional record.** The central trust property.
- Prompt injection is structurally neutralised — a forged assertion still requires a human to confirm it.
- Every assertion answers "why do you believe this?" with playable audio and a named human.
- Rejections and corrections form a continuously growing, expert-labelled evaluation set at no extra cost.
- The system is defensible to an auditor, a regulator and a community council.

### Negative
- **Human review is the throughput bottleneck of the entire product** (risk A-6). This constrains how
  much material an institution can process, which is a genuine product limitation we should state
  plainly to prospective adopters rather than discover with them.
- Review UX becomes a primary product surface requiring serious design investment — batch
  adjudication, confidence-based triage, keyboard-first workflows.
- Storage overhead: provenance chains are a meaningful fraction of total data volume.
- Contributor friction: every code path creating knowledge must thread provenance through.

### Risks accepted
- **Rubber-stamping.** A reviewer under time pressure clicking "confirm" on everything defeats the
  control entirely. This is the most serious residual risk and it is behavioural, not technical.
  Mitigations: measure review duration per decision and flag implausibly fast sessions; sample-audit
  confirmations; design the UX so careful review is faster than careless review; report correction
  rates per reviewer as a quality signal, never as a performance metric used against people.
- Review backlog making the system feel unusable. Mitigation: honest queue metrics, triage by
  confidence and importance, and clear guidance that not everything needs to be processed.

## Compliance and enforcement

- `Assertion` and `CandidateAssertion` are distinct types; no coercion exists. Enforced by the compiler.
- `ProvenanceChain` is a non-nullable constructor parameter; the database enforces `NOT NULL` foreign
  keys on `assertion.provenance_chain_id`, `entity_attribute.assertion_id` and
  `relationship.assertion_id`.
- **Invariant test:** every node and edge in a projected graph resolves to at least one confirmed
  assertion. A violation fails the build.
- The projector ignores unconfirmed candidates by default.
- Adversarial test: attempt to create an assertion directly from extraction output, bypassing review.
  Must fail.
- Review duration is recorded; anomalously fast decisions are surfaced to the Governance Lead.

## Reversal

Weakening the human gate — for example Option C — requires an ADR, Steering Committee approval, and
is subject to the Governance Lead's absolute veto. Weakening provenance is not contemplated; it would
change what the product is.

## References

- [`KNOWLEDGE_GRAPH.md` §5](../KNOWLEDGE_GRAPH.md) · [`DATA_MODEL.md` §3](../DATA_MODEL.md) · [W3C PROV-O](https://www.w3.org/TR/prov-o/)
