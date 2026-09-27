# Store review runbook — Witness Participate

What an App Store / Play Store reviewer needs to actually exercise the app,
without touching a real organisation, workspace, or participant's data.

**Only synthetic data.** Nothing in this runbook uses a real institutional
pilot session, a real facilitator, or a real participant. If a reviewer's
account somehow reaches real production data, that is a defect in this
runbook, not an acceptable shortcut.

## What a reviewer needs before testing

1. A **synthetic** open session, created by an engineer with an `anonymous`
   or `pseudonymous` governance mode — no sign-in required, matching what
   the app actually supports (this app has no sign-in screen of its own;
   `requires_sign_in` sessions are explicitly out of reach for a reviewer
   with no Witness account, and `JoinScreen` states that plainly rather than
   hanging).
2. A join link/QR code for that session, generated the same way a real
   facilitator would (`SessionJoinService.create`) — never a hand-crafted
   token.
3. The session's consent configuration should require at least
   `participation`, `evidence_submission`, and `audio_recording` — enough to
   exercise the consent screen and both contribution types.

## Reviewer walkthrough

1. Install the build (TestFlight / Play internal testing link, whichever
   store is reviewing).
2. Launch the app — expect the `NO_SESSION` screen ("Scan a facilitator's QR
   code or open a Witness join link to get started"). This is the correct
   first-launch state; it is not a broken/empty screen.
3. Open the provided synthetic join link (as a Universal/App Link if
   verification is live, otherwise as a fallback: install the app first,
   then tap the link).
4. Confirm session context loads (organisation/session/facilitator name,
   governance-mode description) and tap "Join session."
5. Grant the consent categories shown, tap "Continue."
6. Try both contribution types:
   - **Write**: type a short synthetic note, tap "Submit," confirm "Received."
   - **Record**: tap the record button, grant the microphone permission when
     prompted (confirm the OS-native prompt, not a web one), record a few
     seconds, stop, preview playback, tap "Submit," confirm "Received."
7. Tap "Add another thought," then "Wait for the next question" or "I'm done
   for now" to see the rest of the post-submission flow.
8. Turn on Airplane Mode, submit one more contribution, confirm it shows
   "Saved on your device," then turn Airplane Mode off and confirm it sends
   automatically (or via "Retry now").

## What reviewers will not find, and why that's correct

- No sign-in / account-creation flow — this app has none (session-scoped
  participation only, `WITNESS_PARTICIPATE_V1_SCOPE.md`).
- No camera permission prompt — QR scanning uses the phone's own Camera app
  via a Universal/App Link, not an in-app scanner (`DEEP_LINKING.md`).
- No settings/profile/organisation screen of any kind — out of scope by
  design (`WITNESS_PARTICIPATE_V1_SCOPE.md`'s OUT list).
- No photo/document attachment option in v1 — a deliberate, tracked
  fast-follow (GitHub issue #236), not a missing feature.

## Cleanup

The synthetic session/consent template/join link created for review is
disposable — no production data is created or touched by any step above, so
no cleanup is strictly required, but an engineer may close the synthetic
session once review concludes to keep test fixtures tidy.
