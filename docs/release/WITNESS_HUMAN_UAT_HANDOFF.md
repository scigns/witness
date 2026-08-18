# Witness — Human UAT Handoff (v0.2.0, Controlled Pilot)

**Status:** Active — PRODUCT BUILD FROZEN at commit `e000f4e`
**Owner:** Release Manager

This is the human acceptance testing package for the Witness v0.2.0
controlled-pilot release. A Gmail draft with this same content was prepared
for koto@dreamers-media.com; this copy is kept in the repository as the
durable record. It was not automatically sent — no outbound-mail capability
is authorised for this project, by design.

**Updated 2026-08-18** for the frozen release (previously b49c114): adds
browser audio recording (UAT-07a) and document/image evidence with the
`evidence_submission` consent gate (UAT-07b), both built and deployed since
this package was first issued, and folds both into the golden path
(UAT-08). Nothing else below changed in substance — the five UAT accounts,
credential mechanism, and every other test are unchanged and still
verified against the live account/role data on production as of this
update.

---

Subject: WITNESS — Final Human UAT Instructions & Release Acceptance

============================================================
RELEASE STATUS
============================================================

Witness engineering build is complete and the product build is FROZEN.

Engineering verification:
- P0: 0
- P1: 0
- core workflow: PASS
- organisation onboarding: PASS
- tenant isolation: PASS
- role security: PASS
- R2/storage: PASS
- quota: PASS
- upload recovery: PASS
- queue/recovery: PASS
- transcription: PASS
- AI processing: PASS
- export: PASS
- PWA: PASS
- backup/restore: PASS
- rollback/reboot: PASS
- institutional profiles (SPC/FTA/MOJ/Church): PASS
- browser audio recording: PASS (engineering-verified; human microphone test
  is UAT-07a below)
- document/image evidence with `evidence_submission` consent: PASS
  (engineering-verified — consent fails closed, zero writes on denial,
  tenant isolation holds; human click-through is UAT-07b below)

Everything remaining below is HUMAN ACCEPTANCE TESTING only — no more
engineering work is planned before this. The build is frozen: no further
feature, architecture, or refactoring changes are in scope unless this UAT
finds a P0, P1, or a genuine release-blocking P2. The objective is to
determine whether a real person experiences the application as behaving
correctly in the supported browsers, roles and workflows.

============================================================
RELEASE INFORMATION
============================================================

WITNESS VERSION / RELEASE TAG:
v0.2.0

STATUS:
PRODUCT BUILD FROZEN

MAIN SHA:
e000f4ecd3f6377857f7837b1a84266d50057ac7

DEPLOYED / RELEASE SHA:
e000f4ecd3f6377857f7837b1a84266d50057ac7

APPLICATION URL:
https://witness-prod-web.pacificdigitalconsultancy.org

SIGN-IN URL:
https://witness-prod-web.pacificdigitalconsultancy.org/signin

DATE:
2026-08-18

TEST ENVIRONMENT:
Production, using SYNTHETIC UAT DATA ONLY.

DATA:
SYNTHETIC ONLY.

REAL CLIENT DATA:
NOT APPROVED — pending this Human UAT passing, AND a separate, unrelated
storage-protection action (R2 bucket versioning/Object Lock) that a human
with Cloudflare account access still needs to complete. See
`docs/operations/PILOT_OPERATIONS.md`'s "Backup" section. A pass on this
UAT does not by itself approve real client data.

DO NOT enter real confidential client information during this UAT. Every
account and organisation below is synthetic and clearly labelled as such.

============================================================
CREDENTIALS — READ THIS FIRST
============================================================

No production secrets are in this email, including the UAT accounts'
password.

All five synthetic UAT accounts below share one password, stored ONLY on
the production host, readable only by the account that operates it. Retrieve
it yourself, right before you start testing:

  ssh witness@167.172.72.70 "cat ~/.uat_test_password"

That file is permissioned so only that retrieval works — nothing else on the
box is exposed by this command. This is the existing, already-in-use
mechanism for these accounts, not a new one created for this email.

============================================================
TEST USER ACCOUNTS
============================================================

These are the actual configured UAT accounts — nothing here is invented.

