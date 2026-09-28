# Witness Participate — Privacy Policy (DRAFT)

**Owner:** Engineering (Mobile release programme)
**Status:** **DRAFT — NOT PUBLISHED. Do not link to this file from any store listing, app, or
public page as-is.** This is source material for a real privacy policy, not the policy itself. Every
section marked **HUMAN/LEGAL REVIEW REQUIRED** below is a genuine gap this document cannot close —
it needs a named legal/privacy decision-maker, not more engineering.

**What this document is built from:** `docs/mobile/STORE_PRIVACY_DATA_MAP.md` (the verified,
code-level data inventory — what the app's own code actually does, checked against the source, not
assumed) and `docs/governance/DIGITAL_SOVEREIGNTY.md` (Witness's published self-hosting/sovereignty
commitments, which shape how "who controls your data" must be answered). No fact below goes beyond
what those two documents already state. No retention period, legal guarantee, jurisdiction, or
controller/processor characterisation is asserted anywhere in this draft — every one of those is
flagged, not answered.

**Intended public URL (not yet deployed):** `https://witness-prod-web.pacificdigitalconsultancy.org/privacy`
(the current live web host), with `https://app.buildwithwitness.com/privacy` as the target once
`docs/operations/INDEPENDENT_DOMAIN_CUTOVER.md`'s domain cutover completes. **This document has not
been wired into any route in `apps/web` and is not live at either URL.** Publishing it is a separate
step, after legal review, not part of this draft.

---

## Witness Participate Privacy Policy

*[DRAFT — pending legal review. Placeholder header pending confirmation of the publishing
organisation's legal name.]*

**HUMAN/LEGAL REVIEW REQUIRED — who this policy is issued by.** Witness is self-hosted software:
each organisation that runs a Witness deployment (a "Witness operator") controls its own instance,
its own data, and its own infrastructure — Witness Participate connects to *one specific* Witness
API origin (currently `witness-prod-api.pacificdigitalconsultancy.org`), operated by whichever
organisation runs that deployment. Whether that organisation, or the entity publishing this app to
the App Store/Play Store, is the correct legal party to name here — and whether "controller" or
"processor" (or neither, under a given jurisdiction's framework) is the correct term for that
relationship — is a legal categorisation question this document cannot resolve. **Do not fill in a
company name or controller/processor claim without legal sign-off.**

### What this app is

Witness Participate is a companion app for participating in a Witness session you were invited to —
joining via a link or QR code, giving consent, and contributing text or audio. It does not create an
account, browse other sessions, or work independently of an invitation.

### Information the app handles

Drawn directly from the verified code-level inventory in `STORE_PRIVACY_DATA_MAP.md` — each item
below states what the app's code actually does, not a general claim:

- **Join link/token.** When you open an invitation link or scan a QR code, the app reads the token in
  that link to identify which session you're joining. Held only in memory during the join step; never
  written to the device's storage.
- **A capture credential**, issued by the session's server once you join, used to authenticate your
  further requests for that one session. Stored using the device's own secure storage (Keychain on
  iOS, Keystore-backed encryption on Android) — see `SECURE_TOKEN_STORAGE.md`. Removed when the
  server tells the app it is no longer valid (for example, if the session ends or you're removed).
- **A display name**, only if the specific session's settings call for one. Not kept by the app once
  entered.
- **Session information** (title, facilitator name, workspace name, and similar context) shown so you
  know what you're joining. Not stored by the app between visits.
- **Your consent choices** — which categories of participation you agree to before contributing —
  sent to the session's server. Not kept by the app itself.
- **What you contribute** — text you write, or audio you record and choose to submit. Sent to the
  session's server when you submit it. If you're offline when you submit, it is held temporarily on
  the device (unencrypted local storage — see `OFFLINE_STORAGE_DESIGN.md`) until it can be sent, then
  removed from local storage.
- **Microphone access** — requested only at the moment you choose to record an audio contribution,
  never in the background. iOS asks: "Witness Participate uses your microphone only when you choose
  to record an audio contribution during a session."

**What this app does not do:** it does not include any analytics, advertising, or crash-reporting
software of any kind. It does not request your location, contacts, or Bluetooth access. It does not
access your camera directly (scanning a QR code uses your device's own Camera app). It does not build
a profile of you across sessions.

### Where information goes

Everything you contribute is sent directly to the Witness server operated for the session you
joined, over an encrypted (HTTPS) connection. This app does not send your information to any other
company or service — there is no analytics vendor, advertising network, or third-party SDK in this
app to send it to.

**HUMAN/LEGAL REVIEW REQUIRED — retention.** How long your consent decisions, contributions, or
session data are kept is set by the organisation operating that Witness server, not by this app —
this document does not state a retention period because the app has no control over one and none is
asserted here. The organisation running your session is the party who can answer this.

**HUMAN/LEGAL REVIEW REQUIRED — cross-border/jurisdiction.** Witness's own sovereignty commitments
(`docs/governance/DIGITAL_SOVEREIGNTY.md`) state that a Witness deployment performs no cross-border
transfer "of its own accord," and that each operator declares where its data is stored
(`WITNESS_DATA_RESIDENCY`). Whether this app-store-facing policy needs to name a specific
jurisdiction, or how it should describe residency for the specific deployment(s) this app connects
to, requires a legal decision, not an engineering one.

### Your choices

You can decline to grant microphone access — you can still join, consent, and submit text
contributions without it. You can leave a session at any point by simply closing the app. Removing
the app from your device removes the locally-stored capture credential and any not-yet-sent
contribution.

**HUMAN/LEGAL REVIEW REQUIRED — data subject rights.** Whether/how this policy should describe
rights to access, correct, or delete data already submitted to a session (which is held by the
operating organisation's server, not by this app) is a legal question dependent on jurisdiction and
on who is named as controller above.

### Children's privacy

**HUMAN/LEGAL REVIEW REQUIRED.** This document makes no claim about a minimum age or children's-
privacy-law applicability (e.g. COPPA) — the app itself performs no age check, and neither Apple's
nor Google's forms should be filled in on an assumed answer here.

### Changes to this policy

**HUMAN/LEGAL REVIEW REQUIRED.** No versioning/notification process for policy changes is defined
yet — a real published policy needs one before it can be relied on by users or by either store's
review process.

### Contact

**HUMAN/LEGAL REVIEW REQUIRED.** No contact method (email/postal address) is filled in — both
stores require one, and this document does not invent one.

---

## Store-form cross-reference

This draft exists to seed, not replace, the two store-specific forms:

- **Apple Privacy Nutrition Label** — `STORE_PRIVACY_DATA_MAP.md`'s data inventory table maps
  directly to Apple's data-type categories; the "linked to participant" / "used for tracking" (always
  No — no tracking SDK exists) columns are the inputs App Store Connect's form actually asks for.
- **Google Play Data Safety form** — the same inventory maps to Play Console's "data collected/shared"
  questions; Play's form also asks about encryption in transit (yes, HTTPS only) and a deletion
  mechanism (the app has none server-side to offer; per the retention note above, that is an
  operator-side question).

Neither store form has been filled in — both require the store account access this cycle explicitly
does not pursue (see `MOBILE_RELEASE_GATES.md` M7).
