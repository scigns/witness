# Witness Pilot Launch Checklist

**Status:** Active
**Purpose:** A concise operator checklist for preparing, rehearsing, running and closing a
controlled Witness pilot.

This checklist does not replace the detailed operational documentation.

Use it together with:

- [`CLIENT_ONBOARDING_RUNBOOK.md`](CLIENT_ONBOARDING_RUNBOOK.md) — client setup;
- [`PILOT_1_READINESS.md`](PILOT_1_READINESS.md) — pilot go/no-go control;
- [`PILOT_OPERATIONS.md`](PILOT_OPERATIONS.md) — deployment and operations;
- [`../release/CLIENT_ROLLOUT_PROFILES.md`](../release/CLIENT_ROLLOUT_PROFILES.md) — institutional
  profile guidance;
- [`FACILITATOR_QUICKSTART.md`](FACILITATOR_QUICKSTART.md) — facilitator session guide.

The purpose of this file is simple:

> Make launching another Witness pilot repeatable without rediscovering the process.

---

## 1. Identify the pilot

Before creating anything:

- [ ] Client / organisation confirmed.
- [ ] Client sponsor named.
- [ ] Witness operator named.
- [ ] Primary facilitator named.
- [ ] Pilot dates agreed.
- [ ] Pilot purpose written in one or two sentences.
- [ ] Expected session count agreed.
- [ ] Expected participant range understood.
- [ ] Appropriate institutional profile selected.
- [ ] Pilot scope recorded in `PILOT_1_READINESS.md`.

The profile is a starting configuration, not a separate version of Witness.

---

## 2. Configure the organisation

Follow `CLIENT_ONBOARDING_RUNBOOK.md`.

Confirm:

- [ ] Organisation exists.
- [ ] Correct institutional profile selected.
- [ ] First organisation administrator can sign in.
- [ ] Storage quota is appropriate for the pilot.
- [ ] No shared production login is being used.
- [ ] Client-specific secrets or credentials are not stored in Git.

Institutional profiles currently supported:

- regional / multi-community consultation;
- training / classroom co-design;
- formal institutional proceeding;
- congregational meeting;
- general configuration where none of the above is appropriate.

Do not treat a profile as legal or policy approval.

---

## 3. Configure the first program

As an authorised administrator:

- [ ] Create the program.
- [ ] Give it a clear client-facing name.
- [ ] Record its purpose.
- [ ] Add only the users who need access.
- [ ] Assign the minimum role required.
- [ ] Confirm the facilitator can access the program.
- [ ] Confirm unrelated programs are not visible to the facilitator.

Use **Program** in client-facing communication even though some internal routes and domain objects
remain named `workspace`.

---

## 4. Configure the first session

Before rehearsal:

- [ ] Create the session.
- [ ] Confirm date/time where relevant.
- [ ] Add agenda items or discussion structure.
- [ ] Add required resources.
- [ ] Configure consent.
- [ ] Confirm which evidence types will be used.
- [ ] Confirm whether audio recording will be used.
- [ ] Confirm whether transcription is required.
- [ ] Confirm expected outputs: summary, decisions, actions, report or export.

Only configure capabilities that the session actually needs.

---

## 5. Confirm roles

At minimum identify:

| Responsibility              | Expected Witness role                    |
| --------------------------- | ---------------------------------------- |
| Organisation administration | admin                                    |
| Running the session         | facilitator                              |
| Contributing material       | contributor / participant as appropriate |
| Human validation            | reviewer                                 |
| Read-only access            | reader / participant as appropriate      |

Before rehearsal:

- [ ] Admin access restricted to named people.
- [ ] Facilitator can perform facilitator actions.
- [ ] Reviewer can perform review actions where required.
- [ ] Participant/reader cannot access administration.
- [ ] No role is being widened merely to make testing easier.

---

## 6. Confirm consent approach

Before participants are added for a real session:

- [ ] Session purpose is clear.
- [ ] Consent categories required for the session are known.
- [ ] Recording expectations are clear.
- [ ] Evidence-submission expectations are clear.
- [ ] Attribution/anonymity expectations are clear.
- [ ] Publication/sharing expectations are clear.
- [ ] Withdrawal contact/process is understood.
- [ ] Facilitator knows Witness does not replace the consent conversation.

For document/image submissions associated with a participant, respect the `evidence_submission`
consent category.

Do not use Resources to bypass participant evidence consent or provenance.

---

## 7. Fijian / iTaukei transcription condition

If the session is substantially in Fijian/iTaukei:

- [ ] Facilitator understands automated transcription is not currently approved as authoritative.
- [ ] Original audio is retained where consent permits.
- [ ] Manual or human-verified transcription will be used where accurate text matters.
- [ ] No decision or institutional record is accepted simply because a machine transcript generated
      it.

The rest of Witness may still be used normally.

---

## 8. Run the synthetic rehearsal

Before the first real session, use synthetic data only.

Complete:

- [ ] Sign in as facilitator.
- [ ] Open the correct program.
- [ ] Create/open a test session.
- [ ] Add a synthetic participant.
- [ ] Record a consent decision.
- [ ] Capture a note.
- [ ] Upload or record one synthetic attachment.
- [ ] Confirm the evidence appears in the correct session.
- [ ] Review the evidence.
- [ ] Review a transcript where applicable.
- [ ] Generate/review the summary.
- [ ] Record at least one synthetic decision or action.
- [ ] Create/open a report.
- [ ] Export an approved output.
- [ ] Confirm an unrelated organisation/program is not visible.
- [ ] Sign out and sign in again.

Where useful, supplement the human rehearsal with:

- `scripts/pilot/security-smoke.mjs`
- `scripts/pilot/browser-walkthrough.mjs`

Automated scripts do not replace the human rehearsal.

---

## 9. Day-before launch check

The day before the first real session:

- [ ] Production web application reachable.
- [ ] API readiness healthy.
- [ ] Identity provider reachable.
- [ ] Facilitator account works.
- [ ] Facilitator knows the correct program/session.
- [ ] Required devices/browser confirmed.
- [ ] Microphone tested if recording will be used.
- [ ] Relevant resources uploaded.
- [ ] Consent setup reviewed.
- [ ] Support contact known.
- [ ] Manual fallback agreed.
- [ ] No unresolved P0/P1 issue affects the session.

Do not introduce a new deployment or software change immediately before the session unless required
to resolve a blocker.

---

## 10. Start-of-session check

Immediately before participants begin:

- [ ] Correct organisation/program/session open.
- [ ] Facilitator identity confirmed.
- [ ] Agenda ready.
- [ ] Participant process explained.
- [ ] Consent conversation completed.
- [ ] Consent state recorded where required.
- [ ] Recording indicator understood if recording is used.
- [ ] Facilitator knows how to pause/stop recording.
- [ ] Manual fallback available.

Never continue recording simply because the software is able to record.

---

## 11. During the session

The facilitator should focus on the session, not the software.

Confirm as needed:

- [ ] Contributions are associated with the correct session.
- [ ] Consent boundaries remain clear.
- [ ] Pause/resume/stop recording when required.
- [ ] Do not treat generated text as authoritative.
- [ ] Capture important decisions/actions deliberately.
- [ ] If connectivity fails, make the failure visible and use the agreed fallback.
- [ ] Do not repeatedly retry an uncertain submission if that could create duplicates.

If a P0 condition occurs, stop the affected workflow and follow `PILOT_1_READINESS.md`.

---

## 12. Immediately after the session

Before considering the session closed:

- [ ] Evidence appears in the correct session.
- [ ] Failed uploads identified.
- [ ] Transcript reviewed where applicable.
- [ ] Machine-generated output human-reviewed.
- [ ] Summary reviewed.
- [ ] Decisions recorded.
- [ ] Commitments/actions recorded.
- [ ] Report created where required.
- [ ] Audience/publication state checked.
- [ ] Required export produced.
- [ ] Sensitive outputs sent only to authorised recipients.

Generated content remains draft material until human confirmation.

---

## 13. Capture pilot learning

After each session, use the **Pilot feedback** GitHub issue template.

Capture operational/product learning only:

- session completed;
- facilitator independence;
- preparation time;
- time to approved output;
- transcription usefulness;
- generated-output editing required;
- confusing steps;
- trust/consent concerns;
- failure/recovery events;
- most valuable capability;
- missing capability;
- whether the facilitator would use Witness again.

Do not put participant names, quotations, transcripts, confidential evidence or session content into
GitHub.

---

## 14. Review pilot value

At agreed review points, inspect aggregate operational evidence already available in Witness.

Useful measures include:

- sessions completed;
- evidence captured;
- failed processing jobs;
- reviews completed;
- reports published;
- exports produced;
- session-close to published-report turnaround where available;
- reuse of earlier records/evidence.

Use these as evidence for product improvement and client value.

Do not overstate what a small pilot proves.

---

## 15. Close or continue the pilot

At the end of the pilot:

- [ ] All planned sessions accounted for.
- [ ] Outstanding consent/withdrawal matters resolved.
- [ ] Access reviewed.
- [ ] Temporary users reviewed.
- [ ] Client outputs delivered to authorised recipients.
- [ ] Pilot feedback summarised.
- [ ] P0/P1/P2 issues classified.
- [ ] Product changes identified.
- [ ] Continued-use decision recorded.
- [ ] Retention/deletion expectations confirmed.

Record one outcome:

- [ ] Continue to another session.
- [ ] Expand the pilot.
- [ ] Continue with conditions.
- [ ] Pause for remediation.
- [ ] End the pilot.

---

## 16. Principle

The first pilots exist to answer:

> Can an institution use Witness successfully, with less burden and better traceability than its
> current process?

Do not add new product scope during a live pilot simply because a user mentions an idea.

Record the learning first.

Build after the evidence is clear.