------------------------------------------------------------
PROFILE 1 — PARTICIPANT
------------------------------------------------------------
Name: UAT Participant
Username: uat-participant@witness-uat.example
Role: Participant
Organisation: Witness Production
Purpose: Test the experience of an ordinary co-design participant.
Login URL: https://witness-prod-web.pacificdigitalconsultancy.org/signin
Password: see "Credentials" above

Expected permissions:
- view the permitted program/session
- complete consent
- contribute
- upload permitted material
- see appropriate participant-facing information

Must NOT be able to:
- administer the organisation
- change membership
- perform reviewer actions
- access Tenant B UAT (the other synthetic organisation)

------------------------------------------------------------
PROFILE 2 — FACILITATOR
------------------------------------------------------------
Name: UAT Facilitator
Username: uat-facilitator@witness-uat.example
Role: Facilitator
Organisation: Witness Production
Purpose: Test the session-facilitation workflow.
Login URL: https://witness-prod-web.pacificdigitalconsultancy.org/signin
Password: see "Credentials" above

Expected permissions:
- create/manage sessions and participants
- capture evidence/contributions on a participant's behalf
- see facilitator-facing session tools

Must NOT be able to:
- perform Reviewer validation actions
- administer organisation membership or roles
- access Tenant B UAT

------------------------------------------------------------
PROFILE 3 — REVIEWER  (primary outstanding human UAT role)
------------------------------------------------------------
Name: UAT Reviewer
Username: uat-reviewer@witness-uat.example
Role: Reviewer
Organisation: Witness Production
Purpose: This is one of the two primary outstanding human UAT roles —
engineering has only proven this role's boundaries at the API/policy level,
not through a live browser session.
Login URL: https://witness-prod-web.pacificdigitalconsultancy.org/signin
Password: see "Credentials" above

Expected:
- reviewable material is visible
- review/approve/reject actions are available and work
- report approval works

Must NOT:
- administer organisation membership or roles (this is deliberate —
  Reviewer is the highest non-admin tier and does not get membership or
  role-assignment actions)
- gain Facilitator-only actions
- access Tenant B UAT

------------------------------------------------------------
PROFILE 4 — ADMIN
------------------------------------------------------------
Name: Tenant B Admin
Username: uat-tenantb-admin@witness-uat.example
Role: Admin (organisation-scoped) + Facilitator (workspace-scoped)
Organisation: Tenant B UAT  — NOTE: this is a DIFFERENT synthetic
organisation from Profiles 1/2/3/5, on purpose. Use it to also confirm you
cannot see any Witness Production content while signed in as this account.
Purpose: Test authorised organisation administration, and reinforce tenant
isolation from a human's own eyes.
Login URL: https://witness-prod-web.pacificdigitalconsultancy.org/signin
Password: see "Credentials" above

Expected permissions:
- manage Tenant B UAT's membership and role assignments
- everything a Reviewer can do, plus organisation administration

Must NOT be able to:
- see or act on anything inside Witness Production

------------------------------------------------------------
PROFILE 5 — OBSERVER  (primary outstanding human UAT role)
------------------------------------------------------------
Name: UAT Observer
Username: uat-observer@witness-uat.example
Role: Observer (read-only)
Organisation: Witness Production
Purpose: This is the second primary outstanding read-only role UAT.
Login URL: https://witness-prod-web.pacificdigitalconsultancy.org/signin
Password: see "Credentials" above

Expected:
- can see authorised read-only content

Must NOT:
- create
- edit
- approve or review
- administer members
- alter any program/session

------------------------------------------------------------
ADMIN/OWNER ACCOUNT — for setting up test content
------------------------------------------------------------
For the golden-path test (UAT-08 below) you will need to create a fresh
synthetic program/session. Use your own real account
(dreamercoat@gmail.com), which already holds organisation-admin on Witness
Production — do not create a new organisation for this, reuse Witness
Production and clearly label whatever you create with "UAT" in the title.

============================================================
BEFORE YOU START — RULES FOR EVERY TEST
============================================================

1. Log out of Witness completely before switching accounts.
2. Use a private/incognito window, or a different browser, wherever a test
   says to.
3. Log in with the exact account specified for that test.
4. Do not enter real client information anywhere.
5. Perform only the actions the test describes.
6. Mark every check: PASS / FAIL / NOT APPLICABLE.
7. For any FAIL, record: test number, expected result, actual result,
   browser/device, screenshot if appropriate, time of failure.
8. Do not put sensitive participant/evidence information in screenshots —
   everything in this UAT is synthetic, so this should not come up, but
   keep the habit.

