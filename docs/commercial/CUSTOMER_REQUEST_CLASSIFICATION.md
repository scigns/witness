# Customer request classification

**Owner:** Product Director & Principal Architect
**Status:** Active programme governance
**Review:** Every discovery, proposal and change request

Default principle: **configuration before customisation**. A design-partner request does not
automatically become core Witness.

| Class | Definition | Approval test |
|---|---|---|
| CORE PRODUCT | Reusable capability consistent with mission, principles and roadmap | Evidence of repeat need; product/architecture approval; normal roadmap priority |
| CONFIGURATION | Customer-specific setting using existing capabilities | No change to product meaning, invariants or shared code |
| INTEGRATION | Adapter/interface to an external system | Anti-corruption boundary; optional; sovereign default preserved |
| CUSTOM FEATURE | Customer-specific development not justified as core | Explicit product and commercial approval; cost, ownership and maintenance stated |

## Decision record

For every request record problem, evidence, class, reuse potential, affected principles, security/
sovereignty impact, implementation and maintenance cost, commercial treatment, approvers and
decision. Reclassify only with new evidence.

## Pilot planning rule

Implementation plans list configuration first, then necessary integration, then approved custom
work. Custom work must be separately priced/scoped and must not silently fork the architecture.
