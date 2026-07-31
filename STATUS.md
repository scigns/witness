# Status

**Last updated:** 2026-07-31
**Updated by:** CTO
**Update rule:** every pull request that changes the state of a workstream updates this file.
Staleness here is a defect — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Executive summary

Witness is in **Phase 1 (Architecture & Research)**. Phase 0 is complete: the engineering
organisation, governance, decision record and documentation baseline all exist.

**There is no application code, and that is deliberate.** Consent, provenance and tenancy are
cross-cutting invariants; any assertion written before they are enforceable is permanently
untrustworthy. We are not starting the pipeline until the foundations can hold it.

**Overall health:** 🟢 On track
**Biggest current risk:** R-01 — ontology design becoming an unbounded research project. Mitigation
is a hard time-box on ontology v0.1 and a commitment to versioned, evolvable schema rather than a
correct-first-time one. See [`docs/governance/RISK_REGISTER.md`](docs/governance/RISK_REGISTER.md).

---

## Phase status

| Phase | Name | State | Gate met |
|---|---|---|---|
| 0 | Engineering organisation | 🟢 Complete | ✅ |
| 1 | Architecture & research | 🟡 In progress | — |
| 2 | Infrastructure & identity | ⚪ Not started | — |
| 3 | Core backend & data | ⚪ Not started | — |
| 4 | Knowledge graph | ⚪ Not started | — |
| 5 | AI platform & capture | ⚪ Not started | — |
| 6 | Search & experience | ⚪ Not started | — |
| 7 | Hardening | ⚪ Not started | — |
| 8 | v1.0 & reference deployments | ⚪ Not started | — |

Legend: 🟢 complete/healthy · 🟡 in progress · 🔴 blocked · ⚪ not started

---

## Workstream status

| Workstream | Branch | Owner | State | Notes |
|---|---|---|---|---|
| Architecture | `architecture` | Principal Architect | 🟡 | C4 context/container done; component views pending |
| Research | `research` | Research Lead | 🟡 | OSS evaluation complete for core stack; ASR benchmark pending |
| Documentation | `documentation` | Documentation Lead | 🟢 | Baseline complete; docs site not yet built |
| Product | `product` | Product Director | 🟡 | Personas and core journeys defined; PRDs pending |
| UX design | `ux-design` | UX Lead | ⚪ | Blocked on Phase 1 journeys |
| Governance | `governance` | Governance Lead | 🟡 | Consent framework drafted; Indigenous protocols need external review |
| Security | `security` | Security Lead | 🟡 | Threat model started; PIA not begun |
| Infrastructure | `infrastructure` | Infrastructure Lead | ⚪ | Compose stack specified, not built |
| Backend | `backend` | Backend Lead | ⚪ | Awaiting Phase 2 |
| Knowledge graph | `knowledge-graph` | Knowledge Graph Lead | 🟡 | Ontology v0.1 in design |
| AI platform | `ai-platform` | AI Lead | ⚪ | Awaiting Phase 5; model policy drafted |
| Frontend | `frontend` | Frontend Lead | ⚪ | Awaiting Phase 6 |
| Testing | `testing` | QA Lead | ⚪ | Strategy written; harness not built |
| Release | `release` | Release Manager | 🟢 | Strategy and versioning defined |

---

## Phase 1 deliverable tracker

| # | Deliverable | Owner | State |
|---|---|---|---|
| 1.1 | C4 architecture views | Principal Architect | 🟡 Context + container done |
| 1.2 | Domain model & bounded contexts | Principal Architect | 🟡 Draft in `architecture/DATA_MODEL.md` |
| 1.3 | Knowledge graph ontology v0.1 | Knowledge Graph Lead | 🟡 Draft in `architecture/KNOWLEDGE_GRAPH.md` |
| 1.4 | Event catalogue v0.1 | Backend Lead | 🟡 Draft in `architecture/EVENT_CATALOGUE.md` |
| 1.5 | API contract v0.1 | Backend Lead | ⚪ Not started |
| 1.6 | OSS evaluation | Research Lead | 🟢 Complete for core stack |
| 1.7 | Threat model & PIA | Security Lead | 🟡 STRIDE started |
| 1.8 | Consent framework spec | Governance Lead | 🟡 Draft; needs external Indigenous governance review |
| 1.9 | Accessibility & i18n strategy | UX Lead | ⚪ Not started |
| 1.10 | NFRs & SLOs | CTO | ⚪ Not started |

---

## What changed recently

### 2026-07-31 — Foundation established

- Repository scaffolded to the full enterprise structure.
- Complete documentation baseline: context, vision, mission, roadmap, governance, engineering
  operating model, product operating model, all process documents.
- ADRs 0000–0020 drafted; core architectural stance recorded and open to challenge.
- 19 role charters defined in [`agents/`](agents/), with explicit authority boundaries.
- Branch strategy defined for 30 long-lived branches with owners and merge rules.
- CI/CD, security review and AI development workflow established.
- OSS evaluation dossier produced for the full core stack, with an exit strategy per dependency.
- Governance framework: consent, digital sovereignty, Indigenous data sovereignty, risk register.
- CODEOWNERS mapping every path to an owning role; no path is unowned.
- **Executable governance gates** in `scripts/ci` and `scripts/security`, wired into CI: link
  integrity, document ownership, ADR completeness, CODEOWNERS coverage, action pinning, branch
  divergence, licence boundary, and static zero-egress verification. All pass on this commit.

**Known gaps, stated plainly:**

- The *runtime* half of zero-egress verification activates with the Phase 2 stack. Only the static
  half runs today.
- Deployment, admin, user and API guides describe the **target** experience, not a shipped one. They
  are published early so operators can tell us they are wrong before we build them.
- Personas are hypotheses from desk research, not findings from interviews (Phase 1 research).
- ADR-0019 (Indigenous data sovereignty) carries a **hard external review gate** before Phase 4.
  Nothing in that area should be implemented until it is met.

---

## Open decisions needing resolution

| # | Decision | Owner | Needed by | Notes |
|---|---|---|---|---|
| D-1 | Confirm SDK/contracts permissive licensing with copyright holders | Open Source Lead | Phase 2 | ⚠️ **Partially actioned.** Apache-2.0 `LICENSE` and `NOTICE` files placed in `sdk/` and `packages/contracts/` per ADR-0002, while the repository has a single copyright holder and no third-party contributions — the cheapest possible moment to do it. **Formal confirmation by the copyright holder is still outstanding and must happen before those directories accept outside contributions.** Reversing this is trivial today and effectively impossible later |
| D-2 | Event transport: NATS JetStream vs Postgres-only for small deployments | Backend Lead | Phase 3 | ADR-0005 proposes profile-based; needs load evidence |
| D-3 | ASR engine: faster-whisper vs whisper.cpp vs WhisperX composition | AI Lead | Phase 5 | Blocked on benchmark against target languages |
| D-4 | Graph store: confirm Neo4j Community vs Apache AGE for constrained deployments | Knowledge Graph Lead | Phase 4 | Licensing/footprint trade-off, ADR-0004 |
| D-5 | Foundation host for long-term stewardship | Founder | Phase 8 | Candidates under consideration |

---

## What we are deliberately not doing right now

- Writing application code (Phase 2+ gate not met)
- Building a docs website (content first, presentation later)
- Any live-transcription work (deferred, see roadmap)
- Any cloud-hosted multi-tenant offering (contradicts sovereignty default)
