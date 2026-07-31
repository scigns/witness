# Mission

## Mission statement

> **Witness gives public institutions a memory they own — turning the conversations where
> decisions are actually made into structured, consented, provenance-backed institutional
> knowledge that survives staff turnover, elections and decades.**

---

## Mission in one paragraph, for a minister

Every day your officials sit in rooms and make decisions. The reasoning behind those decisions
lives in people's heads and leaves when they do. Witness records those conversations — with
everyone's consent — and turns them into a searchable map of who decided what, on what evidence,
and who promised to do what by when. It runs on your infrastructure, under your control, with
source code you can inspect. When your staff change, your institution's memory does not.

## Mission in one paragraph, for an engineer

Witness ingests audio and documents, transcribes and diarises them locally, extracts candidate
entities and relationships with LLMs under a strict human-in-the-loop review gate, and commits
confirmed assertions to an event-sourced PostgreSQL system of record. From that log it projects a
Neo4j property graph, an OpenSearch index and pgvector embeddings, all rebuildable from scratch.
Everything is behind ports; every projection is disposable; every assertion carries provenance
back to a timestamped utterance and a consent grant. It ships as Docker Compose for a single
institution and Helm for a cluster, air-gapped if required.

## Mission in one paragraph, for a community

If your community takes part in a consultation, Witness records what you actually said — not a
summary written later by someone who was not listening. You can see what was recorded about you,
who can see it, and you can withdraw it. When the government says "we consulted", you can check.
When they make a promise, it is written down with a name and a date attached, and it does not
quietly disappear when the officials change.

---

## Strategic objectives

| # | Objective | Definition of achieved |
|---|---|---|
| **SO-1** | **Prove the pipeline** | Audio → transcript → candidate extraction → human review → graph, working end-to-end on real multi-speaker, multi-accent, code-switched recordings |
| **SO-2** | **Make consent enforceable** | No processing path exists that can bypass the consent policy decision point; revocation demonstrably propagates to every projection within SLA |
| **SO-3** | **Make provenance total** | Every node and edge resolves to a source utterance, model version, and human confirmation. Zero orphan assertions, enforced by invariant tests |
| **SO-4** | **Make sovereignty demonstrable** | Air-gapped install with local models; complete data export in open formats; documented, tested exit path |
| **SO-5** | **Make it operable** | A two-person government IT team can install, back up, upgrade and restore Witness using only the published runbooks |
| **SO-6** | **Make it trustworthy** | Independent security assessment passed; accessibility WCAG 2.2 AA verified; extraction accuracy published, including where it fails |
| **SO-7** | **Make it inheritable** | Foundation governance in place; more than one organisation with merge authority; no single point of human failure |
| **SO-8** | **Make it real** | Three reference deployments in production with real institutional users and published case studies |

## Scope boundaries

**In scope:** capture, transcription, diarisation, extraction, human review, knowledge graph,
search, consent, provenance, redaction, export, integration with existing government systems,
self-hosted deployment, observability, accessibility, multilingual support.

**Out of scope:** see [`PROJECT_CONTEXT.md` §2](PROJECT_CONTEXT.md#2-what-witness-is-not). In
particular: we are not a transcription vendor, not an EDRMS, not a decision engine, and never a
surveillance tool.

## Operating commitments

1. **Open source, always.** GPL-3.0 for the platform; permissive licensing for contracts and SDKs
   so anyone can integrate. No open-core, no proprietary edition. See
   [ADR-0002](architecture/decisions/ADR-0002-licensing-strategy.md).
2. **Sovereign by default.** The default configuration performs no external network egress.
3. **Consent before capture.** The system refuses to process without a recorded lawful basis.
4. **Human before record.** AI output is a candidate until a human confirms it.
5. **Documented before merged.** Undocumented behaviour is unshipped behaviour.
6. **Operable before featured.** Runbook and backup path before the next feature.
7. **Inheritable before fast.** Every decision recorded so successors can revisit it.

---

See also: [`VISION.md`](VISION.md) · [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) · [`ROADMAP.md`](ROADMAP.md)