If something fails:
Do NOT continue modifying production yourself. Record:
  TEST ID / ROLE / BROWSER-DEVICE / TIME / EXPECTED / ACTUAL /
  REPRODUCIBLE (Y/N) / SCREENSHOT (if safe) / SEVERITY
Severity guide:
  P0 — data loss, a security/tenant boundary was crossed, system unusable
  P1 — a core workflow cannot complete, no workaround
  P2 — a real defect with a workaround
  P3 — cosmetic / minor
For a P0 or P1: stop that pilot activity and send the result back to
engineering before continuing.

============================================================
UAT-01 — REVIEWER
============================================================
Browser: Chrome, Incognito
Account: uat-reviewer@witness-uat.example

STEP 1 — Open https://witness-prod-web.pacificdigitalconsultancy.org/signin
EXPECTED: Witness sign-in screen appears correctly.
SUCCESS: Page loads without error.
RESULT: [ ] PASS  [ ] FAIL

STEP 2 — Sign in as the Reviewer.
EXPECTED: Login succeeds and returns to Witness.
SUCCESS: Reviewer lands inside Witness Production.
RESULT: [ ] PASS  [ ] FAIL

STEP 3 — Open a program/session with material to review.
EXPECTED: Reviewer sees material available for review.
SUCCESS: No Admin-only functionality is exposed anywhere in the UI.
RESULT: [ ] PASS  [ ] FAIL

STEP 4 — Open a contribution/evidence item awaiting review.
EXPECTED: Reviewer can access the permitted review information.
RESULT: [ ] PASS  [ ] FAIL

STEP 5 — Complete a permitted review/confirmation action.
EXPECTED: Action succeeds and the item's status changes.
RESULT: [ ] PASS  [ ] FAIL

STEP 6 — Try to reach organisation administration (membership/roles).
EXPECTED: Access denied, or the option is not present in the UI.
SUCCESS: Reviewer cannot administer membership or role assignments.
RESULT: [ ] PASS  [ ] FAIL

STEP 7 — Try a known Facilitator-only action (e.g. creating a new session).
EXPECTED: Denied, or not offered.
RESULT: [ ] PASS  [ ] FAIL

STEP 8 — Refresh the page.
EXPECTED: Reviewer remains signed in and correctly authorised.
RESULT: [ ] PASS  [ ] FAIL

STEP 9 — Log out.
EXPECTED: Session ends; protected content is no longer reachable.
RESULT: [ ] PASS  [ ] FAIL

FINAL REVIEWER RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: every allowed action works, and every forbidden action stays
unavailable or denied.

============================================================
UAT-02 — OBSERVER
============================================================
Browser: Chrome, Incognito (or a fresh private window)
Account: uat-observer@witness-uat.example

1. Log in.
2. Confirm you land in the correct organisation/program (Witness
   Production). [ ] PASS  [ ] FAIL
3. Read permitted material (a session, evidence, a report). [ ] PASS  [ ] FAIL
4. Navigate the available read-only views. [ ] PASS  [ ] FAIL
5. Try to create a contribution. Expect denial/no option.
   [ ] PASS  [ ] FAIL
6. Try to edit a session. Expect denial/no option. [ ] PASS  [ ] FAIL
7. Try a review/approval action. Expect denial/no option.
   [ ] PASS  [ ] FAIL
8. Try to administer membership. Expect denial/no option.
   [ ] PASS  [ ] FAIL
9. Refresh — session and authorisation persist. [ ] PASS  [ ] FAIL
10. Log out — protected content becomes unreachable. [ ] PASS  [ ] FAIL

FINAL OBSERVER RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: Observer can read only what is permitted, and cannot mutate
any application state.

============================================================
UAT-03 — MULTI-SESSION (CHROME + INCOGNITO, + FIREFOX IF AVAILABLE)
============================================================
Chrome (normal window): uat-facilitator@witness-uat.example
Chrome (Incognito): uat-participant@witness-uat.example
Firefox, if you get to UAT-04 first, can stand in for a third independent
session as uat-reviewer@witness-uat.example — otherwise do this step by
step in sequence with the two Chrome windows only.

1. Facilitator signs in (Chrome). [ ] PASS  [ ] FAIL
2. Participant signs in independently (Chrome Incognito). [ ] PASS  [ ] FAIL
3. Facilitator creates a new synthetic session (label it "UAT" in the
   title). [ ] PASS  [ ] FAIL
