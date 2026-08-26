# Commercial security overview

**Owner:** Security Lead
**Status:** Controlled-pilot summary; not certification
**Review:** Per security questionnaire and material architecture change

Witness uses authenticated access, deny-by-default authorization, organisation/workspace scoping,
consent controls, provenance, hash-chained audit history, secret scanning and sovereign deployment
profiles. Detailed controls and limitations remain authoritative in the security architecture and
operator documentation.

## Current limitations

- database row-level security remains planned defence-in-depth;
- GA hardening and independent certification are not claimed;
- complete database-plus-object-store recovery requires deployment-specific proof;
- commercial invoice/reconciliation attack surfaces do not exist until C3 and therefore are not yet
  proven;
- target-state documents must not be presented as implementation evidence.

## Commercial controls required for C3

Tenant isolation, least-privilege reconciliation, immutable invoices, duplicate settlement
protection, exactly-once entitlement application, audit redaction and authenticated remittance
access. No card data, bank-login credential or online-banking password belongs in Witness.

Questionnaire responses must cite evidence or state `NOT IMPLEMENTED`, `PLANNED`, `OPERATOR
RESPONSIBILITY` or `REQUIRES PROFESSIONAL REVIEW`. Never infer compliance from architecture.
