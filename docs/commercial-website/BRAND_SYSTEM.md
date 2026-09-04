# Witness Commercial Website Brand System

**Owner:** Brand, Product and Design
**Status:** MKT-03L Brand Book reconciliation — `VERIFIED COMPLETE`
**Last reviewed:** 2026-09-05

## Positioning

Witness should feel institutional, human, globally credible and technically rigorous. It should not
read as cryptocurrency, generic cybersecurity, generic AI SaaS, a government portal or a
developer-only tool.

## Existing reusable foundation

The product provides accessible OKLCH light/dark colour tokens, visible focus treatment,
reduced-motion handling, system typography and meaningful non-colour status labels. These are useful
inputs, not a complete public brand system.

The current “W” square remains an application-shell treatment. The official marketing logo is now
human-approved and integrated without alteration. There is still no documented marketing typography
scale, spacing/layout system, image direction, provenance visual component or public CTA hierarchy.

## Official logo — human approved

- Canonical repository file: `apps/marketing/public/brand/witness-logo.png`
- Public URL: `/brand/witness-logo.png`
- Format: PNG, RGB, no alpha channel
- Dimensions: 566 × 553 pixels
- File size: 6,230 bytes
- Artwork status: `HUMAN APPROVED`

The supplied artwork is authoritative. Preserve its intrinsic proportions and do not recolour, crop,
filter, or otherwise modify it without a separately approved variant. Clear-space, minimum display
size, alternate light/dark artwork, trademark rules and official colour specifications are `TO BE
DEFINED`.

## Asset architecture

```text
apps/marketing/public/brand/
├── witness-logo.png
├── witness-mark.svg             # future, if supplied
├── witness-logo-light.svg       # future, if supplied
├── witness-logo-dark.svg        # future, if supplied
└── og/                          # future social artwork
```

Only `witness-logo.png` currently exists. The marketing `WitnessLogo` component references the
manifested canonical path and declares intrinsic dimensions to avoid layout shift. The PNG has an
opaque white background baked into the raster; the shell presents it on the closest Brand Book
token (Gesso `#FFFDF9`), which is a near-white the Brand Book permits, so the mismatch against the
asset's true `#FFFFFF` is not visible. A transparent or Gesso-baked variant would remove this
dependency; see MKT-03L's `BRAND ASSET REQUIRED` note below. A separate approved variant will be
required before any future dark presentation is introduced.

## Colour system

**Reconciled to the Brand Book (MKT-03L, 2026-09-05).** The marketing site previously used an
independently-designed ocean-green/warm-paper palette. Tokens live in
`apps/marketing/src/app/globals.css` as two layers: the nine `--witness-*` Brand Book primitives
(§05), and semantic `--color-*` roles that components consume, mapped onto those primitives.

| Token | Value | Brand Book primitive | Use |
| --- | --- | --- | --- |
| `--color-ink` | `#1b1917` | Ink | Primary text |
| `--color-muted` | `#46423d` | Graphite | Secondary/muted text |
| `--color-quiet` | `#8a857d` | Ash | Decorative only — see contrast note below |
| `--color-paper` | `#f5f2ed` | Bone | Dominant page ground |
| `--color-surface` | `#fffdf9` | Gesso | Panels, header, footer, cards |
| `--color-surface-subtle` | `#f5f2ed` | Bone | Quiet grouped content nested in a Gesso panel |
| `--color-border` | `#dcd6cc` | Mist | Hairlines/dividers |
| `--color-primary` | `#1b1917` | Ink | Primary actions, links, focus — not Ember |
| `--color-primary-hover` | `#46423d` | Graphite | Primary hover/active emphasis |
| `--color-primary-ink` | `#f5f2ed` | Bone | Text on primary (never pure white) |
| `--color-accent` | `#46423d` | Graphite | Eyebrow/field labels — restrained, not the 2% accent |
| `--color-accent-soft` | `#e3b4a2` | Blush | Passive/supporting highlight (e.g. evidence) |
| `--color-attention` | `#c1481d` | Ember | Live/unresolved/needs-attention **only** — ~2% of a page |
| `--color-data` | `#f1cd8e` | Ochre | Rare — data series/painted imagery only |

`--color-success`/`--color-warning`/`--color-danger` were removed: they were defined but never
consumed anywhere in the marketing app, and the Brand Book has no red/green status-pair concept.
`--color-attention` (Ember) is defined for a genuine future live/unresolved state; nothing on the
current static homepage represents one, so it is intentionally unused rather than forced onto
content that isn't actually live — see the MKT-03L audit below.

## Verified contrast

Ratios use the WCAG relative-luminance formula and are enforced for the core text pairs in the
marketing test suite (`test/foundation.test.tsx`).

| Pair | Ratio | Result |
| --- | ---: | --- |
| Ink on paper | 15.70:1 | AAA |
| Graphite (muted/accent) on paper | 8.93:1 | AAA |
| Ink on surface (Gesso) | 17.25:1 | AAA |
| Graphite on surface (Gesso) | 9.81:1 | AAA |
| Bone (primary-ink) on primary (Ink) | 15.70:1 | AAA |
| Bone on primary-hover (Graphite) | 8.93:1 | AAA |
| Graphite on accent-soft (Blush) | 5.37:1 | AA |

