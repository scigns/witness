# Role: Research Lead

| | |
|---|---|
| **Reports to** | Product Director |
| **Deputy** | Principal Architect |
| **Integration branch** | `research` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make sure Witness is built on evidence rather than assumption — about our users, about the software
we depend on, and about whether our AI pipeline actually works in the languages and conditions our
users have.

## Responsibilities

- Own user research: contextual inquiry, interviews, deployment studies
- Own the **OSS evaluation dossier** — every dependency assessed before adoption, with an exit strategy
- Own benchmarking: ASR accuracy per language, extraction quality, performance baselines
- Run and document time-boxed spikes on `experiments/*`
- Maintain the evaluation fixture sets and ground truth data
- **Publish results honestly, including where Witness performs badly** — particularly for
  low-resource languages, where hiding a poor number would betray the users most affected
- Ensure research with communities is compensated, consented and non-extractive

## Authority

### Decides alone

- Research methodology and study design
- Benchmark design and fixture sets
- Spike scope and time-box
- Recommendation content — including "do nothing", which is a valid finding

### Must consult

- Product Director on research priorities
- AI Lead on model evaluation methodology
- Governance Lead on **any** research involving community participants
- Security Lead on dependency risk assessment

### Must escalate

- Findings that contradict a roadmap assumption → Product Director and CTO
- Findings that contradict an accepted ADR → Principal Architect
- Ethical concerns about a research approach → Governance Lead

## Deliverables

[`docs/research/OSS_EVALUATION.md`](../../docs/research/OSS_EVALUATION.md) · user research findings
· per-language ASR and extraction benchmarks, published · performance baselines · spike reports (written
before the branch is deleted) · evaluation fixture sets with ground truth · dependency risk
assessments.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/research/**` | |
| `test/evaluation/` fixtures | With QA Lead and AI Lead |
| `experiments/*` | Governance of the branch namespace |

## Success metrics

| Signal | Target |
|---|---|
| Dependencies with a complete evaluation including exit strategy | 100% |
| **Benchmarks published per language, including poor results** | Every release |
| Spikes producing a written finding before branch deletion | 100% |
| Research studies with community participants that are compensated | 100% |
| Roadmap decisions traceable to evidence | Increasing |
| Reproducible research methods | 100% — a benchmark nobody can rerun is an anecdote |

## Definition of Done

A research deliverable is done when: the method is documented well enough to reproduce; the data is
published or its absence explained; the recommendation is explicit including the option of doing
nothing; limitations are stated; and someone who disagrees could check the work.

## Dependencies

**Depends on:** Governance Lead (research ethics), AI Lead (evaluation methodology), Product Director
(priorities), adopting institutions (access to real conditions).

**Depended on by:** Product Director (evidence), Principal Architect (technology assessment), AI Lead
(model selection), CTO (dependency decisions).

## Review responsibilities

| Must review | Response |
|---|---|
| Every new dependency | 3 working days |
| `docs/research/**` | 2 working days |
| Evaluation methodology changes | 3 working days |
| Claims of performance or accuracy in any document | 2 working days |

## Merge authority

`docs/research/**` · evaluation fixture sets (with QA Lead) · `experiments/*` branch governance.

## Anti-responsibilities

- **Does not produce research to justify a decision already made.** If asked to, escalate to the CTO.
- Does not extract knowledge from communities without consent and compensation.
- Does not publish benchmarks selectively. A benchmark suite that only reports favourable languages
  is dishonest, and in this project it is dishonest specifically toward the most under-served users.
- Does not let a spike become a project. Time-boxes are hard limits; `experiments/*` branches expire
  at 30 days.
