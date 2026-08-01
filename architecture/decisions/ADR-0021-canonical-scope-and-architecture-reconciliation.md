# ADR-0021: Reconcile the canonical product scope and architecture

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-08-01 |
| **Deciders** | Founder, CTO, Principal Architect |
| **Consulted** | Product Director, Governance Lead, Security Lead |
| **Informed** | All contributors, all engineering departments |
| **Supersedes** | none — supersedes *documents*, not decisions |
| **Related** | ADR-0002, ADR-0003, ADR-0004, ADR-0007, ADR-0009, ADR-0013, D-6 |
| **Principles engaged** | P1 (sovereignty), P6 (decades not quarters), P7 (boring technology) |

## Context

Between the creation of the architecture branch and this decision, `main` independently acquired a
second set of foundational documents: `docs/vision.md`, `docs/architecture.md`,
`docs/coding-standards.md`, `memory/decisions.md` and `memory/changelog.md`.

This was not noticed immediately because neither branch touched the other's files. It surfaced only
when GitHub linted the *merge* commit and a documentation gate failed on a file the branch had never
edited. The lint failure was trivial. What it exposed was not.

The two sets do not merely differ in wording. They describe **two different products built on two
different architectures**, and both were sitting in the repository presented as current:

**Product scope.** `VISION.md` scopes Witness to institutional memory created from conversations:
recording, transcription, extraction of candidate assertions, human confirmation, and a provenance
chain from every graph node back to a source utterance. `docs/vision.md` scopes it to a Pacific
community-knowledge platform spanning disaster response, health, agriculture, education and
environmental monitoring, and adds **geospatial intelligence** as a first-class capability.

The difference is load-bearing rather than cosmetic. `architecture/DATA_MODEL.md`,
`architecture/KNOWLEDGE_GRAPH.md` (thirteen entity types), `architecture/EVENT_CATALOGUE.md` and
ADR-0010, ADR-0011, ADR-0012 and ADR-0018 are all derived from the conversation-centric scope.
Geospatial intelligence has no entity type, no domain event, no store in ADR-0004 and no ADR of its
own. Adopting the broader scope would invalidate the ontology and the Phase 4–5 plan.

**Architecture.** `docs/architecture.md` and `memory/decisions.md` specify a modular monolith with
JWT authentication, **OpenAI** for inference and **Cloudflare and Azure** for infrastructure. The
accepted ADR set specifies bounded-context services with hexagonal internals (ADR-0003), Keycloak
federating to institutional identity with Casbin as a single policy decision point (ADR-0007),
local-first inference behind `LanguageModelPort` with a sovereign profile that refuses to start when
an external provider is configured (ADR-0009), and single-tenant sovereign self-hosting as the
default topology (ADR-0013).

The OpenAI and Cloudflare/Azure entries are not a stylistic difference. They contradict principle
**P1** directly, and they contradict the `VISION.md` anti-goal *"we will not ship a default
configuration that sends institutional data to a third-party model provider."*

**Fictional history.** `memory/changelog.md` recorded, across two sprints, that an authentication
module, a user module, RBAC, AI services and notifications had been built. **None of this existed.**
The repository contained no application source whatsoever. For a project that instructs AI agents to
read repository context before acting (`.ai/context/QUICK_CONTEXT.md`), a fabricated implementation
history is the most dangerous file that can exist in the tree: an agent reading it would conclude
that authentication was already solved and build on top of nothing.

A contributor arriving at this repository could not answer "how does Witness authenticate?" without
picking one of two contradictory answers at random. That is the condition this ADR ends.

## Decision

> We will treat **`VISION.md` as the canonical product definition** and the **accepted ADR set
> (ADR-0000 to ADR-0020) as the canonical architecture**. The five overlapping documents introduced
> from `main` are superseded. Their genuinely useful forward-looking material is preserved as
> explicitly non-canonical contextual material; their contradictory material is recorded here and
> removed from the tree.

Concretely:

| Document | Disposition | Rationale |
|---|---|---|
| `docs/vision.md` | **Superseded** by `VISION.md`. Sector material preserved in `docs/product/SECTOR_APPLICATIONS.md`, explicitly marked non-canonical | Two product definitions cannot both be current |
| `docs/architecture.md` | **Superseded** by `architecture/ARCHITECTURE.md` and the ADR set | Contradicts P1 via OpenAI and Cloudflare/Azure |
| `memory/decisions.md` | **Superseded** by `architecture/decisions/` | A second decision log defeats the purpose of having one |
| `memory/changelog.md` | **Removed** | Fictional implementation history; actively hazardous |
| `docs/coding-standards.md` | **Superseded** by `docs/engineering/CODING_STANDARDS.md` | Compatible but redundant; the other is the enforced ruleset |

