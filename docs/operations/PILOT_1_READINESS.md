# Witness Pilot 1 Readiness

**Status:** PREPARATION
**Release baseline:** client-ready production release after PR #96
**Pilot mode:** controlled, founder-led
**Production data status:** SYNTHETIC ONLY until every real-data gate below is closed

---

## 1. Purpose

This document is the operational go/no-go control for the first real Witness pilot.

It does not replace:

- `docs/operations/CLIENT_ONBOARDING_RUNBOOK.md`
- `docs/operations/PILOT_OPERATIONS.md`
- `docs/operations/DEPLOYMENT_GUIDE.md`
- `docs/release/CLIENT_ROLLOUT_PROFILES.md`
- `docs/governance/CONSENT_FRAMEWORK.md`
- `docs/operations/INCIDENT_RESPONSE.md`

It ties those controls together for one controlled client pilot.

The rule is simple:

> A client may be prepared and rehearsed with synthetic data before all infrastructure gates close.
> Real confidential or institutional data must not enter Witness until the real-data gate is
> explicitly marked GO.

---

## 2. Pilot identity

Complete before onboarding.

- Client / organisation:
- Pilot owner:
- Client sponsor:
- Primary facilitator:
- Witness operator:
- Pilot start date:
- Pilot end/review date:
- Selected rollout profile:
  - [ ] SPC — regional / multi-community consultation
  - [ ] FTA — training / classroom co-design
  - [ ] MOJ — formal proceeding
  - [ ] CHURCH — congregational meeting
  - [ ] Other — documented and approved
- Expected number of sessions:
- Expected number of facilitators:
- Expected participant range:

---

## 3. Pilot scope

### In scope

The pilot may use the established Witness workflow:

1. sign in;
2. enter an authorised organisation/program;
3. prepare a session;
4. add participants;
5. configure and capture consent;
6. capture or upload evidence;
7. process transcripts where appropriate;
8. review contributions;
9. record decisions, commitments and actions;
10. create/review summaries;
11. search prior material;
12. create and export approved reports.

### Out of scope unless separately approved

- unrestricted public signup;
- autonomous decisions;
- external/cloud AI processing;
- production use of unreliable automated Fijian/iTaukei transcription as authoritative text;
- cross-client data access;
- use outside approved consent purposes;
- production configuration changes during a live session;
- speculative integrations not required by this pilot.

---

## 4. Client roles

Assign the minimum role required.

| Pilot responsibility        | Witness role                       | Named person | Confirmed |
| --------------------------- | ---------------------------------- | ------------ | --------- |
| Organisation administration | admin                              |              | [ ]       |
| Session facilitation        | facilitator                        |              | [ ]       |
| Evidence contribution       | contributor                        |              | [ ]       |
| Human review                | reviewer                           |              | [ ]       |
| Read-only access            | reader / participant as applicable |              | [ ]       |

Before GO:

- [ ] Every user has an individual account.
- [ ] No shared production credentials are used.
- [ ] Each user has only the organisation/program access they require.
- [ ] Admin access is limited to named administrators.
- [ ] Reviewer authority is agreed with the client.
- [ ] Access removal process is understood.

Reference: `docs/operations/CLIENT_ONBOARDING_RUNBOOK.md`.

---

## 5. Consent and data-handling agreement

Before any real participant information is entered:

- [ ] The client understands what Witness captures.
- [ ] The client identifies the purpose of the session.
- [ ] Required and optional consent categories are agreed.
- [ ] Recording permission is explicit where recording is used.
- [ ] Evidence-submission consent is configured where required.
- [ ] Sharing/publication permissions are understood.
- [ ] Attribution / anonymity expectations are agreed.
- [ ] Withdrawal process is explained.
- [ ] A contact is nominated for withdrawal requests received outside Witness.
- [ ] Retention expectations are documented.
- [ ] Export recipients and permitted audiences are documented.
- [ ] Facilitators understand that the interface does not replace a proper consent conversation.
- [ ] AI-generated content is understood to be draft material until human review/confirmation.

Reference: `docs/governance/CONSENT_FRAMEWORK.md`.

