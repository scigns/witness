# AI Development Workflow and Guidelines

**Owner:** CTO & AI Lead
**Status:** Active
**Applies to:** every contributor using AI assistance, and every AI agent contributing

---

## Position

AI assistance is **expected and welcome**. Parts of this repository were written with it. We are not
going to pretend otherwise, and we are not going to treat disclosure as a confession.

But Witness is infrastructure that will hold community testimony and government deliberation for
decades. The same principle we apply to the product applies to how we build it:

> **The machine proposes. The human disposes.**

An AI can draft an implementation. A human decides it is correct, owns it, and is accountable for it
forever. There is no arrangement in which "the model wrote it" transfers responsibility.

---

## 1. Rules

### 1.1 You own the output, completely

If you submit it, you wrote it. At review, "the model generated that" is not an explanation, a
defence, or a mitigation. If you cannot explain why a line is there, do not submit it.

This is not a rhetorical position. It is the only workable one: the model is not on the incident
call at 3am, cannot be asked what it was thinking in 2031, and cannot be held accountable by a
community whose data was mishandled.

### 1.2 Disclose it

The pull request template asks. Answer honestly. Disclosure is **not** a mark against a
contribution — it is information reviewers use to calibrate where to look hardest (see §3).

### 1.3 Verify every factual claim

Models are confidently wrong in exactly the places it costs most:

| Claim type | Why it matters | How to verify |
|---|---|---|
| API signatures and behaviour | Plausible non-existent methods are common | Read the actual documentation and source |
| Licence terms | A wrong licence claim is a legal exposure | Read the LICENSE file in the dependency |
| Security properties | "This is safe because…" is often confabulated | Independent reasoning; Security Lead review |
| Performance characteristics | Confident numbers with no basis | Measure it |
| Standards and specifications | Invented section numbers and requirements | Read the spec |
| Historical or upstream facts | Plausible fabrication | Primary sources |

**Never cite a source you have not opened.**

### 1.4 Never paste sensitive material into a model

Absolutely prohibited, with no exception for convenience:

- Secrets, credentials, tokens, keys
- Personal data of any kind
- Real meeting recordings, transcripts or institutional content
- Community or Indigenous knowledge
- Unpublished security findings
- Anything from a production deployment

Use synthetic fixtures from [`examples/`](../../examples/). If you need realistic test data,
generate it — do not borrow it.

This applies to *every* model, including a locally-hosted one, because habits do not distinguish
between environments and the one time it matters will be the time it went to the wrong endpoint.

### 1.5 AI cannot approve, and cannot be the sole reviewer of high-consequence changes

- **AI cannot approve a pull request.** Approval means "I will be woken at 3am for this", which
  requires someone who can be woken.
- AI review is useful and encouraged as a *first pass* — it catches real defects cheaply.
- AI **cannot** be the only review of: security, cryptography, authentication, authorisation,
  consent, provenance, Indigenous data governance, or anything touching the policy decision point.
  These require a named human with the relevant expertise.

### 1.6 Do not submit code you have reason to believe is encumbered

If output closely reproduces a recognisable body of licensed code, do not submit it. When a model
reproduces something distinctive, treat it as a signal to check provenance, not as a lucky find.

---

## 2. Where AI helps, and where it hurts

Honest assessment, based on the failure modes we actually expect.

| Task | Suitability | Note |
|---|---|---|
| Boilerplate, scaffolding, adapters | **High** | Repetitive and verifiable |
| Test cases from acceptance criteria | **High** | Good at enumerating cases humans skip |
| Documentation drafts | **High** | Must be verified against actual behaviour |
| Refactoring within a clear pattern | **High** | Tests catch mistakes |
| Explaining unfamiliar code | **High** | Verify against the code itself |
| Reviewing for common defects | **Medium-high** | Excellent first pass, never the last |
| Migration and translation | **Medium** | Verify semantics, not just syntax |
| Domain modelling | **Medium** | Produces plausible models that miss the actual invariants |
| **Consent and provenance logic** | **Low** | Subtle, high-consequence, easy to get plausibly wrong |
| **Security controls** | **Low** | Confident wrongness is the failure mode |
| **Architectural decisions** | **Low** | Reproduces conventional wisdom; our constraints are unconventional |
| **Indigenous data governance** | **Not suitable** | Requires lived expertise no model has |
| **Judging what to build** | **Not suitable** | This is a values question |

