# Witness Commercial Website Brand System

**Owner:** Brand, Product and Design
**Status:** MKT-02E brand accessibility and responsive review verified
**Last reviewed:** 2026-09-04

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
opaque white background; the shell therefore presents it on a deliberate white surface. A separate
approved variant will be required before any future dark presentation is introduced.

## Colour system

The marketing site uses one restrained, authoritative light presentation. Tokens live in
`apps/marketing/src/app/globals.css`; components must use semantic tokens instead of page-specific
hex values.

| Token | Value | Use |
| --- | --- | --- |
| `--color-ink` | `#172a2f` | Primary text and high-authority detail |
| `--color-muted` | `#53666a` | Secondary copy |
| `--color-paper` | `#f7f4ec` | Warm page background |
| `--color-surface` | `#ffffff` | Header, footer, cards and logo-safe surfaces |
| `--color-surface-subtle` | `#eef1ec` | Quiet grouped content |
| `--color-border` | `#c8cfca` | Structural dividers and control edges |
| `--color-primary` | `#075f63` | Primary actions, links and focus |
| `--color-primary-hover` | `#064c50` | Primary hover/active emphasis |
| `--color-primary-ink` | `#ffffff` | Text on primary |
| `--color-accent` | `#754d08` | Evidence labels and restrained emphasis |
| `--color-accent-soft` | `#f1e3c5` | Evidence-emphasis backgrounds |
| `--color-success` | `#23643b` | Explicitly labelled positive state |
| `--color-warning` | `#915d00` | Explicitly labelled caution state |
| `--color-danger` | `#a33636` | Explicitly labelled destructive/error state |

Status colours never carry meaning alone. Pair them with a label, icon, border or other semantic
cue. Borders may be intentionally low contrast when they are decorative; interactive control
boundaries require additional shape, text and focus treatment.

## Verified contrast

Ratios were calculated using the WCAG relative-luminance formula and are enforced for the core text
pairs in the marketing test suite.

| Pair | Ratio | Result |
| --- | ---: | --- |
| Ink on paper | 13.56:1 | AAA |
| Muted on paper | 5.50:1 | AA |
| Ink on surface | 14.91:1 | AAA |
| Muted on surface | 6.04:1 | AA |
| White on primary | 7.43:1 | AAA |
| White on primary hover | 9.73:1 | AAA |
| Primary on paper | 6.76:1 | AA |
| Accent on paper | 6.77:1 | AA |

The focus ring uses primary against white or paper (7.43:1 and 6.76:1). Header and footer use the
white surface so the approved logo's opaque white rectangle reads as a deliberate part of the shell.

## Typography

No external font or tracking request is introduced. Body, navigation, labels and controls use the
native system sans stack. Display and H1/H2 text use the native editorial serif stack (Georgia and
platform equivalents) to add institutional warmth without a font download.

| Role | Definition |
| --- | --- |
| Display / H1 | Editorial serif, 600, `clamp(2.5rem, 7vw, 4.75rem)`, 1.08 line height |
| H2 | Editorial serif, 600, `clamp(2rem, 4vw, 3.25rem)`, 1.2 line height |
| H3 | System sans, `clamp(1.25rem, 2vw, 1.5rem)`, 1.2 line height |
| Body | System sans, 1rem, 1.65 line height |
| Small | System sans, 0.875rem |
| Label / eyebrow | System sans, 0.8125rem, tracked uppercase, 750 |
| Navigation | System sans, 0.9375rem, 650 |
| Button | System sans, 0.9375rem, 750 |

Keep body copy near the `44rem` reading-width token. Headings are editorial rather than excessively
heavy; uppercase is reserved for short labels.

## Spacing and layout

The spacing rhythm is based on 4 pixels: `--space-1` (4), `--space-2` (8), `--space-3` (12),
`--space-4` (16), `--space-6` (24), `--space-8` (32), `--space-12` (48), `--space-16` (64), and
`--space-24` (96). Prefer these tokens and responsive interpolation between adjacent steps. The wide
container is `75rem`; the reading measure is `44rem`.

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

- Primary actions use ocean green with white text for conversion actions.
- Secondary actions use a visible primary-colour border for exploration.
- Tertiary actions remain underlined so they are identifiable without colour.
- All actions expose hover, focus-visible, active, and disabled/`aria-disabled` treatments.
- Buttons retain a minimum 44-pixel height; CTA groups wrap and become full-width on narrow screens.
- Cards use a structural border and white surface, without floating elevation.
- Callouts use both an ochre edge and a warm background; badges use text, shape and border.
- `Stat` produces description-list terms and values when placed inside a `dl`.

Use these primitives before introducing page-specific class combinations. Card content and status
meaning must remain explicit in text; do not use colour alone.

## Provenance visual language

The signature system is implemented in `components/provenance.tsx` as `ProvenanceNode`,
`ProvenanceConnector`, `LinearProvenanceChain`, `BranchingProvenanceChain`, and
`EvidenceRelationshipDiagram`. It uses semantic HTML and CSS only: no graph library, client runtime,
canvas or animation.

Nodes always print their kind and label. Dashed borders distinguish sources/contributions, an ochre
edge plus warm fill identifies evidence, and stronger ocean borders identify decisions/actions/
outcomes. Connectors include visually hidden relationship text. Linear chains retain their order on
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

## MKT-02 requirements

- Document palette, typography, spacing, logo treatment and content width.
- Define buttons, cards, navigation, footer and marketing layouts with accessible states.
- Build a provenance visual grammar for contributor → evidence → finding → recommendation → decision
  → action → outcome.
- Verify contrast, keyboard focus, semantic meaning, mobile layout and reduced motion.
- Extract shared primitives only when both applications have a real consumer; avoid speculative
  package abstraction.