**Guardrail:** Ember on Bone is 4.46:1 — just under the 4.5:1 AA threshold for normal text. Ash on
Bone is 3.28:1, well under it. Neither is used as a text colour on Bone in this implementation;
Ember is reserved for non-text/large-scale attention use and Ash for decorative use only. Do not
introduce Ember or Ash as small body/label text on a Bone background without re-verifying contrast.

## Typography

**Reconciled to the Brand Book (MKT-03L).** Newsreader (display), IBM Plex Sans
(interface/body/navigation/buttons) and IBM Plex Mono (evidence/metadata only) are self-hosted via
`next/font/local` — see `apps/marketing/src/lib/fonts.ts` and `apps/marketing/src/fonts/README.md`
for source, license (SIL OFL 1.1) and the reasoning for self-hosting instead of a font CDN. No
runtime request leaves the deployment for these assets.

| Role | Definition |
| --- | --- |
| Display / H1 | Newsreader, 400, `clamp(2.5rem, 7vw, 4rem)`, tracking -3.5%, 1.08 line height |
| H2 | Newsreader, 400, `clamp(2rem, 4vw, 2.75rem)`, tracking -2.5%, 1.2 line height |
| Pull-quote (`.pacific-line`) | Newsreader italic, 400, ~26px, tracking -1% |
| H3 / subhead | IBM Plex Sans, 500, `clamp(1.25rem, 2vw, 1.5rem)`, 1.2 line height |
| Body | IBM Plex Sans, 400, 1rem, 1.65 line height |
| Small | IBM Plex Sans, 0.875rem |
| Label / eyebrow (human-authored) | IBM Plex Sans, 0.8125rem, tracked uppercase, 750 |
| Record ID / field label / metric (`.eyebrow-mono`, `.provenance-kind`, `Stat` value) | IBM Plex Mono, 500, tracked uppercase |
| Navigation | IBM Plex Sans, 0.9375rem, 650 |
| Button | IBM Plex Sans, 0.9375rem, 750 |

Mono is reserved for machine-generated facts — record identifiers ("Decision #08"), diagram field
labels ("EVIDENCE", "DECISION") and metric values (186, 54, 18...) — never for human-authored prose
or section eyebrows. Keep body copy near the `44rem` reading-width token.

## Spacing and layout

The spacing rhythm is based on 4 pixels: `--space-1` (4), `--space-2` (8), `--space-3` (12),
`--space-4` (16), `--space-6` (24), `--space-8` (32), `--space-12` (48), `--space-16` (64), and
`--space-24` (96). Prefer these tokens and responsive interpolation between adjacent steps. The wide
container is `75rem`; the reading measure is `44rem`. `--radius-small` and `--radius-medium` are
both `0.25rem` (4px) — the Brand Book's stated maximum; `--radius-medium` was previously `0.5rem`
(8px) and has been reduced. The one prior box-shadow (mobile navigation panel) was removed in
favour of its existing hairline Mist border, per "no card shadows."

## Dark-mode decision

Automatic OS dark mode is intentionally disabled with `color-scheme: light`. The former
`prefers-color-scheme` override was removed because it created uncontrolled brand variation and made
the opaque-white logo look incidental. A dark theme requires an intentional, separately approved
palette and logo treatment.

## Core components and interaction states

`apps/marketing/src/components/marketing-primitives.tsx` provides the local, server-renderable
commercial primitives: `Button`, `LinkButton`, `Card`, `Eyebrow`, `SectionHeading`, `Container`,
`Section`, `Callout`, `Badge`, `FeatureCard`, `Stat`, and `CTAGroup`. They accept ordinary native
attributes and content; they do not require a client boundary or runtime package.

- Primary actions use Ink with Bone text for conversion actions — not Ember, per the Brand Book.
- Secondary actions use a visible primary-colour (Ink) border for exploration.
- Tertiary actions remain underlined so they are identifiable without colour.
- All actions expose hover, focus-visible, active, and disabled/`aria-disabled` treatments.
- Buttons retain a minimum 44-pixel height; CTA groups wrap and become full-width on narrow screens.
- Cards use a structural Mist border and Gesso surface, without floating elevation, at the Brand
  Book's 4px maximum radius.
- Callouts use a Graphite edge and a Blush background (passive support, not an Ember alert); badges
  use text, shape and border.
- `Stat` produces description-list terms and values when placed inside a `dl`; the value renders in
  Mono as a machine-generated metric.

Use these primitives before introducing page-specific class combinations. Card content and status
meaning must remain explicit in text; do not use colour alone.

## Provenance visual language

The signature system is implemented in `components/provenance.tsx` as `ProvenanceNode`,
`ProvenanceConnector`, `LinearProvenanceChain`, `BranchingProvenanceChain`, and
`EvidenceRelationshipDiagram`. It uses semantic HTML and CSS only: no graph library, client runtime,
canvas or animation.