---

## 6. Fijian / iTaukei transcription condition

For sessions substantially conducted in Fijian/iTaukei:

- [ ] Facilitator understands automated transcription is not currently approved as a reliable
      authoritative draft.
- [ ] Original audio is retained according to consent.
- [ ] Manual transcription or human-verified transcription will be used where accurate text is
      required.
- [ ] No decision is accepted merely because the machine transcript produced it.

This limitation does not prevent the controlled pilot from using the rest of the Witness workflow.

---

## 7. Synthetic rehearsal gate

Run before real participant data.

Use synthetic names, synthetic contributions and non-confidential files only.

The rehearsal must complete:

- [ ] sign in;
- [ ] access only the intended organisation/program;
- [ ] create or open the pilot program;
- [ ] create a session;
- [ ] add a synthetic participant;
- [ ] configure consent;
- [ ] record a consent decision;
- [ ] capture one note;
- [ ] upload or record one synthetic attachment;
- [ ] confirm evidence appears in the correct session;
- [ ] submit/review evidence;
- [ ] generate or review a summary;
- [ ] record at least one decision or action;
- [ ] create/open a report;
- [ ] export an approved result;
- [ ] verify another tenant/program is not visible to the pilot user;
- [ ] sign out and sign back in successfully.

Suggested supporting checks:

- `scripts/pilot/security-smoke.mjs`
- `scripts/pilot/browser-walkthrough.mjs`

Do not substitute automated checks for the human rehearsal.

---

## 8. Support process

### Pilot support owner

Name: Contact method: Availability during session: Backup contact:

### Severity

#### P0 — stop immediately

Examples:

- suspected cross-tenant data exposure;
- consent boundary bypass;
- lost or corrupted source evidence;
- credential compromise;
- destructive behaviour affecting institutional records.

Action:

1. stop the affected workflow;
2. preserve evidence/log references without copying sensitive content into GitHub;
3. restrict access if necessary;
4. follow `docs/operations/INCIDENT_RESPONSE.md`;
5. do not resume until the issue is understood and authorised.

#### P1 — pilot-blocking

Examples:

- users cannot authenticate;
- facilitator cannot access the correct program;
- consent cannot be recorded;
- evidence cannot be safely captured;
- approved output cannot be produced.

Action:

- pause the affected activity;
- use the agreed manual fallback where safe;
- record the defect;
- resume only after validation.

#### P2 — degraded but usable

Examples:

- confusing wording;
- layout issue;
- non-critical processing delay;
- workaround available without weakening consent/security.

Action:

- record for pilot review;
- continue if the facilitator agrees.

---

## 9. Manual fallback

The pilot must not depend on Witness continuing at all costs.

If Witness becomes unavailable:

- [ ] Facilitator has an agreed offline/manual note-taking method.
- [ ] Consent is still obtained independently of the application.
- [ ] Recording does not continue unless consent remains clear.
- [ ] Data collected outside Witness is not uploaded later unless its consent basis and source are
      clear.
- [ ] Any later import is reviewed before becoming institutional record.

---

## 10. Operations gate

Before pilot GO:

- [ ] Current production release is healthy.
- [ ] Web endpoint responds successfully.
- [ ] API readiness is healthy.
- [ ] Identity provider is reachable.
- [ ] PostgreSQL is healthy.
- [ ] Local inference is healthy where required.
- [ ] External inference remains disabled unless explicitly approved.
- [ ] Deployment pipeline is green.
- [ ] Production operator has access to required runbooks.
- [ ] No unresolved P0/P1 software defect affects the pilot workflow.

Reference: `docs/operations/PILOT_OPERATIONS.md`.

---

## 11. Database backup gate

Before real data:

- [ ] Daily PostgreSQL backup schedule is confirmed.
- [ ] Latest backup is recent.
- [ ] Latest checksum validates.
- [ ] Backup failure is visible to the operator.
- [ ] A restore drill has been completed against an isolated/non-production target.
- [ ] Recovery owner knows the RPO/RTO expectations.
- [ ] Off-node encrypted backup strategy is agreed where required by the client.

