# Role: Security Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Infrastructure Lead |
| **Integration branch** | `security`, `authentication` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make Witness safe enough to hold the things people say when they believe they are protected — and
assume that we will be attacked by someone with more resources and more patience than us.

## Responsibilities

- Own the threat model, refreshed on every architectural change and at least annually
- Own the security architecture, the control set and the trust boundaries
- Own authentication and authorisation: Keycloak configuration, Casbin policy, the policy decision
  point
- Own **coordinated disclosure** and the relationship with security researchers
- Own incident response
- Own the supply chain: SBOM, signing, attestation, dependency and secret scanning
- Own the **adversarial test suite** — tests written to break our own controls
- Own the AI security surface: prompt injection, model supply chain, egress enforcement
- Own access review: who holds merge, secret and signing authority

## Authority

### Decides alone

- Security control design and requirements
- Threat model content and severity assessment
- Rejecting a change on security grounds — **this is a hard veto within the security domain**
- Incident severity classification
- Emergency merge during an active incident (with retrospective review in 48 hours)

### Must consult

- Backend Lead on authorisation implementation
- Governance Lead on anything where security and consent interact
- Infrastructure Lead on network and deployment controls
- CTO on anything requiring a security exception

### Must escalate

- Security exceptions → CTO (joint approval; **always with an expiry date**)
- Incidents affecting deployed operators → CTO and Founder
- Findings that would require a principle change → Steering Committee

## Deliverables

Threat model (STRIDE) · security architecture · Casbin policy model with unit tests · adversarial
test suite · security advisories · incident postmortems, published in redacted form · SBOM and
signing pipeline · quarterly access review · penetration test coordination.

## Ownership

| Path / domain | Notes |
|---|---|
| `architecture/SECURITY_ARCHITECTURE.md`, `SECURITY.md` | |
| `services/identity/**`, auth adapters | With Backend Lead |
| `packages/policy/**` | Casbin model and policies |
| `test/adversarial/**` | With QA Lead |
| `.github/workflows/**` | With Infrastructure Lead |

## Success metrics

| Signal | Target |
|---|---|
| **Adversarial suite passing** | Always — a weakened assertion is the loudest signal in review |
| Critical vulnerability remediation | ≤ 7 days |
| Vulnerability report acknowledgement | ≤ 2 working days |
| Secrets committed | 0 |
| Endpoints without a declared authorisation requirement | 0 |
| Security exceptions past expiry | 0 |
| Threat model age | < 12 months |
| Egress in the sovereign profile | 0, verified in CI |

## Definition of Done

Beyond the standard DoD: the reviewer security checklist is satisfied; abuse cases are considered;
new controls have adversarial tests; no secret is present anywhere including history; failures fail
closed; error messages leak nothing; AI paths parse output as data, never as instruction.

## Dependencies

**Depends on:** Backend Lead and Infrastructure Lead (implementation), Governance Lead (consent
semantics), Research Lead (dependency risk), external researchers (disclosure).

**Depended on by:** everyone. Security review is a gate on a large share of changes, so this role's
responsiveness is a project-wide constraint — and a bottleneck here is a real risk.

## Review responsibilities

| Must review | Response |
|---|---|
| Auth, crypto, session, authorisation | 1 working day |
| Consent, export, redaction, erasure | 1 working day |
| Indigenous data governance controls | 1 working day (with Governance Lead) |
| New dependencies | 2 working days |
| CI/CD and release workflows | 1 working day |
| **Vulnerability reports** | Same day acknowledgement |

## Merge authority

`architecture/SECURITY_ARCHITECTURE.md` · `SECURITY.md` · `packages/policy/**` · auth paths (with
Backend Lead) · `.github/workflows/**` (with Infrastructure Lead) · `test/adversarial/**`.

## Anti-responsibilities

- **Does not grant an open-ended exception.** An exception without an expiry is a permanent weakening
  in disguise.
- Does not use obscurity as a control — the source is public and the threat model is published.
- Does not block indefinitely without stating what would unblock. A "no" with no path is an
  abdication.
- Does not overrule the Governance Lead on Indigenous data governance. Security and consent are
  distinct authorities, and where they conflict, consent wins.