4. Participant opens/enters that session. [ ] PASS  [ ] FAIL
5. Participant completes consent. [ ] PASS  [ ] FAIL
6. Participant submits a contribution. [ ] PASS  [ ] FAIL
7. Facilitator refreshes their window. [ ] PASS  [ ] FAIL
8. The contribution appears to the Facilitator appropriately.
   [ ] PASS  [ ] FAIL
9. Reviewer signs in in a third independent session (Firefox, or a second
   incognito window) and sees the appropriate review item.
   [ ] PASS  [ ] FAIL
10. Reviewer completes a permitted review action. [ ] PASS  [ ] FAIL
11. Facilitator verifies the updated status. [ ] PASS  [ ] FAIL
12. (Optional) Observer, in a separate session, confirms the outcome is
    visible read-only. [ ] PASS  [ ] FAIL

Explicitly verify: signing in on one browser/window never changes who is
signed in on another. [ ] PASS  [ ] FAIL

FINAL MULTI-SESSION RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: independent role sessions stay isolated from each other,
while the underlying data updates propagate correctly between them.

============================================================
UAT-04 — FIREFOX
============================================================
Account: any one of the synthetic accounts above (Facilitator recommended)

1. Open https://witness-prod-web.pacificdigitalconsultancy.org
2. Log in.
3. Navigate to the organisation/program.
4. Open a session.
5. Perform one permitted, meaningful action (e.g. add a contribution).
6. Refresh.
7. Confirm the action persisted.
8. Export or download something, if your role permits it.
9. Log out.
10. Confirm nothing about the layout or functionality blocked ordinary use.

FINAL FIREFOX RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: no browser-specific issue prevents ordinary Witness use.

============================================================
UAT-05 — SAFARI / IPHONE
============================================================
Desktop Safari and/or iPhone Safari.

1. Open Safari.
2. Navigate to https://witness-prod-web.pacificdigitalconsultancy.org
3. Log in as uat-participant@witness-uat.example.
4. Confirm the mobile/responsive layout looks correct.
5. Open a session.
6. Complete consent.
7. Add a synthetic contribution.
8. Try an upload if your role/session permits it.
9. On iPhone: rotate portrait/landscape and confirm the layout still works.
10. Refresh.
11. Confirm state persisted.
12. Log out.

FINAL SAFARI/IPHONE RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: no mobile/Safari defect prevents a participant from
completing the normal workflow.

============================================================
UAT-06 — PWA (INSTALLABILITY)
============================================================
This does not imply offline storage of sensitive data — Witness's service
worker caches the app shell only, not evidence content.

Desktop Chrome:
1. Open Witness.
2. Confirm the browser offers an "install" option.
3. Install it.
4. Launch the installed app.
5. Confirm it's really Witness (name/icon correct) and navigation works.
6. Log out from inside the installed app.

Mobile (iPhone Safari or Android Chrome):
1. Use "Add to Home Screen".
2. Launch from the home screen icon.
3. Confirm it opens in standalone mode (no browser chrome) and behaves
   correctly.

FINAL PWA RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: the PWA installs and launches correctly, without exposing
or caching sensitive information improperly.

============================================================
UAT-07a — BROWSER AUDIO RECORDING (NEEDS A MICROPHONE)
============================================================
Account: uat-facilitator@witness-uat.example
Browser: Chrome or another browser with microphone access. Skip this test
(mark N/A) if your device has no working microphone.

Engineering has verified this control's code paths (consent gate, upload
reuse, feature-detected fallback) but not a live microphone recording —
that needs a human and real hardware, which is what this test is for.

1. Sign in and open a synthetic session's evidence capture screen, on a
   piece of evidence with no attachment yet.
   EXPECTED: an attachment section is visible, offering both "Record in
   browser" and a file picker.
   [ ] PASS  [ ] FAIL

2. Before checking the consent box, confirm "Start recording" is disabled.
   EXPECTED: the button cannot be pressed until you check the consent
   confirmation box.
   [ ] PASS  [ ] FAIL

3. Check the consent confirmation box, then click Start recording.
   EXPECTED: the browser asks for microphone permission (first time only);
   after granting it, recording begins.
   [ ] PASS  [ ] FAIL

