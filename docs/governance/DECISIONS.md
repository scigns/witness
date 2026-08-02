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
