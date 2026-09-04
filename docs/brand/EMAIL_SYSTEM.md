# Witness email system

**Owner:** Brand, Product and Engineering
**Status:** Audit complete; Keycloak email theme built and verified; source-controlled reference
templates for future application-generated email are not yet wired to a live send path.
**Last reviewed:** 2026-09-05

Governed by [`Witness Brand Book.pdf`](./Witness%20Brand%20Book.pdf) (companion:
[`BRAND_BOOK.md`](./BRAND_BOOK.md)) — "Application to Brevo and commercial communications" and its
"Email and Brevo" section in [`README.md`](./README.md). This document is the implementation record
against those rules.

## Audit: what actually sends email today

Do not assume. This is grounded in the repository as of 2026-09-05, not documentation intent.

| Source | Evidence |
| --- | --- |
| Brevo | Referenced exactly once in the whole repository (`docs/commercial-website/README.md`: "Organisation invitations and Keycloak account communications use the approved Brevo SMTP relay"). No API calls, template IDs, or SDK usage anywhere in `services/` or `apps/`. Brevo is SMTP transport only — it has no dashboard templates to audit because nothing in this codebase creates any. |
| Keycloak | No custom email theme existed in the repository before this change (no `.ftl` files, no theme directory) — Keycloak was sending its stock, unbranded default theme. `infrastructure/docker/init/keycloak/witness-realm.json` has `registrationAllowed`, `resetPasswordAllowed` and `verifyEmail` all `true`, and `services/api-gateway`'s `authApi.forgotPasswordUrl()` / `registerUrl()` / `loginUrl()` (see `apps/web/src/lib/api.ts`) simply redirect the browser to Keycloak's own hosted pages. Keycloak itself decides when to send, using its **link-based** password-reset and email-verification flows (confirmed live-tested — see below). The code-based verification variant, and Keycloak's native Organizations `org-invite` template, are not used (`organizationsEnabled` is absent from the realm). |
| Witness application | No email-sending code exists anywhere in `services/api-gateway`. `organisation-invitations.service.ts` (`POST /organisations/:id/users`) creates a user, membership and role assignment as three database writes — **it does not send an email**. An invited person has no automated notification; per `docs/operations/IDENTITY_ENTRY_RUNBOOK.md`, the current operational answer is "an administrator must tell them out of band," not an email. This is a real product gap, not a branding one — recorded here so it isn't silently assumed fixed by this milestone. Fixing it (a notification service, a Brevo API integration, or similar) is separate product/engineering work. |

### Classification (per the four categories this audit was asked to sort into)

- **A. Witness application generated:** none exist in code today.
- **B. Brevo template generated:** none exist — Brevo has zero dashboard templates; it is SMTP
  transport only.
- **C. Keycloak generated:** password-reset and email-verification (link-based) — previously
  unbranded, now themed (see below).
- **D. Operational/system-only:** none identified as user-facing email; out of scope for this
  audit.

## What this milestone built

### 1. Keycloak custom email theme (real, live-tested)

`infrastructure/docker/keycloak-theme/witness/email/` — a `parent=keycloak` theme overriding only:

- `html/template.ftl` — the one shared layout macro every Keycloak html email imports (upstream:
  a bare `<html><body>#nested</body></html>` with zero styling). This alone rebrands **every**
  Keycloak email (password-reset, email-verification, executeActions/admin-initiated actions,
  identity-provider-link, the `event-*` security-notification emails) without touching any
  per-email-type file or its argument wiring.
- `messages/messages_en.properties` — wording only, for the two flows this realm actually uses
  (`passwordReset*`, `emailVerification*`). Every other key, and every other language file, is left
  unoverridden and inherits upstream English unchanged. Placeholder positions (`{0}`=link,
  `{1}`=raw expiry, `{2}`=realm display name, `{3}`=formatted expiry) match the base theme exactly —
  only the prose changed.

