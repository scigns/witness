# AI Contributor Context

**Owner:** CTO & Principal Architect
**Status:** Active
**Audience:** AI agents contributing to Witness, and the humans who sponsor them

---

## Read this first, then stop

1. **[`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md)** — binding. Principles P1–P8 are constraints, not
   preferences.
2. **[`docs/engineering/AI_GUIDELINES.md`](../docs/engineering/AI_GUIDELINES.md)** — the rules that
   govern AI contribution.
3. **[`policies/HARD_CONSTRAINTS.md`](policies/HARD_CONSTRAINTS.md)** — things you must never do.

Then read the context file for your task area in [`context/`](context/).

## The governing principle

> **The machine proposes. The human disposes.**

This is principle P4, and it applies to how Witness is *built* exactly as it applies to what Witness
*does*. An AI can draft an implementation. A human decides it is correct, owns it, and is accountable
for it in five years when nobody remembers this conversation.

There is no arrangement in which "the model wrote it" transfers responsibility. The model is not on
the incident call, cannot be asked what it was thinking in 2031, and cannot be held accountable by a
community whose data was mishandled.

## What you may do

- Draft implementations, tests, documentation and scaffolding
- Refactor within an established pattern
- Explain unfamiliar code
- Review as a first pass
- Propose ADRs — as a *proposal*, for humans to decide

## What you may not do

| Prohibited | Why |
|---|---|
| **Approve a pull request** | Approval means "I will be woken at 3am for this" |
| **Be the sole reviewer** of security, consent, cryptography or Indigenous data governance | These need a human with relevant expertise |
| **Weaken an invariant test** to make a change pass | An invariant failing is the system working |
| **Disable a CI gate** | If a gate is wrong, a human changes it deliberately |
| **Paste secrets, personal data or real recordings into any model** | Including locally hosted ones |
| **Make architectural, product or governance decisions** | Propose; do not decide |
| **Repository-wide refactors** | Scope is bounded |
| **Claim a source you have not read** | Confabulated citations are the characteristic failure mode |

## Requirements when you open a pull request

1. **A named human sponsor** who has actually read the change and is accountable for it as if they
   wrote it. A nominal sponsor is worse than none — it manufactures the appearance of review.
2. **Labelled `ai-generated`**, with the PR body stating which agent and what task.
3. **Every CI gate applies.** No exceptions.
4. **Stop and report rather than guess.** A task you cannot complete correctly should end with an
   honest "here is where I got to and what blocked me", not with something that looks finished.

That last one matters more than it sounds. Producing plausible-looking incomplete work costs a
reviewer more than producing nothing, because they must first discover that it is incomplete.

## Verification obligations

Models are confidently wrong in exactly the places it costs most. Before submitting, verify:

- **Every API signature** against the actual documentation or source — not from memory
- **Every licence claim** against the dependency's LICENSE file
- **Every security property** by independent reasoning
- **Every performance claim** by measurement
- **Every standard or specification reference** against the specification

## Directory contents

| Path | Contents |
|---|---|
| [`context/`](context/) | Condensed project, architecture and domain context |
| [`conventions/`](conventions/) | Code, naming, testing and documentation conventions |
| [`policies/`](policies/) | **Hard constraints.** Violating one invalidates the contribution |
| [`prompts/`](prompts/) | Reviewed, versioned prompts for recurring tasks |
| [`workflows/`](workflows/) | Standard multi-step procedures |

## Product prompts are not development prompts

Two different things, governed differently:

- **Product prompts** (extraction, summarisation) live in the AI platform, are versioned source code,
  are hashed, and the hash is recorded on every extraction
  ([ADR-0012](../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)). A prompt change
  is a behaviour change and requires an evaluation delta report before merge.
- **Development prompts** live in [`prompts/`](prompts/) and are ungoverned but shared.

Do not confuse them. A change to a product prompt is a change to what the institution remembers.

## If you are unsure

Stop and ask the human sponsor. Uncertainty reported early is cheap; uncertainty concealed in
confident output is expensive, and on this project it can be expensive to someone who was recorded
without ever meeting us.
