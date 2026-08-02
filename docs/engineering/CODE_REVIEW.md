# Code Review

**Owner:** CTO
**Status:** Active

---

## What approval means

> **"I understand this change, and I am willing to be woken at 3am for it."**

That is the bar. Not "it looks fine", not "the tests pass", not "I trust the author". If you would
not be comfortable being paged for this code in two years when the author has left, do not approve
it — say what would make you comfortable.

## Requirements

| Change touches | Requires |
|---|---|
| Anything | ≥ 1 approving review from a CODEOWNER of every path touched |
| `main` | 2 approvals |
| Consent, provenance, authorisation, cryptography, export | **+ Security Lead** |
| Knowledge graph ontology | **+ Knowledge Graph Lead** |
| Indigenous data governance | **+ Governance Lead** (holds an absolute veto) |
| Architecture, ADRs | **+ Principal Architect and CTO** |
| CI/CD workflows | **+ Infrastructure Lead and Security Lead** |

**Nobody merges their own pull request**, including the CTO and the Founder. The only exception is an
active production security incident, which requires retrospective review within 48 hours and a public
record.

**AI cannot approve** ([`AI_GUIDELINES.md` §1.5](AI_GUIDELINES.md)).

## Timeliness

| Commitment | Target |
|---|---|
| First response | **1 working day** |
| Re-review after changes | 1 working day |
| Security-critical | Same day |

If you cannot review in time, **say so immediately and reassign.** Silence is the expensive failure
mode — it blocks the author, ages the branch, and grows the diff.

## For authors

**Review your own pull request first.** Read the diff as a stranger would. You will find things, and
finding them yourself is cheaper than a review round trip.

- **Keep it small.** Under 400 changed lines. Review quality degrades sharply beyond that — this is
  well evidenced, not a stylistic preference. A 2,000-line PR gets a worse review than four 500-line
  ones, and everyone knows it while approving it anyway.
- **One logical change.** Refactors go in their own PR, separate from behaviour changes. Mixing them
  makes both unreviewable.
- **Explain the *why* in the description.** The diff shows what. Only you know why.
- **Point reviewers at what worries you.** "I'm unsure about the locking in `projector.ts:88`" gets
  you a better review than silence.
- **Respond to every comment**, even if only to acknowledge. An unanswered comment reads as ignored.
- **Do not take it personally, and do not make it personal.** The code is being reviewed.

## For reviewers

**Label the weight of every comment.** This is the single highest-leverage habit in review:

| Prefix | Meaning |
|---|---|
| *(unprefixed)* | **Blocking.** Must change before merge — always give the reason |
| `nit:` | Trivial, non-blocking. Author may ignore |
| `suggestion:` | Non-blocking improvement worth considering |
| `question:` | Genuinely asking, not implying |
| `praise:` | Say so when something is good. Review that is only criticism is corrosive |
| `future:` | Out of scope; should become an issue |

Without labels, authors treat every comment as blocking and reviews become exhausting for both sides.

### What to look for, in priority order

1. **Correctness** — does it do what the issue asked? Are the edge cases handled? What happens on
   failure, on retry, on concurrent execution?
2. **Consent and provenance invariants** — the invariants that define this product. Can this path
   reach personal data without a consent context? Can it create an assertion without provenance?
3. **Security** — input validated at the boundary? Authorisation enforced? Secrets absent from code
   and logs? Injection possible?
4. **Tenant isolation** — could this leak across a tenant, or past a community restriction?
5. **Tests** — do they test the *requirement* or restate the implementation? Would they fail if the
   code were wrong?
6. **Legibility** — will someone understand this in five years with no context? This weighs more
   here than in most projects.
7. **Layering** — is this in the right layer? Does the domain stay pure?
8. **Observability** — can we debug this in production from traces, metrics and logs alone?
9. **Documentation** — updated in this PR, and accurate?
10. **Accessibility and i18n** — for UI changes, WCAG 2.2 AA and no hard-coded strings.

### What not to do

- **Do not bikeshed formatting.** Prettier decides. If you are arguing about style, change the
  linter config instead, in its own PR.
- **Do not demand your preferred approach** when the author's works. "I would have done X" is not a
  review comment unless X is materially better and you can say why.
- **Do not expand scope.** Out-of-scope improvements become issues (`future:`), not blockers.
- **Do not approve what you do not understand.** Ask. An unanswered question is a reason not to
  approve, and admitting you do not follow something is a service to everyone.
- **Do not review while irritated.** Come back later.

## Disagreement

1. Discuss in the pull request, in writing.
2. If unresolved after two exchanges, take it to a call — then **record the outcome in the PR**.
   Decisions made in ephemeral conversation do not exist.
3. Still unresolved: escalate to the domain lead, then to the Principal Architect or CTO.
4. **Disagree and commit.** Once decided, we move.

If the disagreement is architectural, the correct outcome is often an ADR rather than a winner.

## Reviewing AI-assisted contributions

Same standard, different search pattern. See [`AI_GUIDELINES.md` §3](AI_GUIDELINES.md#3-review-calibration).
The short version: check that every API called actually exists, that tests assert requirements rather
than implementation, and that documentation describes real behaviour rather than intended behaviour.

## Health signals

| Signal | Healthy | Investigate |
|---|---|---|
| Time to first review | < 1 day | > 2 days |
| Review iterations | 1–2 | > 4 — suggests the PR was too large or under-specified |
| PR size | < 400 lines | Regularly > 800 |
| Approvals with zero comments | Occasional | Common — indicates rubber-stamping |
| Comments per 100 lines | 2–8 | 0, or > 20 |

**Rubber-stamping is the failure mode to watch for**, and it grows quietly under delivery pressure.
A reviewer who approves everything in under two minutes is not reviewing, and the honest response is
to reduce their review load, not to ask them to try harder.