`witness-realm.json` gained `"displayName": "Witness"` (so `{2}` renders as "Witness account", not
the lowercase technical realm name "witness account") and `"emailTheme": "witness"`.
`deployments/cloud-managed/docker-compose.pilot.yml` mounts the theme directory read-only into the
Keycloak container, the same pattern already used for the realm-import mount.

**Verified against a real Keycloak 26.0.8**, not assumed: an isolated `quay.io/keycloak/keycloak:26.0`
and Mailpit stack (separate Docker network, no relation to any other local containers) with the
theme mounted, SMTP pointed at Mailpit. Confirmed:

- The realm accepts `emailTheme: witness` and boots with no template errors.
- `executeActionsEmail` (admin-initiated) delivers a themed email end-to-end.
- The actual self-service "Forgot password?" browser flow (`login-actions/reset-credentials`, form
  submit) delivers a themed password-reset email with subject "Reset your password," correct link,
  correct realm name ("Witness"), and correct formatted expiry.
- This caught a real bug before it shipped: a bare apostrophe in `didn't` is a
  `java.text.MessageFormat` quoting metacharacter and was silently swallowing itself
  ("If you didnt request this...") — fixed to `didn''t`, matching the escaping the original upstream
  file already uses for `account''s`. Re-verified after the fix.
- The one CTA link in each affected template now renders as an Ink-background/Bone-text button
  (4px radius), not a bare underlined link, matching the Brand Book's email button rule. This is
  safe because every current template puts exactly one link alone in its own paragraph; if a future
  Keycloak template ever needs more than one link in flowing prose, give that link its own override
  rather than relaxing the button rule globally.

**Production is not touched by this change.** Per the same rule this repository already applies to
every other realm setting (see `docs/operations/IDENTITY_ENTRY_RUNBOOK.md`): `--import-realm` does
not overwrite an already-initialised realm, so applying `emailTheme: witness` and the `displayName`
to the live realm requires the same approved Keycloak administration action as any other production
realm-setting change — it does not happen automatically from this repository change landing.

### 2. Source-controlled reference templates for future application email

`packages/email/templates/` — five HTML+plaintext template pairs (account-invitation,
sign-off-request, evidence-gap-notification, welcome-onboarding, general-notice), using Brevo's
transactional-template variable syntax (`{{ params.name }}`) so they can be pasted directly into a
Brevo template without translation, or mapped 1:1 into a future application-level notification
service. **These are not wired to any live send path** — see the audit above for why no such path
currently exists to wire them to. Building that path (a notification service, a Brevo API
integration) is separate work; inventing a fake integration here would misrepresent what the product
does. Full detail in `packages/email/README.md`.

## Sender identity

`hello@buildwithwitness.com`, per `docs/operations/IDENTITY_ENTRY_RUNBOOK.md`'s "expected sender."
SMTP credentials are never placed in source, logs, or documentation — this document does not
reference or require them.

## Voice

Warm, exact, unbothered — the full Brand Book voice rules apply unchanged to email. No exclamation
marks, no emoji, no "Oops," no unsupported claims ("guaranteed," "100%," "secure" used as a bare
adjective). The password-reset and email-verification rewrites, and all five reference templates,
were checked by hand against this and against `BRAND_BOOK.md`'s "Voice in use" table.

## Structure and craft

Every email (Keycloak-sent or reference template) shares one wrapper: a plain-text "Witness"
wordmark, a Gesso panel with a 1px Mist border and 4px radius on a Bone page background, one Ink/Bone
CTA button per email, and a small Ash-colored footer line carrying the 40-word boilerplate plus a
calm "if you weren't expecting this" note. No card shadows, no gradients, no logo image (see
"Known limitations" below).

## Colour

| Role | Token | Hex |
| --- | --- | --- |
| Page background | Bone | `#f5f2ed` |
| Content panel | Gesso | `#fffdf9` |
| Panel border | Mist | `#dcd6cc` |
| Body text | Graphite | `#46423d` |
| Primary text / button background | Ink | `#1b1917` |
| Button text | Bone | `#f5f2ed` |
| Footer text | Ash | `#8a857d` |

