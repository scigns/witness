# Pilot go/no-go template

**Owner:** Product Director
**Status:** Mandatory reusable decision template

## Pilot identity

Opportunity/pilot reference, synthetic archetype, customer sponsor role, Witness pilot owner and
proposed revenue gate. Do not include confidential customer data in the public repository.

## Assessments

| Dimension | Perspective/owner role | State | Evidence | Conditions/blocker |
|---|---|---|---|---|
| Use-case fit and customisation | Product | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Request classification | Product | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Architecture, security, identity and sovereignty | Engineering/Security | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Commercial terms and procurement | Commercial | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Sponsor authority and success measures | Customer Sponsor | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Consent and data handling | Product/Governance | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Backup/restore, migration and incident handling | Platform Operator | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |
| Support ownership and exit | Customer Success | `[READY/CONDITION/BLOCKED — REQUIRED]` | `[REQUIRED]` | `[REQUIRED FOR CONDITION/BLOCKED; N/A FOR READY]` |

## Decision

`GO`, `GO WITH CONDITIONS`, or `NO-GO`.

Record rationale, conditions with owners and due points, evidence links, decision-maker roles and
the stop rule if a condition is not met. Every mandatory row requires a recorded state and
evidence; blank is never approval. `GO` requires every mandatory row to be `READY`. `CONDITION`
produces `GO WITH CONDITIONS` only where the existing readiness model permits it. `BLOCKED`
produces `NO-GO`.

Before confidential or real institutional data is used, the operational real-data gate in
[Pilot 1 readiness](../../operations/PILOT_1_READINESS.md) must be explicitly `GO`. Neither a blank
gate nor `GO WITH CONDITIONS` in this template overrides that requirement. Documentation of a
control is not proof it operates.
