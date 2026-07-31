# ADR-0000: Record architecture decisions

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | CTO, Principal Architect |
| **Principles engaged** | P6 (decades, not quarters) |

## Context

Witness has a ten-year design lifetime and is intended to outlive its founders. Over that horizon
every person currently working on it will leave. The code will survive; the reasoning behind it
will not, unless we write it down deliberately.

The specific failure we are guarding against is well documented in long-lived systems: a maintainer
encounters a design choice that looks wrong, cannot find a rationale, "fixes" it, and rediscovers
the original constraint the hard way — often in production, often years later. The inverse failure
is equally costly: a choice that *was* wrong persists for a decade because nobody knows whether it
was load-bearing, and nobody dares touch it.

Institutional memory loss is the problem Witness exists to solve for its users. It would be
indefensible to fail at it ourselves.

## Decision

> We will record every architecturally significant decision as an Architecture Decision Record in
> `architecture/decisions/`, using the format in `templates/adr/ADR-TEMPLATE.md`.

A decision is architecturally significant if it is expensive to reverse: technology introduction or
removal, service or context boundaries, data model or core ontology changes, anything affecting
consent, provenance, security or sovereignty, or any pattern others are expected to follow.

ADRs are **immutable once accepted**. Corrections come as new ADRs that supersede old ones.
**Rejected ADRs are kept and merged**, never deleted.

## Options considered

### Option A — ADRs in the repository *(chosen)*
Markdown, versioned with the code, reviewed through the normal pull request process.
**Pros:** lives with the code it describes; reviewed by the same people through the same mechanism;
survives any tool migration; greppable; diffable; available offline and air-gapped.
**Cons:** less discoverable than a wiki for non-engineers; requires discipline to maintain.

### Option B — Wiki or Confluence
**Pros:** friendlier editing, better for non-engineers.
**Cons:** drifts from the code immediately; dies with the hosting vendor; not reviewable in the same
workflow; usually not available to an air-gapped operator reading the source. We have all watched
this fail.

### Option C — Long-form design docs only
**Pros:** more narrative space.
**Cons:** design docs describe an intended future state and are rarely updated when reality
diverges. ADRs record a decision at a point in time, which stays true even when superseded. We use
both — RFCs (`templates/rfc/`) for exploration, ADRs for the decision that results.

### Option D — Nothing formal; rely on commit messages and code comments
**Pros:** zero process cost.
**Cons:** this is the default path to the exact failure described in Context. Rejected.

## Consequences

### Positive
- A new contributor can reconstruct the reasoning of the entire system from one directory.
- Decisions get better simply by being written for an audience: articulating alternatives fairly
  surfaces weak reasoning before it becomes code.
- Disagreement becomes structured. "Write an ADR" converts an argument into a proposal.
- Reversals become tractable — we know what we assumed and can check whether it still holds.

### Negative
- Real overhead. Writing a good ADR takes one to three hours.
- Risk of ceremony: ADRs written for trivial decisions dilute the signal in the directory.
- Risk of staleness: an accepted ADR describing an approach we quietly abandoned is worse than no
  ADR, because it misleads with authority.

### Risks accepted
That the process decays into box-ticking. Warning signs: ADRs with empty "Negative" sections; ADRs
written after the code was merged; declining ratio of rejected to accepted ADRs (if we never reject
one, we are not really deciding). Reviewed quarterly.

## Compliance and enforcement

- A pull request labelled `architecture` without a linked ADR fails the `adr-governance` CI check.
- The template requires a non-empty "Negative consequences" section; CI checks it is not left as
  the placeholder.
- ADR changes require Principal Architect **and** CTO approval via CODEOWNERS.
- Quarterly review sweeps for ADRs contradicted by the current codebase.

## Reversal

Cheap to abandon — stop writing them. But the accumulated records would remain valuable, so any
reversal should preserve the directory. We would revisit if ADRs were demonstrably not being read;
the test is whether they get cited in review, which we can measure.

## References

- Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011)
- [MADR](https://adr.github.io/madr/) — the template lineage this one draws on
- [`docs/engineering/ADR_PROCESS.md`](../../docs/engineering/ADR_PROCESS.md)
