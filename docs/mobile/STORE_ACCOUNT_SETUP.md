# Store account setup — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — concrete checklist of external account/credential actions; none of these
exist yet

What a human needs to create or provide before Witness Participate can be
signed, installed via TestFlight/Play internal testing, or submitted to
either store. Nothing in this document can be done by this repository or by
Claude — every item here requires a human with account-holder authority.

**No password, API key, or account credential for either store should ever
be pasted into a chat session, committed to this repository, or stored in
plain text anywhere in this repository.** Where a value needs to reach
GitHub Actions, it goes in GitHub's own encrypted secrets store, added
directly through the GitHub UI/CLI by the human who holds it — never typed
into a conversation with an AI agent first.

## Apple

| Item | Status | Where it's needed |
|---|---|---|
| Apple Developer Program enrollment | **Missing** | Prerequisite for everything below |
| Legal/account holder identity (organisation or individual enrollment) | **Missing** | Determines whether this is an "Organization" or "Individual" Apple Developer account — affects the Team ID format and who can manage it |
| Team ID (10-character string) | **Missing** | `apps/web/public/.well-known/apple-app-site-association`'s `<TEAM_ID>` placeholder; `ios/App/App.entitlements`'s Associated Domains capability once wired into the project |
| Final bundle identifier | **Placeholder set**: `com.buildwithwitness.participate` (`ios/App/App.xcodeproj/project.pbxproj`'s `PRODUCT_BUNDLE_IDENTIFIER`, `capacitor.config.ts`'s `appId`) — confirm this is actually available and intended before registering it, since a bundle ID is effectively permanent once a store listing exists against it | Xcode project, App Store Connect app record |
| App Store Connect application record | **Missing** | Required before any TestFlight build can be uploaded |
| Signing certificate (Apple Distribution) | **Missing** | Required to produce a signed `.ipa` |
| Provisioning profile | **Missing** | Required to produce a signed `.ipa`; `CODE_SIGN_STYLE = Automatic` is currently set in the Xcode project, which lets Xcode manage this automatically once a real Team ID and Apple ID are signed into Xcode — a human decision, not something to hand-configure here preemptively |
| Apple distribution signing configuration | **Missing** | How the above two are actually applied — automatic (Xcode-managed) vs. manual (fastlane match or similar) is a human/process decision, not made here |

## Google

| Item | Status | Where it's needed |
|---|---|---|
| Google Play Console developer account | **Missing** | Prerequisite for everything below (one-time registration fee, per Google's own published terms — not restated here, see `docs/infrastructure/LAUNCH_COST_BASELINE.md`) |
| Final application/package identity | **Placeholder set**: `com.buildwithwitness.participate` (`android/app/build.gradle`'s `applicationId`, `android/variables.gradle`, `capacitor.config.ts`'s `appId`) — same "confirm before registering" caveat as the iOS bundle ID | Play Console application record |
| Release keystore, or Play App Signing bootstrap | **Missing — no keystore exists anywhere in this repository or in CI**, and none has been generated. **Do not generate a production release keystore without explicit human authorisation** — the governing instruction is explicit about this, and a keystore is a long-lived credential that, once used to sign a real Play Store release, cannot be silently replaced without losing update continuity for existing installs | `mobile-android.yml`'s documented (not implemented) `ANDROID_RELEASE_KEYSTORE_BASE64` and related secrets |
| Play Console application record | **Missing** | Required before any internal-testing build can be uploaded |
| Play App Signing configuration | **Missing** | Google's own recommended approach (Google holds the final signing key; the developer uploads with an "upload key" instead) — a human choice between this and self-managed signing, not decided here |

## Sequencing (what unblocks what)

```text
Apple Developer enrollment ─┬─→ Team ID ─→ apple-app-site-association real value
                             └─→ App Store Connect app ─→ TestFlight upload
                                       (needs a signed .ipa, which needs
                                        Xcode + a real compile — see
                                        docs/mobile/MOBILE_RELEASE_GATES.md
                                        for that separate blocker)

Google Play Console account ─┬─→ Play Console app record
                              └─→ release keystore/Play App Signing decision
                                       ─→ assetlinks.json real fingerprint
                                       ─→ signed AAB ─→ Play internal testing
                                       (the unsigned AAB this repository's
                                        CI already produces is the input;
                                        signing is the missing step)
```

## What this document does not do

- Does not create any account.
- Does not generate any credential, certificate, or keystore.
- Does not publish any association file with a real identifier — see
  `docs/mobile/DEEP_LINKING.md` for the templates already in the repository,
  still carrying explicit placeholders.
- Does not decide Apple's automatic-vs-manual signing or Google's
  self-managed-vs-Play-App-Signing question — both are the account holder's
  call, informed by their own organisational process, not an engineering
  decision this repository can make on their behalf.
