# Governance

**Status:** Founding structure (Stage 1 of 3)
**Owner:** Founder & Steering Committee
**Review:** Annually, and at each governance stage transition

---

## Governing principle

Witness aims to become critical public digital infrastructure. Infrastructure that depends on a
single company, a single funder or a single person is not infrastructure — it is a dependency
waiting to fail.

Therefore the explicit goal of Witness governance is **to make its founders replaceable as quickly
as responsibly possible.** Every governance decision below is judged against one question:

> *If everyone currently working on Witness disappeared tomorrow, could the institutions depending
> on it carry on?*

Today the honest answer is no. The stages below are the plan to change that.

---

## Governance stages

| Stage | Name | Decision-making | Exit criteria |
|---|---|---|---|
| **1** | **Founding** *(current)* | Founder/CTO holds final technical authority; delegated by role charter | ≥ 5 active maintainers from ≥ 2 organisations; 3 reference deployments |
| **2** | **Meritocratic** | Technical Steering Committee elected by maintainers; founder holds a normal seat | Foundation host agreed; ≥ 3 organisations with merge authority; sustainable funding |
| **3** | **Foundation-stewarded** | Neutral foundation holds trademark and infrastructure; TSC governs technically | Terminal state |

We are in **Stage 1** and we are not pretending otherwise. Stage 1 governance is fast and
centralised because a five-person project pretending to be a foundation is theatre that slows down
the work. What Stage 1 owes the future is: everything written down, every decision recorded, no
private knowledge, no unrecorded authority.

---

## Roles and bodies

### Steering Committee (Stage 1)

**Composition:** Founder, CTO, Product Director, Governance Lead, plus at least one **external
member representing user institutions** — with a standing commitment that Indigenous data
governance expertise is represented, compensated, and not a volunteer favour.

**Responsibilities:** mission and scope · annual roadmap approval · governance changes · licensing
changes · foundation transition · Code of Conduct appeals · conflict resolution between leads.

**Cadence:** quarterly, plus on demand. **Minutes are public** unless they concern an individual.

### Technical Steering Committee (from Stage 2)

Elected by active maintainers, one-year terms, staggered. Maximum two seats per organisation —
a hard cap, to prevent capture by whoever employs the most contributors. Holds final authority on
architecture, ADRs, release content and maintainer appointment.

### Leads

Each domain has a named lead, defined by a charter in [`agents/`](agents/). A lead's charter
states explicitly what they may decide alone, what they must consult on, and what they must
escalate. Leads hold merge authority over their paths via [`.github/CODEOWNERS`](.github/CODEOWNERS).

### Maintainers

Contributors with merge authority in a defined area. Appointed on demonstrated sustained
contribution and, critically, **demonstrated judgement about what not to merge**.

**Path to maintainer:** sustained quality contribution over ≥ 3 months → nomination by an existing
maintainer → lazy consensus among maintainers over 7 days (any objection escalates to the
Steering/Technical Steering Committee) → merge rights granted in their area.

**Maintainers may step down at any time, with thanks and without explanation.** Burnout is a
governance risk, not a personal failing. Inactive for 12 months → moved to emeritus, restorable on
request without re-earning the position.

### Contributors

Anyone who contributes. No permission required to start. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## How decisions are made

### Default: lazy consensus

Most decisions are made by proposing and waiting. Silence is assent. If nobody objects within the
window, it proceeds.

| Decision type | Mechanism | Window | Final authority |
|---|---|---|---|
| Bug fix, docs, tests | Pull request review | — | CODEOWNER |
| Feature within an accepted ADR | Pull request review | — | Domain Lead |
| New architectural decision | **ADR** | 7 days | Principal Architect + CTO |
| Change to principles P1–P8 | ADR + Steering Committee | 14 days | Steering Committee |
| New dependency | OSS evaluation + ADR | 7 days | Domain Lead + Security Lead |
| Security fix | Private, expedited | — | Security Lead (may merge without the usual window) |
| Release content | Release checklist | — | Release Manager |
| Licence change | Steering Committee + copyright holders | 30 days | Unanimous Steering Committee |
| Governance change | Steering Committee | 30 days, public comment | Steering Committee |
| Code of Conduct enforcement | CoC committee | — | CoC committee, appeal to Steering |

