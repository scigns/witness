# Pilot value measurement and renewal evidence

**Owner:** Institutional Customer Success Lead & Commercial Lead

**Status:** Controlled-pilot method

**Purpose:** Measure whether Witness creates useful governance value without fabricating ROI or relying
on third-party analytics. This method operationalises issue #119 and applies to sovereign deployments
without requiring data egress.

## Principles

- measure the customer's governance problem, not vanity usage;
- establish the baseline before the pilot where practicable;
- use comparable before/after definitions;
- record limitations and confounders with every conclusion;
- keep measurement local to the deployment unless the customer explicitly approves otherwise;
- do not infer causality from timing alone;
- do not convert estimates into financial savings unless the customer validates the method;
- a `PAUSE` or `END` outcome is valid evidence even though it is not renewal success.

## Before the pilot

Record:

- current method for capturing meetings/workshops;
- who prepares and approves the institutional record;
- elapsed time from session to approved record;
- facilitator/administrator preparation effort;
- correction/rework effort;
- method and effort required to retrieve earlier decisions/evidence;
- how evidence is linked to decisions today;
- how consent/participation boundaries are recorded today;
- known provenance, trust, accountability or continuity problems;
- reporting burden;
- support/dependency on particular staff members;
- baseline limitations and measurement confidence.

Do not require a numerical baseline where the institution does not currently measure one. Record
`NOT_MEASURED` rather than inventing a number.

## During the pilot

For each representative session record:

- facilitator preparation minutes;
- session-to-approved-record elapsed time;
- transcript correction effort;
- report correction effort;
- number and type of support requests;
- user-visible failures/dead ends;
- review turnaround;
- evidence/decision retrieval attempts and outcome;
- unresolved trust or provenance concerns;
- consent/governance incidents;
- browser/mobile/accessibility blockers;
- material contextual events that may confound comparison.

## End-of-pilot evaluation

Compare the same definitions used at baseline.

Evaluate:

1. Was an approved institutional record produced more reliably?
2. Can authorised users reconstruct how a decision was reached?
3. Can prior evidence and decisions be retrieved when needed?
4. Is participant-derived content rendered within the agreed consent boundary?
5. Did Witness reduce, move or increase administrative work?
6. What correction/review burden remained?
7. What support did the customer require from Witness staff?
8. What trust, usability or operational concerns remain unresolved?
9. Would the institution use Witness for another programme?
10. Would the institution pay for continued use?
11. Who owns the procurement/renewal decision?
12. What would prevent renewal or expansion?

## Renewal decision

Use exactly one primary outcome:

- `RENEW`;
- `EXPAND`;
- `CONTINUE CONDITIONALLY`;
- `PAUSE`;
- `END`.

The decision record must include:

- governance-value evidence;
- user/facilitator evidence;
- support burden;
- unresolved risks;
- commercial/procurement status;
- recurring versus one-off implementation work;
- limitations/confounders;
- decision owner and date;
- conditions and next review point where applicable.

## Comparable measures

Prefer direct operational observations such as:

- preparation minutes per representative session;
- session-to-approved-record elapsed time;
- number of correction passes;
- number of support interventions;
- decision/evidence retrieval success and elapsed time;
- unresolved governance concerns;
- participant/facilitator willingness to repeat the workflow.

Do not claim financial ROI from these measures unless the customer supplies and approves the cost
conversion assumptions.

## Privacy and sovereignty

Measurement records may contain institutional operational information. Store them in the approved
customer/deployment evidence location, not in the public repository. Use synthetic examples in Git.
Sovereign deployments must be able to complete the entire method without external analytics or data
egress.

## Templates

Use:

- `templates/PILOT_BASELINE_TEMPLATE.md`;
- `templates/PILOT_EVALUATION_TEMPLATE.md`;
- `templates/RENEWAL_DECISION_TEMPLATE.md`.

The synthetic walkthrough in `PILOT_VALUE_SYNTHETIC_WALKTHROUGH.md` verifies that the method can be
applied to all three documented product archetypes without changing the core product.