A successful database dump alone does not protect R2 evidence attachments.

Reference: `docs/operations/PILOT_OPERATIONS.md`.

---

## 12. Object storage / evidence protection gate

This gate is mandatory before real confidential or institutional attachments are accepted.

Production currently uses S3-compatible object storage for evidence attachments.

Before GO:

- [ ] Production media/document bucket names are confirmed without exposing credentials.
- [ ] Public bucket access is disabled.
- [ ] Existing synthetic objects remain retrievable.
- [ ] Protection against accidental or malicious object deletion is enabled or an equivalent
      recoverable object-backup mechanism is implemented.
- [ ] The chosen protection mechanism is verified against current Cloudflare R2 capabilities.
- [ ] Evidence recovery procedure is documented and tested using synthetic content.
- [ ] Retention/protection configuration does not prevent lawful withdrawal/deletion requirements
      from being fulfilled.
- [ ] Operator credentials used for object storage have been reviewed for least privilege.
- [ ] Storage credentials are known to be current and intentionally issued for production.

**STOP CONDITION**

If this section is not complete:

> REAL CLIENT ATTACHMENTS ARE NOT APPROVED.

Do not work around this gate by storing confidential evidence elsewhere without an approved
data-handling decision.

---

## 13. Secrets and access gate

Before real data:

- [ ] Production secrets are not stored in Git.
- [ ] Production `.env` / secret-store values are not copied into pilot documentation.
- [ ] Cloudflare credentials are not shared with client users.
- [ ] SSH private keys remain private and passphrase-protected.
- [ ] Production S3/R2 access keys are intentionally issued and their provenance is known.
- [ ] Old/reused credentials have been rotated where provenance cannot be established.
- [ ] Keycloak/admin credentials are restricted.
- [ ] No shared UAT password is reused for real client accounts.

---

## 14. Client data readiness decision

### Current state

**NO-GO FOR REAL CONFIDENTIAL CLIENT DATA until all mandatory gates above are complete.**

Synthetic rehearsal is permitted.

### GO authorisation

Do not mark this section until evidence exists.

- [ ] Client scope approved.
- [ ] Roles approved.
- [ ] Consent/data handling approved.
- [ ] Synthetic rehearsal passed.
- [ ] Support/fallback process agreed.
- [ ] Production health gate passed.
- [ ] Database backup/restore gate passed.
- [ ] Object-storage recovery/protection gate passed.
- [ ] Secrets/access gate passed.
- [ ] No unresolved P0/P1 defect.

Decision:

- [ ] GO
- [ ] NO-GO

Approved by: Date: Notes:

---

## 15. Pilot learning record

After each real session record only operational/product learning here or in the approved pilot
feedback mechanism — the **🧭 Pilot feedback** GitHub issue template
(`.github/ISSUE_TEMPLATE/pilot-feedback.yml`) — not participant-sensitive content.

Capture:

- session completed: yes/no;
- facilitator able to operate with limited assistance: yes/no;
- approximate preparation time;
- approximate time to approved output;
- transcription usefulness;
- major edits required to generated output;
- confusing step;
- trust concern;
- consent concern;
- failure/recovery event;
- most valuable Witness capability;
- missing capability;
- would facilitator use Witness again: yes/no/unsure;
- evidence or records retrieved from an earlier session: yes/no.

Do not copy confidential participant contributions into GitHub issues.

---

## 16. Pilot completion review

At pilot review:

- [ ] All sessions accounted for.
- [ ] Open consent/withdrawal requests resolved.
- [ ] Access reviewed.
- [ ] Temporary accounts removed or retained intentionally.
- [ ] Client exports delivered only to authorised recipients.
- [ ] Pilot feedback summarised.
- [ ] P0/P1/P2 defects classified.
- [ ] Product learning questions updated.
- [ ] Continued-use decision recorded.
- [ ] Retention/deletion requirements confirmed with the client.

Pilot outcome:

- [ ] Proceed to another session
- [ ] Proceed to wider client pilot
- [ ] Continue with conditions
- [ ] Pause for remediation
- [ ] End pilot
