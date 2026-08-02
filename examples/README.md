# Examples

**Owner:** Documentation Lead & Research Lead
**Status:** Phase 5 deliverable

Worked end-to-end examples with **entirely synthetic** data.

| Example | Demonstrates |
|---|---|
| [`quickstart/`](quickstart/) | Recording → transcript → candidates → review → graph, minimal |
| [`community-consultation/`](community-consultation/) | Community consent, delegated custodial authority, offline capture, commitment tracking |
| [`parliamentary-session/`](parliamentary-session/) | Public-task legal basis, formal record production, redaction, publication |

## Synthetic only — this is absolute

**Every recording, transcript and participant in this directory is fabricated.** No real person, no
real meeting, no real institution.

This is not a formality. Real institutional content in a public repository would be a breach of exactly
the trust Witness exists to protect, and "it was anonymised" is not a defence — anonymisation of
conversational speech is far weaker than people assume, because the content itself identifies.

Contributions containing real data are rejected and removal-requested.

## Ground truth

Each example ships with human-labelled ground truth: the entities, decisions and commitments that
*should* be extracted. This makes them double as an evaluation fixture set, so extraction accuracy is
measurable rather than asserted, per language.
