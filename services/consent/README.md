# Consent Service

**Owner:** Governance Lead · Security Lead
**Status:** Phase 3

**The most consequential service in Witness.** Grants, scopes, delegations, revocations, erasure.

Consent is a domain primitive, not a flag
([ADR-0008](../../architecture/decisions/ADR-0008-consent-as-a-domain-primitive.md)):

- `ConsentedContext` cannot be constructed without a valid decision, so forgetting the check is a
  compile error rather than a privacy incident
- Revocation propagates to **every** store within a **5-minute SLO**, verified by a pass that fails
  loudly if anything remains
- Failure is a **SEV-1 regardless of how few records are affected**

Changes here require **Governance Lead and Security Lead** approval. The Governance Lead holds an
absolute veto that neither the CTO nor the Founder can override.
