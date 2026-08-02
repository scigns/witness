# Work Package Register

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`DEPARTMENT_ASSIGNMENTS.md`](../DEPARTMENT_ASSIGNMENTS.md)

---

## Authoritative source

[`DEPARTMENT_ASSIGNMENTS.md`](../DEPARTMENT_ASSIGNMENTS.md) is the work-package register. This file
adds one thing it doesn't have: a stable **WP-ID** distinct from the roadmap deliverable number,
because a roadmap number (e.g. `1.9`) identifies *what* is being built, not *which attempt* at
building it — useful once a deliverable is reopened, split, or reattempted.

## WP-ID convention

```text
WP-<phase>.<deliverable>-<attempt>
```

`WP-1.9-01` is the first attempt at roadmap deliverable 1.9. If deliverable 1.9 is sent back and
redone from a fresh branch, the second attempt is `WP-1.9-02`; the roadmap tracker
(`DEPARTMENT_ASSIGNMENTS.md`, `STATUS.md`) still only ever shows `1.9`.

## Completion definition

A work package is `COMPLETE` — not merely merged — only when **all** of the following hold. This is
the evidence standard already used in this session's Phase 1 recalculation, made explicit here so it
doesn't have to be re-derived each time:

1. The artefact (document, code, both) exists on the branch.
2. Its stated acceptance criteria are met.
3. The required reviewers named in [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) actually reviewed
   it — a human clicking "merge" is not evidence of review.
4. Validation (tests, gates) passed and is recorded in the PR.
5. A human merged it.
6. The baseline was re-verified on `main` after merge.
7. Every tracker (`STATUS.md`, `DEPARTMENT_ASSIGNMENTS.md`, this register) agrees.

A work package that is merged but fails #3 is `IN REVIEW`, not `COMPLETE` — this is exactly the state
deliverable 1.10 was found in during this session's baseline check: on `main`, evidence of merge, no
evidence of the named department's sign-off.

## Register (Phase 1, current)

| WP-ID | Deliverable | Department | Status | PR |
|---|---|---|---|---|
| WP-1.1-01 | 1.1 C4 component views | D2 | IN PROGRESS (this wave) | pending |
| WP-1.7-01 | 1.7 Threat model & PIA | D6 | IN PROGRESS (this wave) | pending |
| WP-1.9-01 | 1.9 Accessibility & i18n strategy | D8 | IN REVIEW (merged, sign-off pending) | [#12](https://github.com/scigns/witness/pull/12) |
| WP-1.10-01 | 1.10 NFRs & SLOs | D2 | IN REVIEW (merged, sign-off pending) | [#11](https://github.com/scigns/witness/pull/11) |
| WP-org-01 | Organisational control plane | — (cross-cutting) | IN REVIEW | pending, this wave |

Everything else follows `DEPARTMENT_ASSIGNMENTS.md`'s Phase 1 table directly — no separate row is
needed here until a WP-ID is actually assigned.