No ADR is edited, weakened or replaced by this decision. ADR-0003, ADR-0004, ADR-0007, ADR-0009 and
ADR-0013 remain in force exactly as written.

**What is preserved.** The superseded documents' substantive content is recorded verbatim in the
appendix below, so that this ADR is a complete record and no reader needs to excavate git history to
learn what was considered.

## Options considered

### Option A — Adopt `VISION.md` and the ADR set as canonical *(chosen)*

**Description.** The branch's document set becomes authoritative. The `main` documents are
superseded, with compatible material preserved as contextual.

**Pros:** the ADR set records *why* each choice was made, with options considered and costs stated;
the `main` documents record only *what*, with one-line rationales. Preserves P1, which the broader
set violates in two places. Keeps the ontology, event catalogue and Phase 4–5 plan coherent. The
architecture documents are already consistent with each other across twenty-one decisions.

**Cons:** discards a genuinely broader and in some ways more ambitious product vision. If the Pacific
multi-sector framing reflects real stakeholder commitments that the CTO is unaware of, this is the
wrong call and it will need to be revisited under governance.

**Why we chose it:** a decision record with reasoning survives contact with a new team; a bullet list
does not. And of the two, only one is compatible with the principle that the project describes as
non-negotiable.

### Option B — Adopt the `main` documents as canonical

**Description.** The broader Pacific/multi-sector DPI scope becomes the product; the ADRs are
revisited against it.

**Pros:** larger addressable problem; the disaster-response and humanitarian-coordination framing is
closer to how funders describe digital public infrastructure, which has real consequences for
grant-funded work.

**Cons:** requires superseding ADR-0007, ADR-0009 and ADR-0013 (OpenAI and cloud hosting cannot
coexist with P1 as written), reworking the thirteen-type ontology to accommodate geospatial
entities, and re-deriving the event catalogue. It would also mean accepting a default configuration
that sends institutional deliberation to a third-party provider, which `VISION.md` lists as an
anti-goal and P1 forbids.

**Why we did not choose it:** the cost is not the rework. It is that the sovereignty guarantee is the
project's central claim, and this option trades it for scope. A reasonable person could still choose
this if the funding reality demanded it — which is why it is recorded here rather than dismissed, and
why the reversal conditions below are explicit.

### Option C — Keep both, with distinct declared roles

**Description.** `docs/` becomes a public-facing summary layer; `architecture/` remains normative.

**Pros:** nothing is lost; the shorter documents are genuinely more readable for a non-technical
audience.

**Cons:** does not actually resolve the contradiction — a public-facing summary that says "OpenAI"
while the normative architecture says "local inference only" is worse than either alone, because it
is the summary that gets read. Two documents that must be kept in sync will drift; this repository
has already demonstrated exactly that failure mode within a single week.

**Why we did not choose it:** it defers the decision while appearing to make one.

## Consequences

### Positive

- The repository has exactly one answer to "what is Witness and how is it built."
- P1 is no longer contradicted by a document sitting in the default branch.
- The fabricated implementation history is gone, so no agent or contributor can build on it.
- Phase 1 deliverables 1.1–1.5, which were blocked pending this decision, are unblocked.
- The precedent is set that reconciliation happens through a decision record, not a silent edit.

### Negative

- **A real product option is foreclosed.** The multi-sector Pacific framing is not obviously wrong,
  and this ADR narrows the project to one sector without stakeholder input, because none was
  available at the time of writing. If that framing came from a funder conversation or a partner
  commitment, this ADR is a mistake and should be superseded rather than worked around.
- Contributors who wrote the superseded documents will find their work marked superseded, which is
  demoralising regardless of how carefully the ADR is worded.
- `docs/product/SECTOR_APPLICATIONS.md` is a document with no phase, no owner-driven deliverable and
  no gate. Documents in that state rot. It carries a review date for exactly this reason.
- Deleting `memory/` removes two files that a future reader might have wanted to inspect in place.
  They are recoverable from git history and reproduced in the appendix, but that is friction.

### Neutral

- Repository file count drops by five; the `memory/` directory ceases to exist.
- `docs/coding-standards.md` and `docs/engineering/CODING_STANDARDS.md` were largely compatible, so
  removing one changes no actual engineering rule.

### Risks accepted

- **Risk:** the broader scope reflected a real commitment that this ADR breaks.
  **Signal it went wrong:** a stakeholder, funder or partner refers to geospatial, disaster-response
  or health capability as in-scope for v1.0.
  **Response:** supersede this ADR. Do not quietly widen scope in implementation.
