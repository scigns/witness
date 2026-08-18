# Client Rollout Profiles

**Status:** Active
**Owner:** Infrastructure Lead with Product

Operational defaults for the four institutional profiles Witness ships today
(`spc` / `fta` / `moj` / `church`, selected on organisation creation — see
[`profile-starter-templates.ts`](../../services/api-gateway/src/organisations/profile-starter-templates.ts)).
Not marketing copy: this is what an operator sets, and what to watch for,
per client type. Pair with
[`CLIENT_ONBOARDING_RUNBOOK.md`](../operations/CLIENT_ONBOARDING_RUNBOOK.md)
for the step-by-step.

The application is not forked per client. Every row below is the same
Witness build, configured differently at organisation creation and in the
first program/session an admin sets up.

Each real institutional engagement gets **its own deployment** (its own
host, its own database) — not a shared multi-tenant instance. The pilot
instance currently holds several organisations at once for controlled
testing only; that is not the rollout topology. See PILOT_OPERATIONS.md's
"Data portability" section for why one-deployment-per-customer is also what
makes tenant data provably exportable.

---

## SPC — regional / multi-community consultation

| | |
|---|---|
| **Institutional profile** | `spc` |
| **Starter consent template** | "Regional community consultation consent" — participation required, everything else (recording, transcription, AI processing, internal use) opt-in per category |
| **Initial admin role** | `admin` (organisation-scoped, from bootstrap) |
| **Recommended participant roles** | `facilitator` per community/region running sessions; `contributor` for co-design participants; `reader` for observers who should not author records |
| **Default quota** | 5 GB (raise via `storageQuotaGb` at org creation if multiple communities will contribute concurrently) |
| **First program structure** | One program per consultation initiative; one workspace per community or region under it |
| **First session structure** | One session per community visit/meeting; named, pseudonymous and anonymous participants as the community requires |
| **Expected evidence types** | Audio recordings, facilitator notes, photos of physical artefacts (posters, maps) |
| **Expected outputs** | Session summary per community, cross-community synthesis report, HTML/Markdown export for community feedback |
| **Onboarding notes** | Consent is opt-in by category by design — do not pre-check recording/transcription for communities that have not agreed |
| **Risk notes** | Multi-community data may carry different consent bases per community; do not merge two communities into one workspace |
| **Low-bandwidth considerations** | Transcription/AI processing run locally (Ollama) — no dependency on connectivity during a session; sync uploads afterwards where connectivity is poor |
| **Human acceptance items** | Community-facing consent language reviewed in-language where relevant; cross-community synthesis report reviewed by a facilitator before circulation |

## FTA — training / classroom co-design

| | |
|---|---|
| **Institutional profile** | `fta` |
| **Starter consent template** | "Classroom session consent" — participation required, recording/transcription/AI opt-in |
| **Initial admin role** | `admin` (organisation-scoped) |
| **Recommended participant roles** | `facilitator` (trainer/instructor); `contributor` (trainees); `reviewer` only if outputs feed a formal assessment |
| **Default quota** | 5 GB |
| **First program structure** | One program per course/cohort |
| **First session structure** | One session per class/workshop |
| **Expected evidence types** | Discussion recordings, group work outputs, facilitator observations |
| **Expected outputs** | Session summary for follow-up, action list for participants |
| **Onboarding notes** | Trainees are typically named participants (attendance matters) rather than anonymous |
| **Risk notes** | Minimal — lowest formality of the four profiles; the main risk is over-collecting consent categories a training session does not need |
| **Low-bandwidth considerations** | Same local-inference posture as SPC |
| **Human acceptance items** | Confirm trainees understand recordings are for the course, not evaluation, unless stated otherwise |

## MOJ — formal proceeding

| | |
|---|---|
| **Institutional profile** | `moj` |
| **Starter consent template** | "Formal proceeding consent" — participation **and** audio recording **and** transcription all required (not opt-in), reflecting an evidentiary record |
| **Initial admin role** | `admin` (organisation-scoped); keep the admin list short and named |
| **Recommended participant roles** | `reviewer` for anyone who must validate/approve the record; `contributor` for parties submitting evidence; `reader` for restricted read access to the outcome only |
| **Default quota** | 5 GB; raise proactively if proceedings run long or include large exhibits |
| **First program structure** | One program per matter/case |
| **First session structure** | One session per sitting/hearing |
| **Expected evidence types** | Recorded proceedings, submitted documents, exhibits |
| **Expected outputs** | Formal transcript, decision/outcome record, audited export (JSON/CSV for downstream systems, HTML/Markdown for the record) |
| **Onboarding notes** | Because recording and transcription are required (not optional) for this profile, confirm the legal basis for that is settled with the institution before the first real matter — this is a policy question, not a technical one |
| **Risk notes** | Highest formality — role security and the audit chain matter most here; verify tenant isolation and role security explicitly before go-live (see the onboarding runbook's step 8) |
| **Low-bandwidth considerations** | Same local-inference posture; do not rely on connectivity during a sitting |
| **Human acceptance items** | Legal/compliance sign-off on the consent basis; a `reviewer` walks through validate/approve/publish end to end before the first real matter |

## CHURCH — congregational meeting

| | |
|---|---|
| **Institutional profile** | `church` |
| **Starter consent template** | "Congregational meeting consent" — participation required, everything else opt-in |
| **Initial admin role** | `admin` (organisation-scoped) |
| **Recommended participant roles** | `facilitator` (meeting chair/secretary); `contributor` (members raising items); `reader` for members who want the record without authoring |
| **Default quota** | 5 GB |
| **First program structure** | One program per congregation or committee |
| **First session structure** | One session per meeting |
| **Expected evidence types** | Meeting recordings, minutes, decisions and action items |
| **Expected outputs** | Meeting summary and decisions/actions export for those who could not attend |
| **Onboarding notes** | Frame consent language pastorally, not legally — the starter template's plain-language summary is written for that |
| **Risk notes** | Low, similar profile to FTA; watch for informal recording of members who stepped out before consent was captured |
| **Low-bandwidth considerations** | Same local-inference posture; relevant where congregations meet in low-connectivity locations |
| **Human acceptance items** | Confirm the decisions/actions export reads correctly for a non-technical reader before relying on it as the meeting record |