4. Confirm a visible recording indicator is shown (e.g. a pulsing dot and
   "Recording").
   [ ] PASS  [ ] FAIL

5. Confirm an elapsed-time counter is visible and counting up.
   [ ] PASS  [ ] FAIL

6. Click Pause. Confirm the indicator changes to "Paused" and the timer
   stops.
   [ ] PASS  [ ] FAIL

7. Click Resume. Confirm recording continues and the timer keeps counting
   from where it paused.
   [ ] PASS  [ ] FAIL

8. Click Stop.
   EXPECTED: recording stops and a preview player appears with what you
   just recorded.
   [ ] PASS  [ ] FAIL

9. Play back the preview. Confirm it is audible and is actually what you
   recorded (say something distinctive while recording, e.g. today's date,
   to make this easy to verify).
   [ ] PASS  [ ] FAIL

10. Click "Discard and re-record". Confirm the recording is discarded and
    you can start a fresh one (repeat steps 3–8 once more, briefly).
    [ ] PASS  [ ] FAIL

11. This time, click "Attach recording" instead of discarding.
    EXPECTED: an "Uploading…" state appears, then the attachment shows up
    with a filename, size, and content type.
    [ ] PASS  [ ] FAIL

12. Confirm a "Transcribe recording" option is now offered, and starting it
    moves to a processing/queued state.
    [ ] PASS  [ ] FAIL

13. Wait for transcription to finish (or come back to this after UAT-07's
    iTaukei test, which exercises the same pipeline).
    EXPECTED: status moves from processing to a completed transcript.
    [ ] PASS  [ ] FAIL

14. On a fresh piece of evidence, click "Start recording" with the consent
    box checked, then deny the browser's microphone permission prompt.
    EXPECTED: a clear error message appears (not a silent failure or a
    frozen button), and the existing file-upload option is still available
    as a fallback.
    [ ] PASS  [ ] FAIL

15. Confirm nothing was silently lost at any point above — every state
    change (recording/paused/stopped/uploading/attached) was visibly
    reflected in the UI, not something you had to guess at.
    [ ] PASS  [ ] FAIL

FINAL BROWSER RECORDING RESULT: [ ] PASS  [ ] FAIL  [ ] N/A (no microphone)
PASS CONDITION: every step above behaves as described; a denied
permission fails clearly rather than silently.

============================================================
UAT-07b — DOCUMENT / IMAGE EVIDENCE AND THE evidence_submission CONSENT GATE
============================================================
Account: uat-facilitator@witness-uat.example (capture), plus
uat-participant@witness-uat.example (to grant/refuse consent as the source
participant)
Files needed: one small synthetic PDF and one small synthetic JPEG/PNG —
anything non-confidential works (a one-page test document, a stock photo).

This is new since document/image evidence didn't exist when this package
was first written. Engineering has verified the consent gate, the
zero-writes-on-denial behaviour, and tenant isolation at the API level
(26 automated tests) — this is the human click-through confirmation.

CASE A — evidence_submission GRANTED
1. As the participant, complete session consent with "Submitting a
   document or photo as evidence" (evidence_submission) granted.
   [ ] PASS  [ ] FAIL
2. As the facilitator, capture a new piece of evidence attributed to that
   participant, then attach the synthetic PDF via the file picker.
   EXPECTED: upload succeeds.
   [ ] PASS  [ ] FAIL
3. Confirm the attachment section now shows a "Load and download" control
   for the PDF, and it actually opens/downloads the right file.
   [ ] PASS  [ ] FAIL
4. Confirm no "Transcript" section appears for this document (transcription
   is audio-only).
   [ ] PASS  [ ] FAIL
5. Repeat steps 2–3 on a second piece of evidence with the synthetic image
   instead. Confirm the image preview renders inline (not a download link).
   [ ] PASS  [ ] FAIL
6. Check the organisation's storage usage page. Confirm it increased by
   roughly the size of both files, once each (no duplicate counting).
   [ ] PASS  [ ] FAIL

CASE B — evidence_submission REFUSED or never decided
7. As the participant, either refuse evidence_submission specifically, or
   use a session/participant where it was never asked.
   [ ] PASS  [ ] FAIL
8. As the facilitator, attempt to attach a synthetic document or image to
   evidence attributed to that participant.
   EXPECTED: the upload is denied with a plain-language message about
   permission — not a raw error code, and not a silent failure.
   [ ] PASS  [ ] FAIL
