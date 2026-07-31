# Roles

The Witness engineering organisation, as executable specification.

---

## Why these exist

Most projects have implicit roles. Someone becomes "the person who knows the database", authority
accretes without being granted, and when they leave nobody knows what they were deciding or by what
right.

Witness has a ten-year design lifetime. Every person currently working on it will leave. So
authority is **written down, attached to a role rather than a person, and explicit about its
limits**.

Each charter answers, for one role:

| Section | Answers |
|---|---|
| **Mission** | Why this role exists at all |
| **Responsibilities** | What it does |
| **Authority** | What it may decide alone, must consult on, and must escalate |
| **Deliverables** | What it produces |
| **Ownership** | Which paths and which domains |
| **Success metrics** | How we know it is working |
| **Definition of Done** | Additional gates beyond the standard DoD |
| **Dependencies** | Who it needs, and who needs it |
| **Review responsibilities** | What it must review |
| **Merge authority** | What it can approve into the trunk |

The **Authority** section is the one that matters most. Ambiguous authority causes both stalled
decisions and unilateral ones, and it is the failure mode that most reliably poisons an engineering
organisation.

## Roles

### Leadership

| Role | Owns |
|---|---|
| [Founder](leadership/founder.md) | Mission integrity, funding, external relationships, succession |
| [Chief Technology Officer](leadership/cto.md) | Every technical decision; the organisation that makes them |
| [Principal Architect](leadership/principal-architect.md) | System coherence, ADRs, architectural fitness |
| [Engineering Manager](leadership/engineering-manager.md) | Flow of work, contributor health, process |

### Product

| Role | Owns |
|---|---|
| [Product Director](product/product-director.md) | What we build, why, and what we decline |
| [UX Lead](product/ux-lead.md) | Usability, accessibility, design system, content design |
| [Research Lead](product/research-lead.md) | Evidence — user research, OSS evaluation, benchmarks |

### Engineering

| Role | Owns |
|---|---|
| [Backend Lead](engineering/backend-lead.md) | Services, domain layer, data, events, APIs |
| [Frontend Lead](engineering/frontend-lead.md) | Web app, admin console, design system implementation |
| [AI Lead](engineering/ai-lead.md) | Model gateway, transcription, extraction, evaluation |
| [Knowledge Graph Lead](engineering/knowledge-graph-lead.md) | Ontology, projection, entity resolution, provenance |

### Platform

| Role | Owns |
|---|---|
| [Infrastructure Lead](platform/infrastructure-lead.md) | Deployment, operability, observability, CI/CD |
| [Security Lead](platform/security-lead.md) | Threat model, controls, disclosure, incident response |
| [Developer Experience Lead](platform/developer-experience-lead.md) | Toolchain, templates, onboarding, build |

### Quality

| Role | Owns |
|---|---|
| [QA Lead](quality/qa-lead.md) | Test strategy, invariants, adversarial and evaluation testing |
| [Release Manager](quality/release-manager.md) | Releases, versioning, LTS, upgrade and rollback |

### Community & governance

| Role | Owns |
|---|---|
| [Governance Lead](community/governance-lead.md) | Consent, sovereignty, Indigenous data governance — **holds an absolute veto** |
| [Documentation Lead](community/documentation-lead.md) | Documentation quality, accuracy, accessibility |
| [Open Source Lead](community/open-source-lead.md) | Community health, licensing, contributor experience |

## How roles work in practice

**One person may hold several roles.** In Stage 1 governance
([`GOVERNANCE.md`](../GOVERNANCE.md)) this is unavoidable and normal. What is *not* acceptable is a
role held by nobody — an unowned domain is an unowned defect queue.

**Every role names a deputy.** A project where one person's absence stops a release is not yet
infrastructure. Tracked as standing risk R-09.

**Roles are mapped mechanically** to merge authority in [`.github/CODEOWNERS`](../.github/CODEOWNERS)
and to integration branches in
[`docs/engineering/BRANCH_STRATEGY.md`](../docs/engineering/BRANCH_STRATEGY.md). If a charter and
CODEOWNERS disagree, that is a defect in one of them.

**Roles may be held by AI agents** for defined, bounded work — with a named human sponsor
accountable for the output. An agent cannot hold merge authority, cannot approve a pull request, and
cannot be the sole reviewer of security, consent or Indigenous data governance changes. See
[`docs/engineering/AI_GUIDELINES.md`](../docs/engineering/AI_GUIDELINES.md).

## Adding or changing a role

A pull request against this directory, approved by the CTO. Changing the Governance Lead's veto, or
any role's authority over consent, provenance or Indigenous data governance, additionally requires
Steering Committee approval.

Template: [`_template.md`](_template.md).