Ember is not used anywhere in email. Nothing in a transactional account email is a "live" state in
the Brand Book's sense (that's a product-UI concept — an in-progress record), and forcing it in would
misuse the accent exactly the way the Brand Book warns against.

## Typography fallbacks

Email clients cannot load Newsreader or IBM Plex reliably. Per the Brand Book's own allowance
("preserve hierarchy, spacing, color semantics and voice rather than forcing fragile rendering"):

- Display (wordmark, headings): `Georgia, 'Times New Roman', serif` — approximates Newsreader's
  editorial serif register.
- Body: same Georgia/serif stack for the main message (matches the product's own web-safe editorial
  fallback choice in `apps/marketing`), `'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif` for
  the small footer line.
- Evidence/metadata (record IDs, timestamps): `'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace`
  — used in the reference templates' meta lines (e.g. "Invited by X · Expires Y"), never for the
  message body itself.

## Buttons

Ink background (`#1b1917`), Bone text (`#f5f2ed`), 4px radius, 12px/20px padding, no underline. This
is achieved via `<style>` targeting every link inside the content panel — verified safe because every
current template (Keycloak's and the five reference templates) puts exactly one link, alone, in its
own paragraph.

## Accessibility

- `lang="en"` on every template; `viewport` meta for mobile rendering.
- Real text throughout (no text-as-image), so screen readers and text-only clients get the full
  content without an alt-text dependency.
- Every template has a plaintext sibling with matching content, not a "click here to view the email"
  redirect.
- Colour is never the only signal — every state (invited, awaiting sign-off, missing evidence) is
  named in the text, not indicated by colour alone.

## Plaintext

Required, not optional, for every template — see the `.txt` sibling of each `.html` file. Content
matches; only markup is removed and links become `Label: URL` lines.

## Subject lines

Plain and specific, matching the Brand Book's "concrete nouns, specific facts" rule. No "Action
Required!!!", no vague "Important update." Examples actually shipped: "Reset your password," "Verify
your email."

## Transactional vs. marketing

Everything in this document and every template in `packages/email/` is transactional — sent because
of a specific account action (reset requested, invited, sign-off pending), not a broadcast. None
requires or includes an unsubscribe link; none should be sent to a marketing list. If Witness later
adds marketing/lifecycle email, that requires its own consent model and is explicitly out of scope
here (see the Brand Book's human-approval gates around paid third-party marketing/CRM processors).

## Brevo implementation notes

- Brevo is currently SMTP transport only, configured directly in Keycloak's admin SMTP settings —
  not in any repository file, and this document does not change that.
- If Witness later sends the five reference templates via Brevo's transactional API, their
  `{{ params.name }}` syntax pastes directly into a Brevo template with no translation.
- Before syncing anything to Brevo's dashboard in production: identify existing template IDs (there
  are currently none), record current configuration, and have a rollback path — per the Brand Book's
  deployment-safety guidance. Never place `BREVO_SMTP_KEY` or any API key in source, logs, or this
  documentation.

## Known limitations

- **No logo image in email.** The approved Witness mark isn't referenced by URL or embedded — email
  clients handle both poorly (blocked-by-default remote images; bloated messages for inline base64),
  and the marketing site isn't live at a stable public URL yet to host it from. Every template uses
  a plain-text "Witness" wordmark instead. Revisit once a stable public asset URL exists.
- **Button CSS applies to every link in the content panel**, not to a specific class (Keycloak's
  message-bundle-generated HTML can't carry custom classes). Safe today because every template has
  exactly one link. If a future template needs more than one, or an inline link within flowing prose,
  it needs its own override rather than a global relaxation of this rule.
- **The singular/plural gap-count grammar** in `evidence-gap-notification` is pushed to the caller
  (`params.gapClause` is a pre-composed phrase like "Two steps have" / "One step has") rather than
  solved with a pluralization helper this repository doesn't have. Document, don't paper over.