9. Confirm nothing appears attached afterward — no partial upload, no
   attachment shown, storage usage unchanged.
   [ ] PASS  [ ] FAIL

CASE C — valid consent, wrong role
10. Sign in as uat-observer@witness-uat.example (read-only). Attempt to
    reach the same attach-evidence control.
    EXPECTED: denied or not offered, regardless of any participant's
    consent state.
    [ ] PASS  [ ] FAIL

CASE D — cross-tenant
11. Sign in as uat-tenantb-admin@witness-uat.example (Tenant B UAT).
    Attempt to view or act on the Case A evidence from Witness Production
    (e.g. by trying its URL directly, if you can construct one from
    testing above).
    EXPECTED: denied — Tenant B has no access to Witness Production's
    evidence no matter what consent exists on it.
    [ ] PASS  [ ] FAIL

FINAL DOCUMENT/IMAGE CONSENT RESULT: [ ] PASS  [ ] FAIL
PASS CONDITION: Case A succeeds cleanly; Cases B/C/D are all denied, with
B specifically giving an understandable, non-technical refusal message.

============================================================
UAT-07 — iTAUKEI / FIJIAN TRANSCRIPTION
============================================================
This is the one test that needs a genuine recording — engineering has not
fabricated a benchmark, because no real iTaukei/Fijian audio has ever been
available to it.

Please obtain or record 2-5 minutes of genuine, ordinary conversational
iTaukei/Fijian speech: multiple natural sentences, real Fijian names/place
names where that comes up naturally, and nothing confidential or real-client.

1. Sign in as uat-facilitator@witness-uat.example.
2. Enter a synthetic test session.
3. Upload the recording.
4. Start transcription.
5. Wait for processing to finish.
6. Open the generated transcript.
7. Compare it against the recording yourself.
8. Note:
   - obvious omissions
   - incorrect words
   - Fijian name/place-name errors
   - any language-switching behaviour
   - whether the transcript is usable after a human corrects it
9. Confirm a human can edit/correct the transcript.
10. Confirm the AI-generated transcript is presented as a draft for review,
    not as something that silently became authoritative without a human
    looking at it.

USABLE WITHOUT CORRECTION: [ ] YES  [ ] NO
USABLE WITH HUMAN CORRECTION: [ ] YES  [ ] NO
MAJOR FAILURE: [ ] YES  [ ] NO
NOTES:
_______________________________________________

============================================================
UAT-08 — FULL HUMAN GOLDEN PATH
============================================================
Use your own account (dreamercoat@gmail.com) for the admin/setup steps, and
switch to the synthetic accounts above where noted. Use Witness Production.
Label everything you create with "UAT" in the title.

1. ACTION: Log in as yourself.
   EXPECTED: You land in Witness Production.
   PASS CRITERIA: correct organisation shown.
   [ ] PASS  [ ] FAIL

2. ACTION: Create a new program/workspace, titled with "UAT" in the name.
   EXPECTED: Program is created and appears in the list.
   PASS CRITERIA: program visible and open-able.
   [ ] PASS  [ ] FAIL

3. ACTION: Create a new session inside that program, setting a purpose and
   adding at least one agenda item.
   EXPECTED: Session is created with the purpose and agenda item saved.
   PASS CRITERIA: session appears with correct details, purpose, and
   agenda.
   [ ] PASS  [ ] FAIL

4. ACTION: Add a participant to the session (or switch to
   uat-facilitator@witness-uat.example to do this), recording a language
   preference or accessibility need on the participant.
   EXPECTED: Participant is added with that information saved.
   PASS CRITERIA: participant appears in the session's participant list,
   with the language/accessibility field visible.
   [ ] PASS  [ ] FAIL

5. ACTION: Sign in as uat-participant@witness-uat.example (separate
   session/incognito) and complete consent for that session.
   EXPECTED: Consent is recorded.
   PASS CRITERIA: consent status updates and is visible to the facilitator.
   [ ] PASS  [ ] FAIL

6. ACTION: As the participant, submit a contribution (text is fine; try an
   audio upload too if convenient — or record it in the browser, see
   UAT-07a for the detailed steps).
   EXPECTED: Contribution is captured.
   PASS CRITERIA: it appears in the session for the facilitator/reviewer.
   [ ] PASS  [ ] FAIL