The pattern: AI is strongest where the correctness criterion is *checkable* and weakest where it is
*contextual*. Our hardest requirements are contextual.

---

## 3. Review calibration

Reviewers should apply the *same* standard to AI-assisted and human-written code — but should look
in different places, because the failure modes differ.

| Human tends to | AI tends to |
|---|---|
| Skip edge cases | Handle edge cases that do not exist and miss the one that does |
| Copy a nearby pattern | Invent a plausible pattern inconsistent with the codebase |
| Write too little documentation | Write documentation describing intended rather than actual behaviour |
| Under-test | Write many tests that assert the implementation rather than the requirement |
| Leave a TODO | Silently invent an API that does not exist |
| Miss a security implication | State a confident and incorrect security rationale |

**Reviewer checklist for AI-assisted changes:**

- Does every API called actually exist, with those parameters?
- Do the tests test the *requirement*, or do they restate the implementation?
- Are error paths real, or ceremonial `try/catch` blocks that swallow?
- Is the documentation describing what the code does, or what it was asked to do?
- Are the comments explaining *why*, or narrating *what* the code plainly says?
- Is this consistent with how the rest of the codebase solves this problem?

---

## 4. Agent context

Machine-readable project context lives in [`.ai/`](../../.ai/):

| File | Purpose |
|---|---|
| `.ai/README.md` | Entry point for agents |
| `.ai/context/` | Condensed project, architecture and domain context |
| `.ai/conventions/` | Code, naming, testing and documentation conventions |
| `.ai/policies/` | Hard constraints an agent must not violate |
| `.ai/prompts/` | Reviewed, versioned prompts for recurring tasks |
| `.ai/workflows/` | Standard multi-step task procedures |

**Agents must read [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) first**, then `.ai/README.md`.
Every rule that binds a human contributor binds an agent.

### Prompts as versioned assets

Prompts used in **the product** (extraction, summarisation) are source code: versioned in the
repository, reviewed via pull request, hashed, and the hash recorded on every extraction
([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)). A prompt
change is a behaviour change and requires an evaluation delta report before merge.

Prompts used for **development assistance** are not governed, but useful ones should be shared in
`.ai/prompts/`.

---

## 5. When an AI agent contributes directly

Agents may open pull requests. Requirements:

1. **A named human sponsor** who reviews before it goes to CODEOWNER review, and who is accountable
   for the change as if they wrote it.
2. **Labelled** `ai-generated`, and the PR body states which agent and what task.
3. **Scoped** — no repository-wide refactors, no changes to consent, security, provenance or
   Indigenous data governance paths.
4. **Fully gated** — every CI gate applies with no exceptions.
5. **Bounded** — an agent that cannot complete a task correctly stops and reports, rather than
   producing something that looks finished.

An agent's pull request that a human sponsor has not actually read is closed. The sponsorship is the
control, and a nominal sponsor is worse than none because it creates the appearance of review.

---

## 6. What we will not do

- Ship AI-generated code to `main` without human review.
- Use AI to generate content presented as a human contributor's work in release notes or credits.
- Use AI to make product, architectural or governance decisions.
- Use AI to evaluate contributor performance.
- Accept an AI-generated security or Indigenous data governance review as sufficient.
- Train models on user data from any Witness deployment. Ever. Not aggregated, not anonymised, not
  opt-in. This is stated absolutely because any qualification becomes a loophole.

---

## 7. Reviewing this document

AI capability changes quickly and some judgements here will age badly — probably the suitability
table in §2 first. Reviewed **quarterly** by the CTO and AI Lead.

What does **not** change on that review: human ownership, human approval, the prohibition on
sensitive data, and the prohibition on training against user data. Those are principles, not
assessments of current capability.
