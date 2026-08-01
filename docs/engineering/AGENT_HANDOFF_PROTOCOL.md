# Agent Handoff Protocol

**Owner:** CTO
**Status:** Active — binding on every contributor, human or AI
**Related:** [`DEPARTMENTS.md`](DEPARTMENTS.md) ·
[`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md) ·
[`.ai/policies/HARD_CONSTRAINTS.md`](../../.ai/policies/HARD_CONSTRAINTS.md) ·
[`CONTRIBUTING.md`](../../CONTRIBUTING.md)

---

## Read this before touching anything

This protocol exists because of a specific failure mode: **a capable contributor, given a narrow
task, reasons from first principles and redesigns something that was already decided.** The
redesign is often locally sensible. It is still wrong, because the decision it overturns was made
with context — funding, procurement, a legal constraint, a stakeholder commitment — that is not
visible from inside the task.

An AI agent is unusually prone to this. It reads the code, sees a cleaner architecture, and
implements it. Everything about that behaviour is admirable except the outcome.

The protocol is therefore short and mostly consists of things **not** to do alone.

---

## 1. What to read before touching code

In this order. Stop when you can answer "what am I allowed to change, and what has already been
decided?"

| #   | Document                                                                     | What it tells you                                                        |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | [`VISION.md`](../../VISION.md)                                               | What Witness is. **Canonical.**                                          |
| 2   | [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md)                             | Principles P1–P8. Non-negotiable constraints, not aspirations            |
| 3   | [`STATUS.md`](../../STATUS.md)                                               | Current phase, open decisions, what is deliberately not being done       |
| 4   | [`architecture/decisions/README.md`](../../architecture/decisions/README.md) | The ADR index. Skim titles; read any ADR touching your area              |
| 5   | [`DEPARTMENTS.md`](DEPARTMENTS.md)                                           | Your department's authority and — more importantly — its prohibited list |
| 6   | [`PHASE_EXECUTION_PLAN.md`](PHASE_EXECUTION_PLAN.md)                         | The current phase and its exit gate                                      |
| 7   | [`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md)                     | Your specific row                                                        |
| 8   | [`docs/engineering/CODING_STANDARDS.md`](CODING_STANDARDS.md)                | How code is written here                                                 |

If any two of these contradict each other, **stop**. That is a governance defect, and resolving it is
step 12, not step 1. [ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)
exists because exactly this happened and was worked around for a week before anyone noticed.

## 2. Determining your authority

Your authority is your department's, and no wider. Read your department's section in
[`DEPARTMENTS.md`](DEPARTMENTS.md) — specifically **Owns**, **May modify** and **Prohibited**.

> If a file is not in your department's **Owns** or **May modify** list, you do not change it.
> You open an issue or ask the owning department.

The precedence order when sources conflict:

```text
1. VISION.md                  canonical product definition
2. PROJECT_CONTEXT.md P1–P8   non-negotiable principles
3. Accepted ADRs              binding architecture
4. GOVERNANCE.md              change control
5. architecture/              system documentation
6. PHASE_EXECUTION_PLAN.md    sequencing
7. Engineering contracts      APIs, events, schemas
8. Implementation details     everything else
```

Lower never overrides higher. If your task requires overriding something higher, the task is wrong or
it needs a decision record — go to step 12.

## 3. Identifying your department