- **Risk:** `SECTOR_APPLICATIONS.md` becomes a shadow roadmap that teams build toward.
  **Signal:** any PR references it as justification for a feature.
  **Response:** the reference is grounds for rejection; scope changes go through `ROADMAP.md`.

## Compliance and enforcement

- `scripts/ci/check-links.sh` fails if any document still links to a superseded path.
- `scripts/ci/check-doc-headers.sh` requires `docs/product/SECTOR_APPLICATIONS.md` to declare an
  owner and status, so it cannot become orphaned silently.
- `scripts/ci/check-adrs.sh` requires this ADR to appear in the index.
- Enforcement of the *scope* boundary is **review discipline, not automation** — no CI gate can
  detect a feature that is out of product scope. This is stated honestly rather than claimed.

## Reversal

Superseding this ADR costs roughly a week: rewrite `VISION.md`, extend the ontology with geospatial
entity types, add the corresponding domain events, and supersede ADR-0007, ADR-0009 and ADR-0013 to
permit third-party inference and cloud hosting. That last part is the expensive one, and not because
of the code — it is the sovereignty claim, which is the reason institutions would adopt Witness at
all.

**Revisit when:** a named institutional stakeholder requires multi-sector scope for a funded
deployment, or the Steering Committee resolves that the Pacific multi-sector framing is the
project's actual mandate.

## Appendix — superseded content, preserved verbatim

Recorded so this ADR is self-contained.

### `docs/architecture.md` (superseded)

```text
Architecture Style: Modular Monolith · Domain Driven Design · Event Driven · API First
Frontend:       Next.js · React · Tailwind · TypeScript
Backend:        Node · Prisma · PostgreSQL
Authentication: JWT · Refresh Tokens · RBAC
Infrastructure: Docker · GitHub Actions · Cloudflare · Azure
AI:             OpenAI · Ollama · pgvector · RAG
Principles:     every module independently testable, loosely coupled, highly cohesive
```

Assessment: the frontend, backend and "modular monolith" entries are broadly compatible with
ADR-0003 (hexagonal architecture is a within-service pattern and does not by itself mandate separate
deployables). **Cloudflare, Azure and OpenAI are not compatible with P1.** JWT is not an alternative
to ADR-0007 — it is an implementation detail *inside* it, and RBAC alone cannot express the
community-level consent that P5 requires.

### `memory/decisions.md` (superseded)

```text
Decision 001 — Architecture:    Modular Monolith.      Reason: simpler deployment while
                                                        maintaining modularity.
Decision 002 — Authentication:  JWT.                    Reason: supports mobile and offline
                                                        workflows.
Decision 003 — Database:        PostgreSQL + Prisma.    Reason: scalable and type-safe.
```

Assessment: Decision 003 is not contradictory, but it is dangerously incomplete — it omits the
rebuildable-projection model of ADR-0004, whose rebuild property is the Phase 4 exit gate.

### `memory/changelog.md` (removed)

```text
Sprint 1 — Created authentication module · Created user module · Added RBAC
Sprint 2 — Added AI services · Added Notifications
```

Assessment: **fictional.** No application source existed in the repository at any point before this
ADR. Recorded here as the reason the file was removed, not as history.

### `docs/vision.md` (superseded)

Mission: a DPI platform helping governments, communities, NGOs, faith organisations and humanitarian
agencies collect, verify, govern and act on trusted community knowledge, combining AI, secure
identity, geospatial intelligence, offline-first technology and human verification.

Long-term goals: trusted evidence platform for the Pacific; support governments during disasters;
enable humanitarian coordination; support education, health, agriculture and environmental
monitoring; become a reusable DPI framework.

Preserved as non-canonical contextual material in
[`docs/product/SECTOR_APPLICATIONS.md`](../../docs/product/SECTOR_APPLICATIONS.md). Its stated
principles — human-first AI, digital public goods, open standards, privacy by design, Indigenous data
sovereignty, offline-first, accessibility, security by default — are **already fully covered** by
P1–P8 and required no preservation.

## References

- [`VISION.md`](../../VISION.md) — canonical product definition
- [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) — principles P1–P8
- [ADR-0009](ADR-0009-ai-abstraction-and-model-sovereignty.md) — why OpenAI-by-default is refused
- [ADR-0013](ADR-0013-tenancy-and-deployment-topology.md) — why sovereign self-hosting is the default
- [`STATUS.md`](../../STATUS.md) — D-6
- PR #1 discussion, where the conflict was first raised
