# Role: Governance Lead

| | |
|---|---|
| **Reports to** | Steering Committee *(not the CTO — deliberately)* |
| **Deputy** | Named external advisor with Indigenous data governance expertise |
| **Integration branch** | `governance` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Hold Witness to the promises it makes to the people whose words it records — and be structurally able
to stop the project from breaking them, including when the CTO, the Founder and the whole engineering
organisation want to.

This role exists because a guarantee that leadership can override is not a guarantee.

## Responsibilities

- Own the consent framework: legal bases, scopes, lifecycle, revocation semantics, delegation
- Own the digital sovereignty policy and its enforcement in the product
- Own **Indigenous data governance**: CARE, OCAP®, community consent, cultural restriction
- Own the risk register and the decision log
- Own data subject rights: access, correction, withdrawal, erasure verification
- Own retention and disposal policy
- Commission and act on **external review** — particularly by Indigenous data governance experts,
  compensated
- Ensure community research and consultation is non-extractive
- Assess every feature for community trust impact

## Authority

### Decides alone
- Consent framework semantics and legal basis definitions
- Indigenous data governance requirements
- Retention and disposal policy
- Whether a research approach with community participants is ethical
- **Absolute veto on any change weakening consent, provenance or Indigenous data sovereignty
  guarantees.** Not overridable by the CTO, the Founder, or engineering consensus. This is the
  defining feature of the role.

### Must consult
- Security Lead on enforcement mechanisms
- Backend Lead and Knowledge Graph Lead on implementation feasibility
- Product Director on user experience of consent
- **External Indigenous data governance experts on anything touching community knowledge**

### Must escalate
- Governance framework changes → Steering Committee
- Conflicts between the veto and project delivery → Steering Committee
- Legal exposure → Steering Committee and Founder

## Deliverables

[`CONSENT_FRAMEWORK.md`](../../docs/governance/CONSENT_FRAMEWORK.md) ·
[`DIGITAL_SOVEREIGNTY.md`](../../docs/governance/DIGITAL_SOVEREIGNTY.md) ·
[`INDIGENOUS_DATA_SOVEREIGNTY.md`](../../docs/governance/INDIGENOUS_DATA_SOVEREIGNTY.md) ·
[`RISK_REGISTER.md`](../../docs/governance/RISK_REGISTER.md) · decision log · privacy impact
assessment · **external review findings and their resolution** · plain-language consent material.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/governance/**` | |
| `services/consent/**` | With Backend Lead and Security Lead |
| Consent semantics anywhere in the codebase | Cross-cutting |
| Community restriction enforcement | With Knowledge Graph Lead |

## Success metrics

| Signal | Target |
|---|---|
| **Consent bypass paths** | 0 — verified adversarially |
| **Revocation propagation** | < 5 min p99, verified across every store |
| Erasure verification passing | 100% |
| **ADR-0019 external review completed before Phase 4** | Hard gate — not a target |
| Community consultations that are compensated | 100% |
| Consent material comprehension-tested | Before v1.0 |
| Consent violations | 0. Any occurrence is a SEV-1 regardless of scale |
| Risk register currency | Reviewed quarterly |

## Definition of Done

Beyond the standard DoD: the legal basis is stated; community impact is assessed; consent semantics
are preserved and tested; revocation propagates and is verified; community restrictions are honoured
above every role including administrator; language is plain enough that a non-specialist genuinely
understands it.

## Dependencies

**Depends on:** external Indigenous data governance experts (**this dependency is not optional and
must be funded**), Security Lead (enforcement), Backend Lead (implementation), Steering Committee
(authority).

**Depended on by:** the project's legitimacy. Without this role held well, Witness is a surveillance
tool with good intentions.

## Review responsibilities

| Must review | Response |
|---|---|
| Anything touching consent | 1 working day |
| Anything touching Indigenous data governance | 1 working day |
| Anything touching sovereignty or egress | 1 working day |
| Data subject rights implementations | 1 working day |
| Research involving community participants | 3 working days |
| Every PRD's community impact section | 3 working days |

## Merge authority

`docs/governance/**` · `services/consent/**` (with Security Lead) · consent semantics anywhere ·
community restriction enforcement.

## Anti-responsibilities

- **Does not trade a guarantee for a delivery date.** The veto exists precisely for the moments when
  that trade looks reasonable to everyone else.
- Does not speak for Indigenous communities. This role commissions, funds and acts on expertise it
  does not hold — and saying so plainly is part of doing the job honestly.
- Does not treat governance as documentation. A policy an administrator can override is not a control.
- Does not use the veto for matters outside its scope. Its authority is narrow and absolute, and it
  stays credible only by staying narrow.
