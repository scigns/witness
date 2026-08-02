# Delivery Waves

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) ·
[`04-WORK_PACKAGE_REGISTER.md`](04-WORK_PACKAGE_REGISTER.md) ·
[`09-PHASE_CONTROL.md`](09-PHASE_CONTROL.md)

---

## The model

Work proceeds in **waves**: small, explicitly-scoped batches of work packages, not an open-ended
backlog pull. A wave exists so that parallelism is a decision, made once, with its safety conditions
written down — not an emergent property of however many agents happen to be running.

A wave record contains:

```text
WAVE ID
OBJECTIVE
PHASE
WORK PACKAGES
PRIMARY DEPARTMENTS
SUPPORTING DEPARTMENTS
DEPENDENCIES
PARALLELISATION PLAN
MERGE ORDER
INTEGRATION GATE
RELEASE CHECKPOINT
HUMAN APPROVAL
```

## When work packages may run in parallel within a wave

All of the following, not some:

- Both branches start from the same `main` commit.
- File ownership does not materially overlap (checked against `DEPARTMENTS.md` **Owns**, not
  guessed).
- Neither depends on the other's unmerged output.
- Review capacity exists for both — see [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md).
- Neither begins Phase 2 or later work while Phase 1 is open.

If any condition fails, the wave still contains both work packages, but they run **sequentially**,
not in parallel — the wave record's Merge Order says so explicitly.

## Wave register

| Wave | Objective | Status |
|---|---|---|
| **Wave 1** | Phase 1 critical-path completion — C4 component views + threat model, in parallel | Active — see below |

---

## Wave 1

**WAVE ID:** `WAVE-1`
**OBJECTIVE:** Advance Phase 1 toward its exit gate by completing two independently-owned,
unblocked deliverables.
**PHASE:** 1 — Architecture & research

**WORK PACKAGES:**

- `WP-1.1-01` — 1.1 C4 component views (D2)
- `WP-1.7-01` — 1.7 Threat model (STRIDE) & PIA (D6)

**PRIMARY DEPARTMENTS:** D2 (Architecture), D6 (Security, Privacy & Sovereignty)
**SUPPORTING DEPARTMENTS:** D10 (Documentation Lead, required reviewer on both), D9 (QA Lead,
required reviewer on 1.7's PIA)

**DEPENDENCIES:** Neither package depends on the other, or on any other open work. 1.1 depends only
on ADR-0021 (met). 1.7 depends on nothing (already `🟡 started`).

**FILE OWNERSHIP — checked, not assumed:**

| Package | Files touched | Owning department | Overlap with the other package? |
|---|---|---|---|
| 1.1 | `architecture/ARCHITECTURE.md`, `architecture/views/`, `architecture/diagrams/` | D2 | No |
| 1.7 | `architecture/SECURITY_ARCHITECTURE.md`, `docs/governance/RISK_REGISTER.md` | D6 | No |

Both packages also touch `docs/engineering/DEPARTMENT_ASSIGNMENTS.md` and `STATUS.md` for tracker
rows — the one place they overlap. This is a **known, accepted** overlap: each package's diff to
those two files is a single-row edit, and the merge order below sequences them so the second PR
rebases onto the first's tracker state rather than conflicting silently.

**PARALLELISATION PLAN:** Both branches cut from the same `main` commit and implemented
concurrently. Both target `main` directly — neither is stacked on the other.

**MERGE ORDER:** No architectural dependency dictates an order between 1.1 and 1.7 themselves. Order
is decided by which PR is reviewed and approved first; the second PR merges after rebasing its
tracker-row edits onto the first PR's `STATUS.md`/`DEPARTMENT_ASSIGNMENTS.md` state to avoid a
trivial tracker conflict.

**INTEGRATION GATE:** After both merge — `make verify`, `pnpm test:invariants`,
`pnpm test:adversarial`, all governance/security gates, and the same application-runtime check this
session already ran on `main` (capture → review → confirm → audit chain → 401/403 boundary),
re-executed once more on the post-merge `main`.

**RELEASE CHECKPOINT:** Neither package ships a release on its own; both feed
[0.2.0 — Phase 1 architecture baseline complete](10-RELEASE_CONTROL.md).

**HUMAN APPROVAL:** Required for both PRs individually (review) and for each merge — no agent
merges, per [`01-ORGANISATION_CHART.md`](01-ORGANISATION_CHART.md).