Nodes always print their kind and label — in Mono, as a diagram field label. Dashed borders
distinguish sources/contributions, a Graphite edge plus Blush fill identifies evidence (passive
support, not an Ember alert), and stronger Ink borders identify decisions/actions/outcomes.
Connectors include visually hidden relationship text. Linear chains retain their order on
small screens; branching sources stack before the resulting evidence chain. Each complete diagram
requires a concise accessible label and description.

MKT-02E verified the complete shell and diagram system in installed Chrome at 320, 375, 430, 768,
1024 and 1440 pixels. The page has no document-level horizontal overflow; chains remain legible,
ordered and contained. Keyboard checks cover skip-to-content, home, menu, navigation and CTA focus.
Reduced motion remains supported by the global media rule.

The MKT-03A homepage skeleton consumes the same tokens, action primitives and provenance grammar; no
new brand exceptions were introduced.

MKT-03B continues the same system: the hero uses editorial display type and the established action
hierarchy, while problem and process content use restrained cards and provenance nodes. No new
colours, fonts, logo treatment or animation were added.

MKT-03C through MKT-03F retain this system for the synthetic product preview, audience cards, trust
pillars, open-infrastructure statement and final CTA. Product relationships remain the primary visual
idea; no dashboard chart language, third-party chart library or new brand exception was introduced.

## MKT-03L — Brand Book reconciliation audit (2026-09-05)

Audit of `apps/marketing` against `docs/brand/Witness Brand Book.pdf` v1.0, before the fixes this
milestone applied. `AFTER` reflects this milestone's implementation.

| Area | Before | After | Notes |
| --- | --- | --- | --- |
| Colour palette | CONFLICT | COMPLIANT | Independent ocean-green/warm-paper system replaced with the nine Brand Book primitives and a semantic role mapping. |
| Typography | CONFLICT | COMPLIANT | System sans + Georgia serif replaced with self-hosted Newsreader/IBM Plex Sans/IBM Plex Mono. |
| Logo | PARTIAL | PARTIAL | Artwork itself was already unaltered/human-approved (COMPLIANT); its opaque-white background sits on Gesso rather than a matching asset — see `BRAND ASSET REQUIRED` below. |
| Buttons/CTA | CONFLICT | COMPLIANT | Primary action moved from ocean-green to Ink/Bone; Ember not used as a default action colour anywhere. |
| Ember usage | N/A | COMPLIANT | `--color-attention` (Ember) is defined but deliberately unused — nothing on the static homepage is a genuine live/unresolved state, and inventing one would overclaim. |
| Cards/radius/shadow | CONFLICT | COMPLIANT | Radius capped at 4px (was 8px); the one box-shadow (mobile nav panel) removed in favour of its existing hairline border. |
| Provenance diagrams | CONFLICT (colour) / COMPLIANT (structure) | COMPLIANT | Structure was already semantic HTML/CSS with no canvas/client runtime, matching "hairline diagrams." Colour and field-label typography (now Mono) reconciled. |
| Product preview | CONFLICT (colour/type) / COMPLIANT (structure) | COMPLIANT | Already list-first (time/actor/state-shaped); metric values and record IDs now render in Mono as machine facts. |
| Homepage copy/voice | PARTIAL | COMPLIANT | Voice was already plain/factual; added the Brand Book's positioning line ("the evidence layer for work that has to be provable") into the hero, and an "Evidence governance" eyebrow, without discarding the existing approved sentence. |
| Imagery | NOT APPLICABLE | NOT APPLICABLE | The homepage uses no imagery today (text and CSS/HTML diagrams only), so there is nothing to violate. The Brand Book's three painted-evidence canvases are not present in the repository. |
| Sign-in / application surfaces | OUT OF SCOPE | OUT OF SCOPE | `apps/web` (the authenticated product) has its own, separate design-token system, not touched here. Reconciling it is auth-adjacent UI work and belongs in its own reviewed change, not bundled into this marketing-only milestone. |

### Brand asset required

**YES.** The Brand Book's three painted-evidence canvases (Ash/primary, Blush/secondary,
Ember/punctuation — Brand Book §07) are not present anywhere in the repository, and the approved
logo PNG has an opaque `#FFFFFF` background baked into the raster rather than a transparent or
Gesso-matched one. Neither was fabricated to fill the gap; the homepage continues to use no imagery
rather than substitute stock or generated art, consistent with the Brand Book's imagery guardrails.

## MKT-02 requirements

- Document palette, typography, spacing, logo treatment and content width.
- Define buttons, cards, navigation, footer and marketing layouts with accessible states.
- Build a provenance visual grammar for contributor → evidence → finding → recommendation → decision
  → action → outcome.
- Verify contrast, keyboard focus, semantic meaning, mobile layout and reduced motion.
- Extract shared primitives only when both applications have a real consumer; avoid speculative
  package abstraction.
