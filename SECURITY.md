# Security Policy

Witness is designed to be deployed by governments, Indigenous organisations and civil society
groups, and to hold some of the most sensitive material those institutions produce: community
testimony, in-camera deliberation, land negotiations, personal statements given in confidence.

A vulnerability in Witness is not an inconvenience. It is a potential harm to people who trusted
an institution enough to speak.

We treat security reports as a gift.

---

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security vulnerability.**

Report privately via **[GitHub Private Vulnerability Reporting](https://github.com/scigns/witness/security/advisories/new)**
— preferred, as it keeps the whole coordination process in one auditable place.

If you cannot use that, contact the security contacts listed in
[`docs/governance/SECURITY_CONTACTS.md`](docs/governance/SECURITY_CONTACTS.md).

### What to include

| | |
|---|---|
| **Description** | What the issue is |
| **Impact** | What an attacker achieves — be concrete |
| **Reproduction** | Steps, proof of concept, affected version/commit |
| **Environment** | Deployment topology, configuration relevant to the issue |
| **Suggested fix** | If you have one — very welcome, never required |
| **Disclosure preference** | How you would like to be credited, or whether you prefer anonymity |

Reports in any language are acceptable. Partial reports are acceptable — please do not sit on
something because you have not finished analysing it.

### Our commitments to you

| Stage | Commitment |
|---|---|
| **Acknowledgement** | Within **2 working days** |
| **Initial assessment** | Within **5 working days** — severity, whether we can reproduce, likely timeline |
| **Progress updates** | At least every **7 days** until resolution |
| **Fix target** | Critical: 7 days · High: 30 days · Medium: 90 days · Low: next scheduled release |
| **Credit** | Named in the advisory and release notes, unless you prefer otherwise |
| **No legal action** | Against good-faith research under the safe harbour below |

If we disagree with your severity assessment, we will say so and explain why, and you are free to
disagree publicly after the disclosure window.

## Safe harbour

We will not pursue or support legal action against research conducted in good faith that:

- **Respects privacy** — no accessing, modifying, exfiltrating or retaining data belonging to
  others; use your own test instance wherever possible
- **Avoids harm** — no degradation of service, no destruction of data, no social engineering of
  users, operators or staff, no physical intrusion
- **Reports promptly and privately**, and gives us a reasonable window to remediate
- **Stops at proof** — demonstrate the vulnerability, do not exploit it further

This safe harbour covers *our* code and *our* infrastructure. It cannot cover deployments run by
third parties — if you find a vulnerability in a government's Witness instance, report it to us
and to them; do not test against a live institutional deployment without written authorisation.

## Disclosure policy

Coordinated disclosure with a **90-day default window**, negotiable in both directions:

1. You report privately.
2. We confirm, assess and assign severity (CVSS v4.0).
3. We develop and test a fix, and prepare an advisory.
4. We notify known operators privately ahead of publication where the risk warrants it — many
   Witness deployments are air-gapped and cannot pull a patch automatically.
5. We publish a GitHub Security Advisory, request a CVE where appropriate, and release the fix.
6. We credit you.

We will publish even when it is embarrassing. Operators of public infrastructure need accurate
information more than we need to look competent.

## Supported versions

| Version | Supported |
|---|---|
| Pre-1.0 (current) | Latest `main` only — Witness is pre-implementation; see [`STATUS.md`](STATUS.md) |

From v1.0 the policy becomes: **current minor**, plus the **most recent LTS** for 24 months. Public
institutions cannot upgrade on a quarterly cadence, and a security policy that ignores that is a
security policy that gets ignored.

## Scope

**In scope:** all code in this repository; default and documented configurations; container images
and Helm charts we publish; the SDKs; CI/CD supply chain (workflows, signing, release artefacts);
documentation that would cause an insecure deployment if followed.

**In scope and especially wanted:**
- **Consent bypass** — any path that processes data without a valid consent grant
- **Provenance forgery** — creating a graph assertion without a valid traceable chain
- **Tenant or workspace isolation escape**
- **Authorisation bypass** in Casbin policy or the policy decision point
- **Data egress in the sovereign default configuration** — any unexpected outbound connection
- **Redaction or deletion failure** — data surviving a revocation or erasure request in any
  projection, index, cache, embedding, backup or log
- **Prompt injection** leading to privilege escalation, data exfiltration, or forged assertions
- **Model supply chain** — tampering with model weights or the extraction pipeline

**Out of scope:** vulnerabilities in third-party dependencies (report upstream, then tell us);
issues requiring physical access or a compromised admin account; missing hardening headers with no
demonstrated impact; automated scanner output without a working proof of concept; social
engineering; denial of service by resource exhaustion of a self-hosted instance the reporter
controls; deployments misconfigured contrary to our documentation (though we want to hear if our
docs made it easy to misconfigure — that *is* in scope).

## Security architecture

The security model, trust boundaries, threat model and control set are documented in
[`architecture/SECURITY_ARCHITECTURE.md`](architecture/SECURITY_ARCHITECTURE.md). Our security
review process for changes is in
[`docs/engineering/SECURITY_REVIEW.md`](docs/engineering/SECURITY_REVIEW.md).

Highlights an assessor will care about:

- **Deny by default.** Authorisation is enforced at a central policy decision point; absence of a
  policy is a denial, not an allowance.
- **Consent gate.** No processing path exists that can reach personal data without a consent
  check — enforced structurally, and tested adversarially.
- **No default egress.** The sovereign deployment profile makes zero external network calls. This
  is verified in CI by an egress-denying test environment.
- **Tamper-evident audit.** Hash-chained append-only audit log with a shipped verification tool.
- **Supply chain.** SBOM per release, signed artefacts, provenance attestation, pinned actions,
  reproducible builds as a Phase 7 target.
- **Secrets.** Never in the repository. Scanned on every push and on history.

## For operators

If you run Witness:

- Subscribe to security advisories: watch this repository → Custom → Security alerts.
- Read [`docs/operations/SECURITY_HARDENING.md`](docs/operations/SECURITY_HARDENING.md) before
  going to production.
- Air-gapped operators: see the offline advisory distribution process in
  [`docs/operations/ADMIN_GUIDE.md`](docs/operations/ADMIN_GUIDE.md).
- You are responsible for the security of your deployment, your infrastructure and your
  configuration. We are responsible for giving you software and documentation that make the secure
  path the easy path — hold us to that.

## Bug bounty

We do not currently operate a paid bounty programme; the project is not yet funded for one. This
is a resourcing limitation, not a statement about the value of your work. Establishing one is on
the roadmap once foundation funding is in place, and we will honour reports made before then when
it launches.

We do offer credit, a public advisory, and our genuine thanks.