Match the paths you need to change against the **Owns** column in
[`DEPARTMENTS.md`](DEPARTMENTS.md#department-index). If your change spans two departments, it needs
review from both, and it is usually two pull requests.

## 4. Identifying the current phase

[`STATUS.md`](../../STATUS.md), "Phase status" table. As of this writing: **Phase 1, Architecture &
research.**

Work belonging to a later phase is not started early. The roadmap is sequenced by dependency, not by
appeal — the temptation is always to build the impressive part first, and the retrofit of consent and
provenance underneath it is impossible rather than merely expensive.

## 5. Identifying your deliverable

Find your row in [`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md). Note its **Dependencies**,
**PR** branch name and **Acceptance gate**.

If there is no row for what you are about to do, **there is no assignment**. Ask before proceeding.
Unassigned work that appears in a pull request is how scope grows without anyone deciding to grow it.

## 6. Checking dependencies

A row's **Dependencies** must be 🟢 before you start. A row marked ⛔ **gated** has an unmet phase
prerequisite; starting it produces work that will be rewritten.

If you believe a dependency is unnecessary, say so and wait for an answer. Do not decide it
yourself — that judgement is exactly what the dependency column records.

## 7. Creating a branch

Use the branch name in your assignment row. Otherwise:

```text
<type>/<short-description>
```

`feat` · `fix` · `docs` · `chore` · `refactor` · `test` · `build` · `ci` · `perf`

Enforced by `scripts/ci/check-branch-name.sh` and the pre-push hook. See
[`BRANCH_STRATEGY.md`](BRANCH_STRATEGY.md) for the long-lived integration branches.

## 8. Running local validation

```bash
make verify          # format, lint, typecheck, test, build — everything CI runs
```

Individually, when iterating:

```bash
make lint
make typecheck
make test
pnpm test:invariants      # the promises Witness makes
pnpm test:adversarial     # attempts to break them
make docs-lint            # links and document ownership
bash scripts/ci/check-domain-purity.sh
```

**Run `make verify` before opening a pull request, not after CI fails.** The gates are the same; the
only difference is how long the feedback takes.

## 9. Updating documentation

In the **same pull request**, never a follow-up:

- `STATUS.md` if the state of a workstream changed.
- The relevant `docs/` page if behaviour changed.
- [`TECH_DEBT.md`](TECH_DEBT.md) if you took a shortcut — see step 14.
- A new ADR if you made a decision that is expensive to reverse.
- `DEPARTMENT_ASSIGNMENTS.md` — set your row's status.

Documentation staleness is a defect ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)), and D10 can
block a merge on it.

## 10. Opening a pull request

Use [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md). State:

- Which assignment row this completes.
- Which principles it engages, and how it upholds them.
- Which ADRs it depends on.
- What you did **not** do, and why.
- Any debt incurred, with the `TECH_DEBT.md` entry.

Commits are Conventional Commits with DCO sign-off. Both are enforced by hooks.

Nobody merges their own pull request. Not the CTO, not the Founder.

## 11. Responding to review findings

Fix, or explain why the finding is wrong. Both are acceptable; silence is not.

If a reviewer from another department objects on grounds within their authority — Security Lead on
security, Governance Lead on consent — **their objection stands until they withdraw it**. You cannot
resolve it by finding a third reviewer who agrees with you.

## 12. Escalating an architectural conflict

When implementing your task would require contradicting an accepted ADR:

1. **Stop.** Do not implement your preferred answer and document it afterwards.
2. State the conflict precisely: which ADR, which requirement, why they cannot both hold.
3. Escalate — Principal Architect, then CTO.
4. If the ADR is genuinely wrong, write a **superseding ADR**. ADRs are immutable once accepted; the
   record of having been wrong is part of the value.
5. Wait for acceptance. Seven days minimum discussion.

Note what step 4 is not: editing the existing ADR, or adding a code comment explaining why you went a
different way.

## 13. What you must never decide alone

| Never decide alone                                           | Belongs to                                  |
| ------------------------------------------------------------ | ------------------------------------------- |
| Product scope — what Witness does or does not do             | D1 Product & Governance                     |
| Anything in `SECTOR_APPLICATIONS.md` becoming in-scope       | D1 + Steering Committee                     |
| Changing or reinterpreting P1–P8                             | Steering Committee, 14-day notice           |
| Accepting, editing or ignoring an ADR                        | D2 Architecture                             |
| Introducing a technology absent from `TECH_STACK.md`         | D2, via ADR                                 |
| Weakening consent, provenance or Indigenous data sovereignty | Governance Lead — **absolute veto**         |
| Anything permitting egress in the sovereign profile          | D6 Security, mandatory                      |
| Licence changes                                              | Steering Committee + every copyright holder |
| Weakening an assertion in `test/invariants`                  | QA Lead + Principal Architect               |
| Granting a security exception without an expiry              | Nobody. It is refused                       |
| The disposition of records predating the consent service     | D1 + Governance Lead                        |
| Making an audit event mutable                                | Nobody. It is append-only                   |

If your change requires any of these, your task is finished for now. Write down what you found, and
hand it back.

## 14. Recording technical debt

Debt is logged in the pull request that incurs it, never afterwards
([`TECH_DEBT.md`](TECH_DEBT.md) rule 1).

An entry needs a severity, an owner, a review date, what you did and why, the cost of carrying it,
what fixing it would take, and the trigger that makes it urgent.

**Security exceptions always carry an expiry.** An open-ended exception is a permanent weakening
wearing a temporary costume, and it is refused rather than negotiated.

If you find yourself about to write "we'll clean this up later" — log it here in the same PR, or do
not write it.

## 15. Stopping when a decision belongs to Product or Governance

You have hit a governance decision when the answer depends on **what Witness should be** rather than
**how to build it**. Signals:

- "It would be useful if Witness also…"
- "The obvious default here is…" — for anything in the step 13 table.
- "This record has no consent grant, so I'll…"
- "The test is failing because the invariant is too strict."
- "I'll widen the schema slightly to accommodate…"

When you hit one:

1. Stop implementing.
2. Complete everything in your task that does **not** depend on the answer.
3. Write down the question, the options, and your recommendation.
4. Hand it to the owning department.

**Do not guess. Do not pick the sensible-looking default.** A guess in this territory produces
software that works and governance that is fiction, and the second one is the product.

---

## The shortest version

> Read the canon. Work your assigned row. Change only what your department owns. Run `make verify`.
> Update the docs in the same PR. When you find a decision that is not yours, write it down and hand
> it back — do not make it.
