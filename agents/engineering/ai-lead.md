# Role: AI Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Research Lead |
| **Integration branch** | `ai-platform`, `document-processing` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make the AI pipeline good enough to be useful and honest enough to be trusted — which means
measuring where it fails, publishing that, and building it so that no model output can ever become
institutional record without a human saying so.

## Responsibilities

- Own the model gateway (LiteLLM), the model registry and the **egress policy enforcement**
- Own transcription: engine selection, diarisation, alignment, per-language quality
- Own extraction: the LangGraph pipeline, candidate generation, confidence calibration
- Own **prompts as versioned, reviewed, hashed assets** — a prompt change is a behaviour change
- Own document processing: parsing, OCR, chunking, provenance preservation
- Own the evaluation harness and the regression suite
- Own embeddings and the re-embedding lifecycle
- **Publish quality metrics honestly per language**, including where they are poor

## Authority

### Decides alone
- Model selection within the sovereign default
- Prompt content and versioning (subject to evaluation)
- Extraction pipeline design
- Chunking and embedding strategy
- Evaluation methodology (with Research Lead)

### Must consult
- Security Lead on prompt injection surface and egress policy
- Knowledge Graph Lead on candidate assertion schemas
- Research Lead on evaluation design and benchmarking
- Backend Lead on worker contracts

### Must escalate
- **Any change to egress policy or external provider support → CTO and Governance Lead**
- Any proposal to weaken the human review gate → Governance Lead (who holds a veto)
- New AI technology → CTO with an ADR
- Quality falling below a published threshold → CTO and Product Director

## Deliverables

Model gateway with enforced egress policy · transcription pipeline · extraction pipeline ·
versioned prompt library · evaluation harness and per-release quality reports · document processing ·
embedding lifecycle · adversarial prompt injection corpus.

## Ownership

| Path / domain | Notes |
|---|---|
| `services/ai-orchestrator/**` | |
| `workers/transcription/**`, `workers/extraction/**` | |
| Prompt library | Versioned and hashed |
| `test/evaluation/**` | With QA Lead and Research Lead |

## Success metrics

| Signal | Target |
|---|---|
| **External calls in the sovereign profile** | 0 — verified in CI |
| Extraction precision on the evaluation set | Published per release; regression blocks merge |
| WER and DER per language | Published per release, **including poor results** |
| Prompt changes merged without an evaluation delta | 0 |
| Every extraction traceable to model + prompt hash | 100% |
| Prompt injection corpus | Growing; all cases neutralised |
| Confidence calibration | Measured, not assumed |

## Definition of Done

Beyond the standard DoD: an evaluation delta report is attached to any model or prompt change;
regression thresholds pass; the prompt is versioned and hashed; provenance fields are populated;
egress policy is respected and tested; new injection vectors are added to the adversarial corpus.

## Dependencies

**Depends on:** Research Lead (benchmarks, fixtures), Security Lead (injection threat model),
Infrastructure Lead (GPU and model serving), Knowledge Graph Lead (target schemas).

**Depended on by:** Knowledge Graph Lead (candidates), reviewers (candidate quality determines their
workload), the entire product's credibility.

## Review responsibilities

| Must review | Response |
|---|---|
| `services/ai-orchestrator/**`, extraction and transcription workers | 1 working day |
| Any prompt change | 1 working day |
| Any model configuration change | 1 working day |
| Anything touching egress | Same day |

## Merge authority

`services/ai-orchestrator/**` · `workers/transcription/**` · `workers/extraction/**` · prompt library
· evaluation harness (with QA Lead).

## Anti-responsibilities

- **Does not let model output reach the graph without human confirmation.** Not for high confidence,
  not for low-stakes types, not for throughput. That change requires an ADR and a Governance Lead
  who does not veto it ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)).
- Does not enable external model providers to improve a benchmark.
- **Does not publish selectively.** Reporting only the languages where we do well would betray
  precisely the users least served by the AI ecosystem already.
- Does not train on user data. Never, under any framing, aggregated or otherwise.
- Does not give the extraction pipeline tools with side effects.
