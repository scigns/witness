# Accessibility & Internationalisation Strategy

**Owner:** UX Lead
**Status:** Draft — Phase 1 deliverable 1.9. Pending review by UX Lead and Documentation Lead per
[`DEPARTMENTS.md`](../engineering/DEPARTMENTS.md) D8's acceptance gate. Not self-certified — see
[`PHASE_EXECUTION_PLAN.md`](../engineering/PHASE_EXECUTION_PLAN.md)'s rule that an exit gate is
verified by the named department, not the implementer.
**Related:** [PROJECT_CONTEXT.md](../../PROJECT_CONTEXT.md) (P8) ·
[ADR-0020](../../architecture/decisions/ADR-0020-offline-first-and-low-connectivity.md) ·
[`architecture/TECH_STACK.md`](../../architecture/TECH_STACK.md) ·
[`docs/product/PERSONAS.md`](PERSONAS.md)

---

## What this document is

[`ROADMAP.md`](../../ROADMAP.md) deliverable 1.9 requires a WCAG 2.2 AA plan, an RTL approach and a
low-bandwidth budget before Phase 1 can close. As with
[`architecture/NFR_SLO.md`](../../architecture/NFR_SLO.md) (deliverable 1.10), most of the load-bearing
figures here were already decided while building the Developer Preview — principally in
[ADR-0020](../../architecture/decisions/ADR-0020-offline-first-and-low-connectivity.md) — and are
consolidated here rather than re-decided. What genuinely has not been decided is marked `TBD` with an
owner and a phase gate, following the same discipline
[`NFR_SLO.md` §7](../../architecture/NFR_SLO.md#7-how-this-document-is-kept-honest) uses: a target set
without evidence is worse than an acknowledged gap.

## 1. Why this is a merge gate, not a milestone

Principle P8:

> WCAG 2.2 AA is a merge gate, not a milestone. Witness will run in low-bandwidth, intermittently
> connected environments in languages with limited model support.
> — [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md)

[`DEPARTMENTS.md`](../engineering/DEPARTMENTS.md) D8 gives the UX Lead authority to **block any
merge** on a WCAG 2.2 AA failure — the same standing several departments have for their own invariant
(D2 for architecture, D6 for security). This is not a UX preference; it is because the persona most
dependent on Witness working — Grace, the community engagement lead in
[`PERSONAS.md`](PERSONAS.md), working in the field on poor connectivity — is also the one an
online-only, desktop-first product fails first. A product that only works well in a head office
inverts the equity outcome the project exists to produce.

## 2. Accessibility — WCAG 2.2 AA

| Objective | Decided value | Source |
|---|---|---|
| Conformance level | WCAG 2.2 AA, enforced as a merge gate | `PROJECT_CONTEXT.md` P8, `DEPARTMENTS.md` D8 |
| Component foundation | Radix UI primitives (`packages/ui`) | `architecture/TECH_STACK.md` — chosen specifically for accessibility foundations |
| Keyboard-only path | Complete, on every interactive element | `DEPARTMENTS.md` D8 acceptance criteria |
| Focus visibility | Visible focus on every interactive element | `DEPARTMENTS.md` D8 acceptance criteria |
| Colour | Meaning never carried by colour alone | `DEPARTMENTS.md` D8 acceptance criteria |

**Verification approach.** `packages/ui` carries a named owner and an accessibility test suite per
`architecture/TECH_STACK.md`'s risk mitigation for the Radix dependency. Automated checks (e.g. an
axe-core integration in CI) and the specific manual audit cadence are not yet decided — see §5, NFR-A1.

## 3. Internationalisation and RTL

| Objective | Decided value | Source |
|---|---|---|
| RTL support | Required — `DEPARTMENTS.md` D8 responsibility includes "internationalisation and RTL" | `DEPARTMENTS.md` D8 |
| Translatable strings | Required acceptance criterion for every user-facing change | `DEPARTMENTS.md` D8 |
| Model support | Witness must function "in languages with limited model support" — extraction quality is not assumed uniform across languages | `PROJECT_CONTEXT.md` P8 |

**Not yet decided** (§5, NFR-A2, NFR-A3): which specific languages ship first, the i18n library and
translation-management infrastructure (`apps/web/package.json` has no i18n dependency yet), and how
extraction quality is measured per-language once extraction exists (Phase 5).

## 4. Low-bandwidth and offline operation

Restated from
[ADR-0020](../../architecture/decisions/ADR-0020-offline-first-and-low-connectivity.md), which remains
the source of truth if the two disagree.

| Objective | Decided value | Source |
|---|---|---|
| Initial load budget | ≤ 200 KB gzipped JavaScript | ADR-0020 — matches the bundle budget `scripts/ci/check-bundle-size.sh` already enforces in CI (currently 109 KB against the 200 KB budget) |
| Target connection | Usable on 2G | ADR-0020 |
| Target hardware | Functional on five-year-old Android hardware | ADR-0020 |
| Offline capture | Local audio/metadata/consent capture, durable IndexedDB queue, resumable sync | ADR-0020 |
| Sync conflict model | Append-only — a queued session creates a new session on sync, never overwrites server state | ADR-0020 |

This is the one section of this document with the most existing enforcement: the bundle budget is
already a CI gate, not just a stated intention.

## 5. Not yet quantified

Load-bearing and currently undecided, each with an owner and the phase gate that requires the answer
to exist before it can close — not silence, an explicit deferral. Follows the same pattern as
[`NFR_SLO.md` §6](../../architecture/NFR_SLO.md#6-not-yet-quantified).

| # | Objective | Why it is not yet decided | Owner | Required by |
|---|---|---|---|---|
| NFR-A1 | Automated accessibility test tooling and manual audit cadence | `packages/ui` has "an accessibility test suite" per `TECH_STACK.md`, but no CI-enforced automated WCAG check (e.g. axe-core) exists yet, and no external audit has been commissioned | UX Lead | Phase 1 exit gate — before this deliverable's own acceptance criterion ("WCAG 2.2 AA verified per component") can be evidenced rather than asserted |
| NFR-A2 | First-supported language set | No language beyond English exists in the Developer Preview; choosing target languages before any real deployment context risks guessing | Product Director, with UX Lead | Phase 1 exit gate, informed by Phase 1 research (personas are explicitly hypotheses, not findings — `PERSONAS.md`) |
| NFR-A3 | i18n library and translation-management infrastructure | No dependency chosen; `apps/web/package.json` carries none today | Frontend Lead | Phase 6 — Search & experience (full web application, design system) |
| NFR-A4 | External accessibility audit | Referenced as a Phase 7 deliverable in `PHASE_EXECUTION_PLAN.md` ("External accessibility audit"); premature before the design system this strategy feeds exists | UX Lead | Phase 7 exit gate |
| NFR-A5 | Per-language extraction quality measurement | Extraction does not exist yet (Phase 5); flagged as risk **R-03** ("Extraction quality inadequate in low-resource languages") in the risk register, without a measurement method yet | AI Lead | Phase 5 exit gate |

**Do not fill these in speculatively.** Setting a target language list or an audit cadence without
evidence would produce false confidence the next reader treats as decided.

## 6. How this document is kept honest

- Every restated objective traces to a source that already justified it (P8, an ADR, a department
  charter, or an enforced CI gate) — this document introduces no new target.
- Every `TBD` names an owner and a phase gate. A `TBD` surviving past its named phase gate is a defect
  in that phase's exit review, not in this document.
- If a figure here and its source document disagree, the source
  ([`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md), ADR-0020, `DEPARTMENTS.md`) wins, and this
  document has drifted — file it as a documentation defect against D8.
