# Deep linking — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — implemented and unit-tested; native association files not yet published

How a facilitator's QR code or shared join link opens directly into the native
app, and the threat model behind why the parser is as strict as it is.

## Journey

1. A facilitator generates a session join link (`SessionJoinService.create`,
   `services/api-gateway/src/session-join/session-join.service.ts`), which
   today renders as `https://<web-host>/join/<token>` — see
   `PARTICIPANT_API_CONTRACT.md`.
2. A participant opens that link (by tapping it, or by scanning the QR code
   with their phone's own **Camera app** — not this app's camera, since v1
   requests no camera permission at all; see `WITNESS_PARTICIPATE_V1_SCOPE.md`
   and the `CAMERA` line in `STORE_PRIVACY_DATA_MAP.md`).
3. If Witness Participate is installed and the OS has verified the domain
   association (below), the OS opens the link directly in the app instead of
   a browser — a Universal Link on iOS, an App Link on Android.
4. `App.tsx` receives the URL (via `@capacitor/app`'s `getLaunchUrl()` for a
   cold start, or the `appUrlOpen` event for a warm one) and hands it to
   `src/lib/deep-link.ts`'s `parseJoinDeepLink`.
5. If the URL parses to a valid `{ token }`, the app renders `JoinScreen`
   with that token. If not, nothing happens — the app falls through to its
   ordinary `NO_SESSION` screen, exactly as if it had been opened with no
   link at all. It never partially trusts a URL it couldn't fully validate.

If Witness Participate is **not** installed, both platforms fall back to
opening the link in the browser (the existing `apps/web` `/join/[token]`
page) — the app's presence never breaks the existing web journey.

## Threat model

The OS-level Universal Link / App Link verification (below) establishes that
*this app* is a legitimate handler for a *domain* — it says nothing about
whether a specific URL the app receives is well-formed, on an
*expected* domain, or carries a token in the expected shape. `parseJoinDeepLink`
is therefore the actual security boundary, not the OS association files:

- Only `https://` is accepted — never a custom scheme, never plain `http://`.
- Only an explicit host allow-list is accepted (see below) — an exact string
  match, not a suffix/subdomain match, so `app.buildwithwitness.com.evil.example`
  is rejected rather than matched as "ends with the right domain."
- Only `/join/<token>` is accepted as the path — one path segment after
  `/join/`, nothing appended after it.
- A malformed URL, an empty or malformed (invalid percent-encoding) token, or
  any combination of the above returns `null` rather than throwing or
  guessing at a best-effort token — a caller that doesn't check for `null`
  fails closed into "no token," never into "some token."
- Extra query parameters and a URL fragment are ignored, not rejected —
  they're expected noise from QR-generation or share-sheet tooling, never
  load-bearing for the join itself.

None of this is asserted, only tested: see
`apps/participant-mobile/src/lib/deep-link.test.ts`'s full matrix (valid
link on each allowed host, wrong host including a lookalike, wrong scheme,
wrong path, missing/empty token, extra query params and a fragment,
malformed URL, malformed percent-encoding, an attempted extra path segment).

**Tokens are never logged.** `parseJoinDeepLink` performs no logging of any
kind, and nothing downstream of it (`JoinScreen`, `@witness/participant-client`'s
`api.ts`) logs a raw token either — see
`services/api-gateway/src/session-join/token-logging.adversarial.test.ts` for
the equivalent backend-side proof. Tokens are also never sent to analytics —
this app has none (`STORE_PRIVACY_DATA_MAP.md`).

## Allowed hosts

`apps/participant-mobile/src/lib/deep-link.ts`'s `ALLOWED_HOSTS`:

| Host | Status |
|---|---|
| `witness-prod-web.pacificdigitalconsultancy.org` | **Live now** — the institutional pilot's actual participant-facing web host (`docs/operations/PILOT_OPERATIONS.md`'s Cloudflare topology). |
| `app.buildwithwitness.com` | **Not live yet** — the target host once `docs/operations/INDEPENDENT_DOMAIN_CUTOVER.md` completes (its own status: "Planned; coexistence only"). Listed here ahead of the cutover so this file and the two platform association files below need updating once, not twice. |

This was verified against the repository's own domain-architecture
documentation, not assumed — see
`WITNESS_PARTICIPATE_CURRENT_STATE.md` §13.

**HUMAN ACTION REQUIRED whenever this host list changes** (a new domain goes
live, or the `buildwithwitness.com` cutover completes): update `ALLOWED_HOSTS`
here, the Android `intent-filter` `<data android:host=".../>` entries in
`android/app/src/main/AndroidManifest.xml`, the iOS
`com.apple.developer.associated-domains` entries in
`ios/App/App/App.entitlements`, and the two association files below — all
four, together, in the same change.

## Platform association files (HUMAN ACTION REQUIRED to publish)

Verifying that this app is a legitimate handler for a domain requires two
files published on that domain's own web server — this repository can write
their content, but cannot publish them (that's `apps/web`'s / the pilot
deployment's infrastructure, outside this app's scope), and cannot verify a
domain that isn't live yet.

### iOS — `apple-app-site-association`

Publish at `https://<host>/.well-known/apple-app-site-association` (no file
extension, served as `application/json`, no redirects):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TEAM_ID>.com.buildwithwitness.participate",
        "paths": ["/join/*"]
      }
    ]
  }
}
```

`<TEAM_ID>` is the 10-character Apple Developer Team ID — **HUMAN ACTION
REQUIRED**: this repository has no Apple Developer account, so this value is
unknown here (see the final checkpoint's HUMAN ACTION REQUIRED list). The
bundle identifier (`com.buildwithwitness.participate`) is itself a
placeholder — see `capacitor.config.ts`'s own header comment.

In Xcode, this app's target additionally needs the **Associated Domains**
capability with entries `applinks:witness-prod-web.pacificdigitalconsultancy.org`
and `applinks:app.buildwithwitness.com` — the content those entries need is
already written to `ios/App/App/App.entitlements` in this repository, but
wiring that file into the Xcode project's `CODE_SIGN_ENTITLEMENTS` build
setting requires Xcode itself (not installed in this environment — see the
final checkpoint). Whoever opens the project in Xcode should add the
capability via *Signing & Capabilities* rather than hand-editing the
`.pbxproj`; Xcode will link the existing entitlements file automatically.

### Android — `assetlinks.json`

Publish at `https://<host>/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.buildwithwitness.participate",
      "sha256_cert_fingerprints": ["<SHA256_SIGNING_CERT_FINGERPRINT>"]
    }
  }
]
```

`<SHA256_SIGNING_CERT_FINGERPRINT>` is the SHA-256 fingerprint of the
certificate used to sign the release build — **HUMAN ACTION REQUIRED**: this
repository has no release keystore (never committed here, per the governing
instruction), so this value cannot be produced until one exists. The
`android:autoVerify="true"` intent-filter is already present in
`AndroidManifest.xml`; Android re-checks this file automatically once it is
published and matches.

## What deliberately is not here

- No in-app QR scanner, and therefore no `CAMERA` permission request — see
  `WITNESS_PARTICIPATE_V1_SCOPE.md`'s explicit "use the phone's own Camera
  app" decision.
- No fallback custom URL scheme (`witness://...`) — a second, weaker link
  format would only widen what `parseJoinDeepLink` has to defend, for a
  capability (opening the app when Universal/App Links aren't yet verified)
  the ordinary browser-fallback path already covers.
