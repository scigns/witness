# Witness email templates

**Status:** Source-controlled reference templates. **Not yet wired to a live send path.**

## Why this exists

`docs/brand/EMAIL_SYSTEM.md` audits what actually sends email today: Keycloak's own password-reset
and email-verification flows (rebranded in `infrastructure/docker/keycloak-theme/witness/`), sent
through the Brevo SMTP relay as pure transport. No Witness application code currently sends email —
there is no notification service, no Brevo API integration, and organisation invitations create a
database record only (see the audit for the exact evidence). These five templates are the
source-controlled, Brand Book-aligned starting point for when that capability exists. Wiring them to
a real send path (Brevo's transactional API, or an application-level notification service) is a
separate, future piece of work — building that service is out of scope here.

## Templates

| File | Purpose | Brand Book voice reference |
| --- | --- | --- |
| `account-invitation` | Someone invited you to an organisation | §03 "Voice in use" |
| `sign-off-request` | A record is waiting for your sign-off | §03 "Success" example |
| `evidence-gap-notification` | Steps are missing evidence | §03 "Gap found" example (used verbatim) |
| `welcome-onboarding` | First sign-in / empty-state welcome | §03 "Empty state" example |
| `general-notice` | Generic transactional notice, no dedicated template yet | — |

Each has an `.html` and a `.txt` (plaintext) sibling with matching content — plaintext is not
optional; some clients and screen readers depend on it, and Brand Book voice should read the same in
both.

## Variable convention

Variables use Brevo's transactional-template syntax, `{{ params.name }}`, so these can be pasted
directly into a Brevo template without translation. If a future application-level notification
service sends these instead of Brevo, map the same `params.*` names into whatever templating it uses
— don't rename them speculatively ahead of that decision.

## Shared layout

There is no shared include file — each template duplicates the same wrapper (header wordmark,
Gesso-on-Bone content panel, footer) that `infrastructure/docker/keycloak-theme/witness/email/html/template.ftl`
uses, so every Witness email looks identical regardless of which system sends it. If a real
templating engine is introduced later, extract this into one partial then; duplicating five small
static files is simpler than building that abstraction for content with no consumer yet.

Colours, fonts and the button treatment are identical to the Keycloak theme — see
`docs/brand/EMAIL_SYSTEM.md` for the full specification and email-client compatibility notes. As
there, `{{ params.link }}`-holding anchors render as Ink/Bone buttons; keep one action link per
template rather than adding more.

## Verification

These are static content, not code, and have no build step. Each file was checked by hand against
`docs/brand/BRAND_BOOK.md`'s voice guardrails (no exclamation marks, no hype, no "Oops", named gaps
rather than hidden ones) and validated as parseable HTML (`python3 -m html.parser`). Add real
automated tests once these are wired to an actual send path and have real inputs to test against —
writing a test harness for templates nothing calls would be testing the harness, not the product.
