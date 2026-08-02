# Decision Log

**Owner:** Governance Lead
**Status:** Active

Non-architectural decisions — governance, process, product and organisational. Architectural
decisions live in [`architecture/decisions/`](../../architecture/decisions/) as ADRs.

**Why both.** ADRs cover decisions that are expensive to reverse in *code*. This log covers decisions
that are expensive to reverse in *the organisation* — and those are just as easy to lose and just as
costly to re-litigate.

## Format

```markdown
### D-NNN — <title>
**Date:** YYYY-MM-DD · **Decided by:** <role> · **Status:** Active | Superseded | Reversed

**Question.** What was being decided.
**Decision.** What we decided, in the active voice.
**Reasoning.** Why — including the alternative we rejected and what it would have cost us.
**Revisit when.** The evidence or event that should reopen this.
```

---

## Open decisions

Tracked in [`STATUS.md`](../../STATUS.md) until resolved, then recorded here.

| # | Decision | Owner | Needed by |
|---|---|---|---|
| D-1 | Confirm Apache-2.0 for `sdk/` and `packages/contracts/` with copyright holders | Open Source Lead | **Phase 2** |
| D-2 | Event transport: NATS JetStream vs Postgres-only for small deployments | Backend Lead | Phase 3 |
| D-3 | ASR engine composition: faster-whisper / whisper.cpp / WhisperX | AI Lead | Phase 5 |
| D-4 | Graph store: Neo4j Community vs Apache AGE for constrained deployments | KG Lead | Phase 4 |
| D-5 | Foundation host for long-term stewardship | Founder | Phase 8 |
| ~~D-6~~ | ~~Product and architecture reconciliation~~ | CTO & Founder | ✅ **Resolved 2026-08-01** — see below |

D-1 is the most time-sensitive. It is trivial to resolve now and becomes practically impossible once
the SDK and contract directories carry substantive third-party contributions, because relicensing
would require every contributor's agreement.

---

## Recorded decisions

### D-000 — Record non-architectural decisions

**Date:** 2026-07-31 · **Decided by:** CTO, Governance Lead · **Status:** Active

**Question.** ADRs cover architecture. Where do governance, process and product decisions go?

**Decision.** This log. Same discipline, lower ceremony — no seven-day discussion period, no dual
approval, but the same requirement to record the reasoning and the rejected alternative.

**Reasoning.** We considered folding these into ADRs and rejected it: diluting the ADR directory with
process decisions would make it less likely to be read, and the ADR ceremony is disproportionate for
a decision about meeting cadence. We also considered not recording them at all, which is the status
quo everywhere and is precisely how organisational knowledge evaporates.

**Revisit when.** If this log is not being used, that is a signal the ceremony is still too high — or
that decisions are being made without being recorded, which is worse and needs a different response.

### D-6 — Product and architecture reconciliation

**Date:** 2026-08-01 · **Decided by:** CTO, Founder, Principal Architect · **Status:** Resolved
**Recorded as:** [ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)

**Question.** The repository contained two foundational document sets describing two different
products on two different architectures — one scoping Witness to institutional memory from
conversations, the other to a Pacific multi-sector DPI platform including geospatial intelligence.
Both were presented as current. Which is authoritative?

**Decision.** `VISION.md` is the canonical product definition. ADR-0000 to ADR-0020 are the canonical
architecture. The four overlapping documents from `main` are superseded and `memory/changelog.md` —
which recorded implementation work that had never happened — is removed.

**Reasoning.** Two considerations decided it. First, the ADR set records *why* each choice was made,
with alternatives and costs; the other set records only *what*. A record with reasoning survives a
change of team. Second, the alternative specified OpenAI as the inference provider and Cloudflare and
Azure as infrastructure, which contradicts principle P1 and the `VISION.md` anti-goal against
third-party model defaults. Scope was tradeable; the sovereignty guarantee was not.

We considered keeping both with declared roles — a public-facing summary layer over a normative
architecture — and rejected it. A summary saying "OpenAI" over an architecture saying "local
inference only" is worse than either alone, because the summary is what gets read.

**Cost accepted.** A broader and arguably more fundable product framing was foreclosed without
stakeholder input, because none was available. This is recorded as a risk in ADR-0021 rather than
presented as a clean win.

**Revisit when.** A named institutional stakeholder requires multi-sector scope for a funded
deployment. The route is a superseding ADR through the Steering Committee — not incremental scope
creep in implementation.
