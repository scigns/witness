# Security Review Process

**Owner:** Security Lead
**Status:** Active
**See also:** [`SECURITY.md`](../../SECURITY.md) (disclosure) · [`architecture/SECURITY_ARCHITECTURE.md`](../../architecture/SECURITY_ARCHITECTURE.md) (the model)

---

## When security review is required

| Trigger | Review depth |
|---|---|
| Any change to authentication, authorisation, cryptography, session handling | **Full** |
| Any change to consent logic or the policy decision point | **Full** + Governance Lead |
| Any change to export, redaction, erasure or retention | **Full** |
| Any change to Indigenous data governance controls | **Full** + Governance Lead (veto) |
| New external integration or network egress path | **Full** |
| New dependency | **Standard** |
| Change to CI/CD workflows or release signing | **Full** |
| Change to data classification or tenancy | **Full** |
| Architectural change (any ADR) | **Standard** |
| Everything else | Reviewer checklist only |

**Full** = Security Lead review with a written assessment recorded in the PR.
**Standard** = Security Lead approval via CODEOWNERS.

## Threat modelling

New features get a lightweight STRIDE pass at design time — before implementation, when changing the
design is still cheap. Four questions:

1. **What are we protecting** here, and what is the worst realistic outcome if it fails?
2. **Who would want to break this**, and what capability do they have?
3. **What are the trust boundaries** this change crosses?
4. **How would we know** if it were being exploited?

Recorded in the issue or the ADR. This takes twenty minutes and catches things that cost weeks later.

The full system threat model lives in `docs/research/THREAT_MODEL.md` and is refreshed on any
architectural change and at least annually.

## Abuse cases

Alongside user stories, we write **abuse cases** — how the feature could be misused. This is
especially important for Witness because the same capability that preserves institutional memory is,
misconfigured or misused, a surveillance capability.

> *As a hostile actor, I want to identify which community members spoke against a proposal, so that
> I can retaliate against them.*

Every feature touching identity, attribution or search gets at least one abuse case, and the design
must show how it is prevented or bounded. Where we cannot fully prevent it, we say so and document
the residual risk.

## Reviewer checklist

Applied by every reviewer on every pull request, not only by the Security Lead:

**Input and output**
- [ ] All external input validated at the boundary, against a schema
- [ ] Output encoded for its context; no template injection
- [ ] No user input concatenated into SQL, Cypher, or a shell command
- [ ] File uploads: type, size and content verified, not just extension

**Authentication and authorisation**
- [ ] Every new endpoint declares its authorisation requirement
- [ ] Authorisation checked at the boundary, not deep in a call chain
- [ ] Deny by default — absence of a policy denies
- [ ] No authorisation logic bypassable by a direct service call

**Consent and provenance**
- [ ] Personal data access requires a `ConsentedContext`
- [ ] Assertions carry a complete provenance chain
- [ ] Revocation propagates to anything this change adds
- [ ] Community restrictions honoured, including above administrator roles

**Data**
- [ ] Tenant isolation enforced (RLS **and** repository filter)
- [ ] Sensitivity classification propagated, never silently downgraded
- [ ] Data minimisation — is every field stored actually needed?
- [ ] Encryption at rest for anything `confidential` or above

**Secrets and logging**
- [ ] No secret in code, config, test fixture or commit history
- [ ] No sensitive data in logs, traces, metrics or error messages
- [ ] Structured logging uses the field allowlist

**Failure**
- [ ] Fails closed, not open
- [ ] Error messages do not leak internal detail to the caller
- [ ] No unbounded resource consumption reachable from a request

**AI paths**
- [ ] Model output parsed against a strict schema, never executed as instruction
- [ ] No tool-calling with side effects in an extraction path
- [ ] Egress policy respected; external calls logged and attributable
- [ ] Prompt injection considered — added to the adversarial corpus if novel

## Dependency review

Every new dependency requires an entry in
[`docs/research/OSS_EVALUATION.md`](../research/OSS_EVALUATION.md).

**Automatic rejection:** licence incompatible with the consuming package · unmaintained (no release
or meaningful commit in 12 months) with no fork plan · single maintainer on a critical path with no
mitigation · requires a phone-home or external service in the default configuration · known
unpatched critical vulnerability.

**Scrutinised:** very new (< 12 months) · very large transitive tree · install scripts · native
code · a maintainer transfer in the last 6 months (a well-known supply chain risk pattern).

## Cadence

| Activity | Frequency |
|---|---|
| Reviewer checklist | Every PR |
| Security Lead review | Per trigger table |
| Dependency scan | Every PR, plus daily on `main` |
| Secret scan | Every push, plus full history weekly |
| Static analysis (CodeQL) | Every PR, plus weekly deep scan |
| Container scan | Every image build |
| Security review meeting | Monthly |
| Threat model refresh | Per architectural change, minimum annually |
| Penetration test | Annually, and before v1.0 (Phase 7) |
| Access review | Quarterly — who has merge, secret and signing authority |

## Handling a finding

| Severity | Response |
|---|---|
| **Critical** | Fix within 7 days. Private branch, coordinated disclosure, advisory, backport to all LTS |
| **High** | 30 days |
| **Medium** | 90 days |
| **Low** | Next scheduled release |

Findings in code not yet released are fixed on the branch, publicly, without an advisory.

Findings in released code follow the coordinated disclosure process in
[`SECURITY.md`](../../SECURITY.md), including private notification to known operators before
publication — many run air-gapped and cannot pull a patch automatically.

## Exceptions

An exception to a security control requires: written justification, the compensating control, an
expiry date, and **Security Lead plus CTO** approval. Recorded in
[`TECH_DEBT.md`](TECH_DEBT.md) with an owner.

**No exception is open-ended.** An exception without an expiry date is a permanent weakening
disguised as a temporary one, and we do not grant them.
