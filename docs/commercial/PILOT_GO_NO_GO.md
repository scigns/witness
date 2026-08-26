# Controlled institutional pilot go/no-go

**Owner:** Product Director
**Status:** Mandatory deployment decision framework
**Review:** Before proposal commitment, before real data and before production launch

## Required perspectives

A decision requires recorded input from Product, Engineering/Security, Commercial and the Customer
Sponsor. Absence of one perspective is a condition or no-go, not implicit approval.

## Decision states

- **GO:** all mandatory commercial/pilot controls and ownership are evidenced. Before confidential
  or real institutional data is used, the applicable operational real-data gate in
  [Pilot 1 readiness](../operations/PILOT_1_READINESS.md) must also be explicitly `GO`.
- **GO WITH CONDITIONS:** bounded conditions have owners, evidence, due points and an explicit rule
  for stopping if unmet, and are permitted by the existing operational readiness model. A
  commercial `GO WITH CONDITIONS` never permits confidential or real institutional data while the
  operational real-data gate is not `GO`.
- **NO-GO:** an unacceptable fit, safety, authority, operational or commercial condition exists.

## Assessment dimensions

Use-case fit; request classification; deployment topology; security; data sovereignty; consent;
identity; support ownership; commercial terms; procurement; backup/restore; migration; incident
handling; success measures; and exit/retention arrangements.

## Non-negotiable no-go triggers

Known cross-tenant exposure; unresolved consent basis for the proposed workflow; unsupported or
misrepresented deployment; no accountable operator; no recovery plan for required data; customer
expectation of autonomous institutional decisions; contractual claims the supplier cannot support;
or real confidential data before readiness evidence exists.

Use the reusable [template](templates/PILOT_GO_NO_GO_TEMPLATE.md). A documented condition is not an
implemented control. This framework references, and does not replace or duplicate, the
authoritative operational real-data gate.
