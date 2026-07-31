# Technical Debt Register

**Owner:** CTO
**Status:** Active
**Review:** Every release; audited quarterly

---

## What counts as debt

**Debt** is a deliberate shortcut, taken knowingly, with a reason, recorded with an owner and a
review date. It is a legitimate engineering tool.

**Rot** is an accidental shortcut nobody recorded. It is a defect, and it is fixed as one.

The distinction is the record. If you are about to write "we'll clean this up later", either log it
here **in the same pull request** or do not write it.

## Rules

1. Debt is logged **in the pull request that incurs it**, never afterwards.
2. Every entry has an **owner** and a **review date**. Debt without an owner is rot.
3. Each release allocates capacity to debt reduction. If features consistently consume that capacity,
   that is reported to the Steering Committee — it is a strategic signal, not a scheduling detail.
4. **Security exceptions always have an expiry date.** An open-ended exception is a permanent
   weakening disguised as a temporary one, and we do not grant them.
5. Debt that is deliberately accepted permanently is not debt — it is a design decision, and it
   belongs in an ADR.

## Severity

| Level | Meaning | Target |
|---|---|---|
| **S1** | Actively causing defects, security exposure or blocking work | Next release |
| **S2** | Slowing development or increasing risk measurably | Within 2 releases |
| **S3** | Untidy; no measurable impact yet | Opportunistic |
| **S4** | Cosmetic | May never be paid; review annually and close if not worth it |

Closing S4 items as "won't fix" is healthy. A register that only grows is a list of things we are
quietly not doing.

## Register

*No entries yet — Witness is pre-implementation ([`STATUS.md`](../../STATUS.md)). The format below
is illustrative and will be replaced by real entries as they are incurred.*

| ID | Title | Severity | Incurred | Owner | Review by | Rationale | Exit |
|---|---|---|---|---|---|---|---|
| *TD-001* | *(example) Prisma cannot express the bitemporal window query; hand-written SQL in the assertion repository* | *S3* | *—* | *Backend Lead* | *—* | *ORM limitation; raw SQL is correct and tested* | *Revisit if Prisma adds support* |

### Entry format

```markdown
### TD-NNN — <title>

**Severity:** S1–S4
**Incurred:** YYYY-MM-DD in #PR
**Owner:** <role>
**Review by:** YYYY-MM-DD
**Area:** <path or domain>

**What was done and why**
The shortcut, and the reason it was the right call at the time.

**Cost of carrying it**
What it makes slower, riskier or harder. Be concrete.

**What it would take to fix**
Estimated effort and approach.

**Trigger to fix**
The event, scale or date that makes this urgent.
```

## Known debt accepted by design

Not debt — deliberate decisions, recorded so nobody "fixes" them without understanding why:

| Item | Why accepted | ADR |
|---|---|---|
| Deep coupling to PostgreSQL | An abstraction over Postgres would waste the capability we chose it for | [ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md) |
| Next.js coupling in the web app | Framework-level replaceability is not worth the cost at the UI layer | [ADR-0002 / TECH_STACK](../../architecture/TECH_STACK.md) |
| Postgres as a single point of failure | Deliberate; the alternative is distributed consistency across four stores | [ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md) |
| Human review as a throughput ceiling | The control *is* the product | [ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md) |
| Two API surfaces to maintain | Serving both our UI and external integrators well requires both | [ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md) |
| Denormalised `session.consent_state` | On the hot path of the most important safety check in the system | [DATA_MODEL](../../architecture/DATA_MODEL.md) |

If you find yourself wanting to remove one of these, read the ADR first. If you still disagree, write
a superseding ADR — that is the correct route, and it is welcome.

## Quarterly audit

The CTO reviews:
- Entries past their review date (a missed review date is itself a signal)
- Trend: is the register growing faster than it shrinks?
- Whether debt-reduction capacity was actually used, or absorbed by features
- Whether any S1 or S2 item has been carried for more than two releases
- Whether any security exception is approaching or past expiry

Results go into the retrospective and, if the trend is bad, to the Steering Committee. A register
nobody audits becomes a graveyard, and a graveyard is indistinguishable from having no register.
