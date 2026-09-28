# Witness Participate — store listing copy

**Status:** DRAFT — factual product copy, no legal claims. Screenshots/feature graphic are listed as
requirements, not produced here (need a real running build on a device/simulator to capture).

## App identity

| Field | Value |
|---|---|
| App name | Witness Participate |
| Package ID / Bundle ID | `com.buildwithwitness.participate` (not yet registered with either store) |
| Version | 1.0 (versionCode/build 1) |
| Category | Business / Productivity (governance & consultation tooling) |
| Privacy policy URL | Not yet published — see `STORE_PRIVACY_POLICY_DRAFT.md` |

## Short description (Play: 80 char max)

> Join a Witness session, give consent, and contribute your voice — text or audio.

(79 characters)

## Full description

> Witness Participate is a lightweight companion app for taking part in a Witness session you were
> invited to.
>
> Open the invitation link or scan a QR code, see who's running the session and why, and choose
> whether to take part. Give the specific consent a session asks for before contributing anything.
> Then share your thoughts — write them or record an audio contribution — and submit.
>
> Witness Participate doesn't work outside an invitation: there's no account to create, no feed to
> browse, and nothing collected beyond what you choose to contribute to the session you joined. No
> advertising, no analytics, no tracking.

## Release notes (v1.0)

> First release: join a session, review consent, contribute by text or audio, and submit. Works
> offline — a contribution made without a connection is sent automatically once you're back online.

## App Review / TestFlight notes (for Apple/Google reviewers)

> This app has no public content and does no work outside a session invitation. To review it, a test
> invitation link/QR code is required — request one from [CONTACT — human to fill in]. There is no
> sign-up flow to test independently of an invitation.

## Screenshots / feature graphic — requirements, not yet produced

- **Google Play:** minimum 2 phone screenshots (16:9 or 9:16, JPEG/24-bit PNG, 320-3840px on the
  long edge); feature graphic 1024×500 PNG/JPEG, no transparency.
- **Apple App Store:** at least one 6.7" and one 5.5" display screenshot set (or the current
  required device classes at submission time — confirm against App Store Connect's live
  requirements, which change per Apple's own device lineup).
- Neither has been captured. Doing so needs a real running build — the join screen, consent screen,
  and capture screen are the three that best represent the app; capture them once a build is
  installed on a simulator/device/TestFlight.

## Content rating inputs (Play Console questionnaire)

Factual answers to the standard IARC questionnaire, based on actual app behaviour:

- No violence, sexual content, profanity, or controlled-substance content authored by the app itself.
- User-generated content: yes (participant text/audio contributions) — visible only to the session's
  facilitator/organisation, never publicly.
- No in-app purchases, no ads, no location sharing, no social/chat features between users.

## Data Safety (Play) / App Privacy (Apple) — pointer, not restated here

Both forms should be filled in directly from `docs/mobile/STORE_PRIVACY_DATA_MAP.md`'s data
inventory table — it already maps each data category to collection/storage/sharing facts. Do not
re-derive these answers independently of that table.
