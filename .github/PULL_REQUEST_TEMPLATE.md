<!--
Thank you for contributing to Witness.

Before opening: read your own diff as a stranger would. You will find things,
and finding them yourself is cheaper than a review round trip.

Target under 400 changed lines. Larger PRs get worse reviews, not better ones.
-->

## What and why

<!-- The diff shows what changed. Only you know why. Two or three sentences. -->

**Closes:** #
**ADR:** <!-- ADR-NNNN, or "none — not an architectural change" -->

## How to test

<!-- Concrete steps a reviewer can follow to verify this themselves. -->

## What I did not do

<!--
The most useful section in this template, and the one most often left blank.
Scope boundaries, known gaps, deliberate omissions, follow-up issues.
"Nothing" is a valid answer if it is true.
-->

## Risk and rollback

<!-- What could go wrong? How would we notice? How do we undo it? -->

## AI assistance

<!--
Disclosure is expected and is NOT a mark against your contribution — it helps
reviewers calibrate where to look. See docs/engineering/AI_GUIDELINES.md.
-->

- [ ] No AI assistance
- [ ] AI-assisted (drafting, refactoring, tests, documentation)
- [ ] Substantially AI-generated, with a named human sponsor: @

By submitting, I confirm I own this output, I have verified every factual claim
including API signatures and licence terms, and no secret or personal data was
shared with any model.

---

## Definition of Done

<!-- Strike through with ~~text~~ and explain anything genuinely not applicable. -->

**Correctness**
- [ ] Acceptance criteria in the linked issue are met
- [ ] Errors handled explicitly; no silent failure; no swallowed exception
- [ ] Edge cases, failure paths and concurrent execution considered

**Tests**
- [ ] Unit tests for logic; integration tests for boundaries; contract tests for APIs
- [ ] Tests assert the *requirement*, not the implementation
- [ ] Coverage has not decreased; new domain logic is fully covered

**Invariants** <!-- The properties that define this product -->
- [ ] No new path reaches personal data without a `ConsentedContext`
- [ ] No assertion can be created without a complete provenance chain
- [ ] Tenant isolation and community restrictions upheld
- [ ] Domain layer imports nothing from adapters or frameworks

**Documentation**
- [ ] Updated **in this PR** — including `docs/` and `architecture/` where relevant
- [ ] `STATUS.md` / `ROADMAP.md` updated if a workstream's state changed
- [ ] ADR written or updated if an architectural decision was made

**Security**
- [ ] Input validated at the boundary; authorisation enforced
- [ ] No secret in code, config, fixture or commit history
- [ ] No sensitive data in logs, traces or error messages
- [ ] Fails closed, not open

**Operability**
- [ ] Meaningful traces, metrics and structured logs for new paths
- [ ] No unbounded query, traversal or allocation on a request path
- [ ] Migration path **and rollback** documented for schema or projection changes

**Experience** <!-- UI changes only -->
- [ ] WCAG 2.2 AA verified: keyboard, contrast, screen reader, 200% zoom
- [ ] No hard-coded user-facing strings
- [ ] Bundle size budget met; works on a slow connection

**Housekeeping**
- [ ] Conventional Commits, signed off (`git commit -s`)
- [ ] No new technical debt, or logged in `docs/engineering/TECH_DEBT.md` with an owner and a date
- [ ] `make verify` passes locally
- [ ] CODEOWNER review requested for every path touched

---

<!--
Reviewers: label the weight of every comment.
  (unprefixed) = blocking, with a reason    nit: = trivial
  suggestion:  = non-blocking               question: = genuinely asking
  praise:      = say so when it's good      future: = out of scope, make it an issue

Approving means: "I understand this change, and I am willing to be woken at 3am for it."
-->