6a. ACTION: With evidence_submission consent granted for this participant
    (see UAT-07b if not already done), attach a synthetic document or
    image to a piece of evidence.
    EXPECTED: attachment succeeds and renders/downloads correctly.
    PASS CRITERIA: same as UAT-07b, Case A.
    [ ] PASS  [ ] FAIL

7. ACTION: If you uploaded audio, wait for transcription to complete, then
   make one small correction to the transcript.
   EXPECTED: Transcript appears against the contribution, and your
   correction saves.
   PASS CRITERIA: status moves from processing to completed; the corrected
   text persists after a refresh.
   [ ] PASS  [ ] FAIL

8. ACTION: Sign in as uat-reviewer@witness-uat.example and review the
   contribution.
   EXPECTED: Reviewer can see and act on it.
   PASS CRITERIA: review action succeeds, status updates.
   [ ] PASS  [ ] FAIL

9. ACTION: Generate/view the session summary.
   EXPECTED: A summary is produced (local AI-generated).
   PASS CRITERIA: summary content is present and editable by a human.
   [ ] PASS  [ ] FAIL

10. ACTION: Record a decision for the session.
    EXPECTED: Decision is created and linked to supporting evidence.
    PASS CRITERIA: decision appears in the session's outcomes.
    [ ] PASS  [ ] FAIL

11. ACTION: Record an action item.
    EXPECTED: Action item is created.
    PASS CRITERIA: it appears with an owner/status.
    [ ] PASS  [ ] FAIL

12. ACTION: Search for the contribution you added (by a distinctive word
    from its content), then open the search result.
    EXPECTED: It is found, and opening it takes you to the original
    evidence/session it came from.
    PASS CRITERIA: search returns the correct result, and you can trace it
    back to its source.
    [ ] PASS  [ ] FAIL

13. ACTION: Export the session's report (try more than one format if you
    have time — HTML, Markdown, CSV).
    EXPECTED: Export succeeds and contains the organisation/program name,
    the contribution, and the summary.
    PASS CRITERIA: exported file is complete and readable.
    [ ] PASS  [ ] FAIL

14. ACTION: Log out.
    EXPECTED: Session ends cleanly.
    PASS CRITERIA: no error, redirected to sign-in.
    [ ] PASS  [ ] FAIL

15. ACTION: Log back in as yourself.
    EXPECTED: Everything you did above is still there.
    PASS CRITERIA: the program, session, contribution, summary, decision
    and action item all persisted correctly.
    [ ] PASS  [ ] FAIL

FINAL GOLDEN PATH RESULT: [ ] PASS  [ ] FAIL

============================================================
WITNESS HUMAN UAT SIGN-OFF
============================================================

Reviewer UAT:                    [ ] PASS  [ ] FAIL
Observer UAT:                    [ ] PASS  [ ] FAIL
Multi-session UAT:               [ ] PASS  [ ] FAIL
Firefox:                         [ ] PASS  [ ] FAIL
Safari:                          [ ] PASS  [ ] FAIL
iPhone:                          [ ] PASS  [ ] FAIL
PWA:                             [ ] PASS  [ ] FAIL
Browser audio recording:         [ ] PASS  [ ] FAIL  [ ] N/A
Document/image consent:          [ ] PASS  [ ] FAIL
iTaukei/Fijian transcription:    [ ] PASS  [ ] PASS WITH LIMITATIONS
                                  [ ] FAIL  [ ] NOT TESTED
Full human golden path:          [ ] PASS  [ ] FAIL

P0 defects discovered: _____
P1 defects discovered: _____
P2 defects discovered: _____
P3 defects discovered: _____
Other findings: _____

Even a full PASS above does NOT by itself approve real client data — see
"REAL CLIENT DATA" in RELEASE INFORMATION at the top of this document. The
outstanding R2 storage-protection action is separate from this UAT and is
tracked in `docs/operations/PILOT_OPERATIONS.md`.

FINAL HUMAN ACCEPTANCE:
[ ] APPROVED FOR CONTROLLED PILOT
[ ] APPROVED WITH CONDITIONS
[ ] NOT APPROVED

TESTED BY: ____________________
DATE: ____________________
NOTES: ____________________

Once this is filled in, send it back and engineering will pick up from
there — either closing out the release, or fixing whatever this surfaced.
