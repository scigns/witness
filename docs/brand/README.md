# Witness Brand System

**Canonical source:** [`Witness Brand Book.pdf`](./Witness%20Brand%20Book.pdf)
**Version:** 1.0
**Year:** 2026

The Witness Brand Book is the source of truth for visual identity, language, product surfaces,
marketing, transactional email and commercial communications.

## Precedence

When sources conflict, resolve in this order:

1. Accessibility, safety, security, legal or product-integrity requirements.
2. This Brand Book (v1.0, 2026).
3. Repository implementation guidance (`docs/commercial-website/`, application docs).
4. Older ad-hoc styling that predates the Brand Book.

Do not silently preserve older styling simply because it already exists. Reconcile it
deliberately and record the reasoning. Record any exception made under rule 1.

## Brand premise

Witness is **the evidence layer for work that has to be provable**. The brand idea is
**bearing witness is an act of care**: present, not surveilling; plain over impressive; nothing
unaccounted for; built to be read later.

## Voice

Witness should sound **warm, exact, unbothered**. Use short sentences, concrete nouns and
specific facts. Credit the human before the system. Name gaps rather than hiding them. Do not
overclaim.

Never use exclamation marks, emoji, "Oops!", courtroom metaphors, watchdog language,
surveillance framing or unsupported words such as "guaranteed", "bulletproof" or "100%".

## Core palette

- Ink `#1B1917`
- Graphite `#46423D`
- Ash `#8A857D`
- Mist `#DCD6CC`
- Bone `#F5F2ED`
- Gesso `#FFFDF9`
- Ember `#C1481D` - accent; live, unresolved or needing attention
- Blush `#E3B4A2` - warm/passive support
- Ochre `#F1CD8E` - rare; painted imagery and data series

Target visual ratio: roughly 90% neutral, 8% ink-on-dark inversion and 2% ember. Primary
actions are Ink, not Ember. Do not use gradients, pure `#000`/`#FFF`, or red/green
success-failure pairs.

## Typography

- Display: Newsreader 300/400; italic for pull-quotes
- Interface/body: IBM Plex Sans 300-600
- Machine evidence/metadata only: IBM Plex Mono

Mono is not decoration. Use it for machine-generated facts such as IDs, timestamps and labels;
not for human-authored prose.

## Product and marketing craft

- Bone-dominant surfaces; Gesso panels; hairline Mist rules
- No card shadows; maximum 4px radius
- Left-aligned body copy; never justified
- Records are lists first: show time, actor and state
- Motion 120-180ms, ease-out, opacity and up to 4px translation only
- Painted evidence imagery is used at cover/hero scale or not at all
- Prefer real product screenshots and documentary photography of real work
- Never use stock handshakes, gavels, eyes, padlocks, shields, checkmark badges, blockchain
  cubes, generated abstract renders, glowing nodes or particle networks

## Email and Brevo

All Witness transactional and commercial email templates sent through Brevo must follow this
Brand Book for voice, typography hierarchy where supported, palette, logo usage, CTA treatment
and guardrails. Email implementation must remain accessible and robust across clients; where
client limitations prevent exact typography, preserve hierarchy, color semantics, spacing and
voice rather than forcing fragile rendering.

See [`EMAIL_SYSTEM.md`](./EMAIL_SYSTEM.md) for the implementation record: what actually sends email
today (audited, not assumed), the rebranded Keycloak theme, and source-controlled reference
templates for future application-generated email.

## Logo

Protect the supplied Witness mark and approved lockups. Do not stretch, recolor, rotate, add
effects, place over active brushwork or recreate the mark. Ink or Bone only. Ember may appear
as the live-record dot only.

## Implementation rule

For any Witness application, website, commercial page, onboarding surface, Brevo template,
transactional email, deck, campaign or customer-facing artifact:

1. Read the Brand Book first.
2. Reuse canonical brand assets rather than recreating them.
3. Preserve accessibility and truthful product claims.
4. Record intentional exceptions.
5. Treat the Brand Book as the final brand authority.
