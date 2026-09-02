# Pilot value synthetic walkthrough

**Owner:** Product Director & Institutional Customer Success Lead

**Status:** Synthetic method verification

**Purpose:** Demonstrate that the pilot value/renewal method can be applied to the three documented
Witness archetypes without customer-confidential information, third-party analytics, fabricated ROI,
or changes to the core product.

These are synthetic scenarios. They are not customer claims.

## Archetype 1 — Regional programme governance

Core workflow: meetings → evidence → decisions → actions → reports.

### Baseline example

A programme team records meetings in separate documents and email threads. The approved decision
record is not measured consistently. Retrieval of an earlier decision requires searching several
systems and asking a staff member who remembers the meeting. Consent/attribution boundaries are
recorded manually.

Use `NOT_MEASURED` for elapsed-time fields until a representative baseline observation is performed.

### Pilot evidence to capture

- preparation minutes for representative sessions;
- session-to-approved-record elapsed time;
- evidence and decision retrieval success;
- systems searched before/after;
- support interventions;
- report correction passes;
- provenance/trust concerns that remain;
- whether programme staff would repeat the workflow.

### Confounders

Low-bandwidth conditions, participant mix, programme staffing and newly introduced facilitation
templates may affect comparison independently of Witness.

### Renewal question

Did the organisation gain a sufficiently retrievable and trustworthy programme record to justify
continued use and procurement effort?

## Archetype 2 — Participatory co-design / education

Core workflow: workshops → contributions → review → influence evidence.

### Baseline example

Workshop notes are consolidated after sessions, with limited traceability from participant
contribution to final recommendation. Dissent, attribution and consent decisions require manual
reconstruction.

### Pilot evidence to capture

- participant/consent configuration effort;
- transcript/evidence correction burden;
- time from workshop to reviewed institutional output;
- ability to show which evidence informed a recommendation;
- ability to preserve dissent or alternative views;
- support requests and facilitator dead ends;
- participant/facilitator willingness to use the process again.

### Confounders

Facilitator experience, participant familiarity, workshop design, translation, language quality and
training effects must be recorded. Machine transcription must not be treated as authoritative.

### Renewal question

Did Witness materially improve traceability and confidence in how participant contributions reached
institutional outputs without creating unacceptable facilitation burden?

## Archetype 3 — Government digital transformation

Core workflow: requirements → workshops → approvals → change history.

### Baseline example

Requirements and approvals are distributed across meeting notes, project documents and email. Change
history is available but costly to reconstruct. Formal approval roles and procurement constraints are
important to continued operation.

### Pilot evidence to capture

- time and effort to reconstruct an approved requirement/decision;
- approval/provenance completeness;
- cross-session retrieval of prior evidence;
- support and operator intervention;
- role/authorisation friction;
- reporting/export usefulness;
- procurement and deployment constraints affecting renewal;
- unresolved security, sovereignty or recovery concerns.

### Confounders

Parallel transformation work, changes in approval policy, staffing, procurement timing and unusually
high/low project activity can affect outcomes.

### Renewal question

Did Witness provide sufficiently reliable decision/change history and operational control to justify
continued institutional procurement?

## Method verification result

The same baseline/evaluation/renewal method applies to all three archetypes through configuration and
selected governance questions. None requires:

- third-party analytics;
- customer data in the public repository;
- fabricated financial ROI;
- external data egress;
- a bespoke Witness codebase.

Each archetype requires mandatory limitations/confounders and an explicit renewal outcome:
`RENEW`, `EXPAND`, `CONTINUE CONDITIONALLY`, `PAUSE`, or `END`.

This walkthrough verifies method applicability only. It is not evidence that any real customer has
received value or will renew.
