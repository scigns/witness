# Review Matrix

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`DEPARTMENTS.md`](../DEPARTMENTS.md) (per-department
**Required reviewers**) · [`CODE_REVIEW.md`](../CODE_REVIEW.md)

---

## What this adds

`DEPARTMENTS.md` states required reviewers **per department** (e.g. D4: "every migration → Backend
Lead and Principal Architect"). This matrix organises the same fact **per change type**, because an
agent opening a PR needs to answer "who must review *this*," not "what does my own department
require of others." Where the two disagree, `DEPARTMENTS.md` wins — file it as a defect here.

## Matrix

| Change type | Primary review | Secondary / conditional review |
|---|---|---|
| Architecture (ADRs, `architecture/`) | Architecture (D2) | The affected department |
| Database / schema | Data Engineering (D4) | Architecture (D2); Security + Governance if consent, provenance or audit is touched |
| Application code (`services/`, `apps/`) | Application Engineering (D3) | QA (D9), mandatory |
| Authentication / authorisation | Security Lead (D6), mandatory, non-delegable | Architecture (D2); QA (D9) adversarial review |
| AI / retrieval / extraction | AI & Knowledge Engineering (D5) | Security (D6) on egress; QA (D9); Governance (D1) where data governance applies |
| Infrastructure (`infrastructure/`, CI/CD) | DevOps, Platform & SRE (D7) | Security (D6) |
| UX / accessibility (`packages/ui`, `apps/web/src/components`) | UX & Accessibility (D8) | QA (D9); Documentation (D10) if user-facing docs change |
| Governance / consent / sovereignty | Product & Governance (D1) | Security, Privacy & Sovereignty (D6); external review where `ADR-0019` or the consent framework require it |
| Documentation-only (this session's pattern: `docs/`, `architecture/*.md` without a schema/code change) | The owning department per `DEPARTMENTS.md` **Owns** | Documentation Lead (D10) — staleness authority |

## The rule beneath the table

**No implementation agent may satisfy its own required independent review.** An agent acting under
D2's authority to write a C4 view still needs a second reviewer for that PR — the department that
*wrote* the artefact is never sufficient on its own for anything above "documentation-only," and
even documentation-only work needs D10 as a second set of eyes per
[`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) §9's staleness-blocking authority.

This is why Wave 1 ([`05-DELIVERY_WAVES.md`](05-DELIVERY_WAVES.md)) names Documentation Lead (D10)
as a required reviewer on both its work packages, in addition to each package's owning department.
