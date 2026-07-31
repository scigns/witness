# ADR-0009: AI abstraction and model sovereignty

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | AI Lead, Security Lead, CTO, Governance Lead |
| **Related** | ADR-0010, ADR-0012 |
| **Principles engaged** | **P1 (sovereignty)**, P4 (machine proposes, human disposes) |

## Context

Witness depends on language models for transcription and extraction. This creates the sharpest
tension in the project: the best-performing models are commercial APIs, and sending a recording of
an in-camera cabinet deliberation or a community's traditional knowledge to a third-party inference
provider is precisely what principle P1 exists to prevent.

Three hard constraints:

1. **Some deployments are air-gapped.** They must work with no internet at all.
2. **Some institutions are legally prohibited** from sending data outside a jurisdiction, sometimes
   outside a building.
3. **Model quality varies enormously by language.** Institutions working in low-resource languages
   are exactly those most likely to be under-served, and telling them "use the commercial API for
   acceptable quality" would make sovereignty a privilege of the well-resourced.

We also need to answer, in 2032, "which model asserted that, with which prompt?" — so model identity
is an audit requirement, not just configuration.

## Decision

> We will place all model inference behind `LanguageModelPort`, route every call through a
> **LiteLLM** gateway, and default to **local inference via Ollama**. External providers require the
> deployment profile to permit egress, per-tenant opt-in, an explicit allowlist, and are logged and
> surfaced to end users.

**The sovereign profile is the default and makes zero external calls.** A sovereign-profile instance
with an external provider configured **refuses to start** — a misconfiguration cannot silently become
a data leak.

Every extraction records: model identifier, model version, prompt identifier, prompt hash, sampling
parameters, and the pipeline version. Permanently.

## Options considered

### Option A — Local models only

**Pros:** absolute sovereignty; the simplest possible story.
**Cons:** an institution with an approved cloud arrangement and genuinely better model access is
forbidden from using it, which is paternalistic and costs us adoption. Some languages are materially
better served by frontier models today.

### Option B — External models by default, local as an option

**Pros:** best out-of-the-box quality.
**Cons:** violates P1. The default configuration would exfiltrate institutional deliberation to a
third party, and defaults are what almost everyone runs. Rejected.

### Option C — Local by default, external opt-in behind a gateway *(chosen)*

**Pros:** sovereign by default; institutions retain the choice; the gateway is a single chokepoint for
policy, logging and budget; models are swappable without application changes.
**Cons:** two paths to test and support; the temptation to enable egress for quality will be real,
and it is our job to make that decision visible rather than easy.

### Option D — Bring-your-own-model with no gateway

**Pros:** minimal infrastructure.
**Cons:** no single enforcement point for egress policy, no consistent logging, no per-tenant budgets.
Rejected — the chokepoint is the control.

## Consequences

### Positive

- Air-gapped deployment works with no special build and no disabled features beyond external models.
- Model choice is a configuration decision, not an architectural one.
- Every assertion is attributable to a specific model and prompt version, forever.
- Institutions can adopt better local models as they emerge without waiting for us.
- A single place to enforce budget, rate limits and per-tenant policy.

### Negative

- **Local model quality will be lower than frontier models for some tasks and some languages**, and
  we must publish that honestly rather than obscure it. This is the real cost of P1 and it is paid by
  users, so they deserve to know the size of it.
- Local inference needs hardware. Without a GPU, extraction is slow. The single-node profile works
  but takes hours per meeting.
- Operators must manage model weights, storage and updates.
- Two inference paths means more testing surface.

### Risks accepted

- **Quality gap** between sovereign and hybrid deployments creating a two-tier product. Mitigation:
  publish per-language evaluation results for both paths; invest in prompt engineering for local
  models specifically; treat low-resource language quality as an equity issue with named ownership.
  This is a standing concern, not a solved problem.
- Model weight supply chain — a tampered model could poison extraction. Mitigated by checksum
  pinning and operator-controlled storage, and fundamentally by the human confirmation gate.

## Compliance and enforcement

- **Startup validation:** `WITNESS_DEPLOYMENT_PROFILE=sovereign` with any external provider
  configured is a fatal configuration error. The process exits.
- **CI egress test** (`make egress-test`) runs the full stack in a network namespace with no route
  and asserts complete function. A regression that introduces a phone-home breaks the build.
- Direct model SDK imports outside the AI adapter fail a lint rule.
- Every inference call emits an audit entry with model, version, prompt hash, token counts,
  destination and tenant.
- `admin.egress_policy.changed.v1` is surfaced **to end users**, not merely logged — the people
  recorded have a right to know if the institution's posture changes.
- Prompts are versioned assets in the repository, reviewed like code, and hashed.

## Reversal

Swapping inference backends is a configuration change. Removing the gateway would mean losing the
enforcement point, which we would not do. Relaxing the sovereign default would require Steering
Committee approval and is subject to the Governance Lead's veto.

## References

- [LiteLLM](https://github.com/BerriAI/litellm) · [Ollama](https://ollama.com/) · [vLLM](https://github.com/vllm-project/vllm)
- [`docs/governance/DIGITAL_SOVEREIGNTY.md`](../../docs/governance/DIGITAL_SOVEREIGNTY.md)