### When consensus fails

1. **Restate the disagreement** in writing until both sides agree the statement is fair. This
   resolves a surprising proportion of disputes, which were actually about different premises.
2. **Look for the cheap experiment** that would settle it with evidence.
3. **Escalate to the decision authority** in the table above.
4. **The authority decides, in writing, with reasoning**, recorded in
   [`docs/governance/DECISIONS.md`](docs/governance/DECISIONS.md).
5. **Disagree and commit.** Once decided, we execute as a unit. Anyone may reopen a decision with
   *new evidence*; nobody may reopen it with the same argument at higher volume.

**Vetoes.** The CTO holds a technical veto during Stage 1. The Governance Lead holds an
**absolute veto** on any change that weakens consent, provenance or Indigenous data sovereignty
guarantees — this veto is not overridable by the CTO or Founder, by design, and survives into
Stage 2 as a Technical Steering Committee supermajority requirement. Some things should be hard
to undo.

---

## Merge authority

Authority is defined mechanically in [`.github/CODEOWNERS`](.github/CODEOWNERS) and enforced by
branch protection. Summary:

| Path | Requires |
|---|---|
| `architecture/decisions/**` | Principal Architect **and** CTO |
| `packages/domain/**` | Principal Architect **and** Backend Lead |
| `services/consent/**`, consent logic anywhere | Governance Lead **and** Security Lead |
| Authorisation, cryptography, auth flows | Security Lead |
| `architecture/KNOWLEDGE_GRAPH.md`, ontology | Knowledge Graph Lead **and** Principal Architect |
| `.github/workflows/**` | Infrastructure Lead **and** Security Lead |
| `docs/governance/**` | Governance Lead |
| `LICENSE`, licensing docs | Open Source Lead **and** Steering Committee |
| Release branches, tags | Release Manager |

**No one merges their own pull request**, including the CTO and the Founder. The only exception is
an active production security incident, which requires retrospective review within 48 hours and a
public record.

---

## Funding and independence

Witness must never be economically dependent on a party whose interests conflict with its
principles.

**Acceptable:** public-sector grants · philanthropic funding · development-partner programme
funding · paid support, training, integration and deployment services from any vendor · dedicated
staff time contributed by adopting institutions.

**Unacceptable:** any funding conditioned on closing source, on hosting-only availability, on
weakening the sovereignty default, on data access for the funder, or on preferential feature
control not available to other contributors.

**Transparency:** funding sources above a materiality threshold are disclosed publicly in
[`docs/governance/FUNDING.md`](docs/governance/FUNDING.md), including the conditions attached.
Steering Committee members declare conflicts of interest and recuse themselves accordingly.

**Commercial services are encouraged.** We want a healthy ecosystem of vendors deploying and
supporting Witness — that is how infrastructure becomes sustainable. What we will not do is
privilege one of them, including any organisation the founders are involved in.

---

## Trademark and naming

The Witness name and marks are held by the Founder in Stage 1 and will transfer to the foundation
at Stage 3. Policy: anyone may **use** the software; anyone may say they **support, deploy or are
compatible with** Witness; nobody may imply **official endorsement** or distribute a modified
version under the Witness name without agreement. Full policy:
[`docs/governance/TRADEMARK.md`](docs/governance/TRADEMARK.md).

## Forking

Witness is GPL-3.0. **Anyone may fork it at any time, for any reason, including disagreement with
this governance.** We consider the right to fork a feature and the ultimate check on our
legitimacy — if we govern badly, the correct response is to leave and take the code.

We commit to making forking practical rather than nominal: no hidden build steps, no undocumented
infrastructure, no proprietary components, no secret knowledge. Everything needed to run this
project is in this repository.

## Succession

Every role charter in [`agents/`](agents/) names a deputy. The Steering Committee maintains a
private continuity plan covering credential recovery, domain and package registry control, and
signing key succession, reviewed every six months. **A project where one person's absence stops a
release is not yet infrastructure**, and we track that as a standing risk (R-09) in the
[risk register](docs/governance/RISK_REGISTER.md).

## Amending this document

Changes require a pull request, a 30-day public comment period, and Steering Committee approval.
The amendment history is the file's git history, permanently.
