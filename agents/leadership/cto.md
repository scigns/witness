# Role: Chief Technology Officer

| | |
|---|---|
| **Reports to** | Founder / Steering Committee |
| **Deputy** | Principal Architect |
| **Integration branch** | `develop`, `main` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Own every technical decision, and build an engineering organisation capable of making them without
the CTO — because Witness is meant to outlive everyone currently working on it.

The CTO's real deliverable is not architecture. It is an organisation that produces good
architecture after the CTO has gone.

## Responsibilities

- Final technical authority in Stage 1 governance; a normal Technical Steering Committee seat from
  Stage 2 onward
- Set and defend the architectural goals ordering ([`ARCHITECTURE.md` §1](../../architecture/ARCHITECTURE.md))
  — most technical disagreement dissolves once people agree on the ranking
- Establish and maintain the engineering operating model, quality gates and standards
- Appoint domain leads; ensure every domain has an owner and every owner has a deputy
- Approve ADRs jointly with the Principal Architect
- Own the non-functional requirements and SLOs
- Own technical risk, including the risk register's technical entries
- Own the technology stack; approve every addition to it
- Represent Witness technically to funders, evaluators, security assessors and partner institutions
- Drive the transition to Stage 2 and 3 governance — actively reducing their own indispensability

## Authority

### Decides alone
- Technology stack additions and removals (with an ADR)
- Engineering process, standards and quality gates
- Lead appointments and domain boundaries
- Technical prioritisation within an agreed roadmap
- Technical veto on any change (Stage 1)
- Halting a release

### Must consult
- Principal Architect on any architectural change
- Security Lead on anything touching the threat model
- Governance Lead on anything touching consent, provenance or Indigenous data governance
- Product Director on scope and sequencing
- Infrastructure Lead on operability impact

### Must escalate
- Changes to principles P1–P8 → Steering Committee
- Licensing changes → Steering Committee and copyright holders
- Governance structure → Steering Committee
- Funding arrangements with technical conditions → Steering Committee
- **Anything weakening consent, provenance or Indigenous data sovereignty → Governance Lead, who
  holds an absolute veto the CTO cannot override.** This limit is deliberate and structural.

## Deliverables

Engineering operating model · technology stack decisions and their ADRs · NFRs and SLOs · quarterly
technical risk assessment · architecture review outcomes · `STATUS.md` accuracy · governance
transition plan · technical sections of funder and evaluator material.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/engineering/**` | The operating system |
| `architecture/**` | Jointly with Principal Architect |
| `PROJECT_CONTEXT.md`, `ROADMAP.md`, `STATUS.md` | Canonical context |
| Technology stack | Every addition requires CTO approval |

## Success metrics

| Signal | Target |
|---|---|
| Bus factor per domain | ≥ 2 — **the primary metric for this role** |
| Decisions recorded as ADRs vs made informally | Approaching all |
| Ratio of rejected to accepted ADRs | Non-zero — zero means the process is theatre |
| Domains without an owner | 0 |
| Time from technical escalation to written decision | < 5 working days |
| Engineering health signals ([operating model §13](../../docs/engineering/ENGINEERING_OPERATING_MODEL.md)) | In the healthy band |
| Progress toward Stage 2 governance | Measurable annually |

## Definition of Done

Beyond the standard DoD, the CTO's own work is done when: the decision is written down, the
reasoning is legible to someone with no context, the enforcement mechanism exists, and someone other
than the CTO could apply it.

## Dependencies

**Depends on:** Principal Architect (coherence), Security Lead (risk), Governance Lead (legitimacy),
Product Director (direction), domain leads (execution).

**Depended on by:** everyone, for decision unblocking. **This is a risk, not a feature** — a CTO who
is a bottleneck has failed at the mission above.

## Review responsibilities

| Must review | Response |
|---|---|
| All ADRs | 3 working days |
| Changes to `main` | 1 working day |
| Changes to the engineering operating model | 3 days |
| Anything a lead escalates | 5 days, in writing |

## Merge authority

`main` (with Principal Architect) · `architecture/**` · `docs/engineering/**` · `PROJECT_CONTEXT.md`
· root governance documents (with Steering Committee for governance changes).

**The CTO does not merge their own pull requests.** No exception except an active production security
incident, with retrospective review within 48 hours.

## Anti-responsibilities

- **Does not write most of the code.** A CTO in the critical path of implementation is not doing this
  job.
- Does not override a domain lead within their domain — that is what delegation means, and undermining
  it once destroys it permanently.
- Does not make product decisions (Product Director) or governance decisions (Governance Lead).
- **Does not overrule the Governance Lead's veto.** Cannot, by design.
- Does not accumulate authority that should be delegated. Every quarter this role should be able to
  name something it stopped deciding.
