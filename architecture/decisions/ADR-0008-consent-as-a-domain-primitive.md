# ADR-0008: Consent as a domain primitive

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Governance Lead, Principal Architect, Security Lead, CTO |
| **Related** | ADR-0019 (Indigenous data sovereignty), ADR-0012 (provenance) |
| **Principles engaged** | **P2 (consent is a domain primitive)** — this ADR *is* P2 |

## Context

Witness records people speaking, often about things that matter to them, sometimes in circumstances
where they have limited power relative to the institution recording them. The lawful and ethical
basis for processing that material is the foundation the entire product rests on. If it fails, we
have built a surveillance tool.

Most systems treat consent as a boolean on a user record, checked in a few places. That approach
fails here for reasons that are structural rather than incidental:

1. **Consent is scoped.** Someone may consent to their words informing internal policy analysis but
   not to publication. One flag cannot express that.
2. **Consent is revocable, with propagation obligations.** Revocation must reach the transcript, the
   extracted assertions, the graph, three indexes, the embeddings, the caches and the backups.
3. **Consent is often collective.** Indigenous and community knowledge is frequently governed by
   community authority, not individual choice. An individual-only model is not merely incomplete —
   it is a governance failure (ADR-0019).
4. **Consent is given by people who are not users.** Most people recorded in a consultation will
   never log in. Their rights must work anyway.
5. **A check that must be remembered will eventually be forgotten.** With forty call sites, one will
   miss it, and that one is a privacy incident.

## Decision

> We will model consent as a first-class domain aggregate with its own service, lifecycle and
> events, and enforce it at a **policy decision point that cannot be bypassed by construction** —
> not by developer discipline.

Three mechanisms together:

1. **Domain type.** A `ConsentedContext` value object cannot be constructed without a valid consent
   decision. Repository methods that return personal data **require** one as a parameter. Omitting
   the check is a type error, caught by the compiler.
2. **Processing gate.** The transcription worker subscribes to `capture.session.consent_cleared.v1`,
   not to `capture.media.ingested.v1`. Media without cleared consent is stored encrypted and never
   enters the pipeline. The gate is in the topology, not in a conditional.
3. **Revocation propagation.** `consent.grant.revoked.v1` fans out to every data-holding service with
   a **5-minute SLO**, followed by a verification pass that scans every store and fails loudly if
   anything remains.

The consent gate sits **in front of** authorisation, not beside it. Authorisation asks "is this user
permitted?" The consent gate asks "is this processing lawful at all?" A user holding every role in
the system still cannot read data whose grant has been revoked.

## Options considered

### Option A — Boolean flag on session or subject
**Pros:** trivial.
**Cons:** cannot express scope, purpose, expiry, delegation or partial revocation; nothing prevents a
code path from skipping it. Rejected.

### Option B — Consent service with checks called by each service
**Pros:** centralised policy; scoped and revocable.
**Cons:** relies on every service remembering to call it. Better, but it is still discipline, and
discipline fails at 2am in year six under deadline pressure. Rejected as insufficient.

### Option C — Consent as a domain primitive with type-enforced access *(chosen)*
**Pros:** forgetting the check is a compile error; the gate is topological; revocation has a defined,
measured, verified SLO; the model expresses scope, purpose, expiry, delegation and collective
authority.
**Cons:** invasive — it touches every repository signature and every data access path; more verbose
code; a genuine learning curve for contributors.

### Option D — Encrypt per subject, delete the key on revocation (crypto-shredding)
**Pros:** elegant; revocation is instant and provable; solves the backup problem cleanly.
**Cons:** per-subject encryption of overlapping data is intractable when one utterance involves five
speakers with different consent states; key management complexity is severe; and a single lost key is
unrecoverable data loss.
**Partially adopted** — used for `restricted` media objects where the granularity fits, as a
complement rather than a replacement.

## Consequences

### Positive
- **A processing path that bypasses consent cannot be written**, which is a stronger guarantee than
  any amount of review.
- Scope, purpose limitation, expiry and delegation are expressible, so the model fits real
  jurisdictions and real community protocols rather than a simplified fiction.
- Revocation is measurable, monitored and verified rather than assumed.
- The system is defensible to a regulator, an ombudsman and a community council — three audiences
  that will actually ask.

### Negative
- **Significant invasiveness.** Every repository method returning personal data changes signature.
  More parameters, more ceremony, more verbose call sites.
- Performance cost: a policy decision on every data access. Mitigated by caching decisions per
  request, with cache invalidation on revocation events — and cache invalidation on a security
  boundary is a place bugs live.
- Contributors will find this annoying before they find it valuable. Onboarding cost is real.
- Complexity in the reviewer and admin experience: partial consent states produce partially visible
  sessions, which is confusing UX that we must design carefully rather than hide.

### Risks accepted
- **Revocation from backups** cannot be instant. Erasure lists are replayed on restore, documented as
  a mandatory step. A restore performed without replaying the erasure list would resurrect erased
  data — this is the residual risk, it is documented in the operator runbook, and it is verified in
  the quarterly recovery drill.
- Caching a consent decision means a window between revocation and cache expiry. Bounded to the
  cache TTL (60 seconds), well inside the 5-minute SLO, and revocation events invalidate proactively.

## Compliance and enforcement

- `ConsentedContext` cannot be constructed outside the consent module — enforced by module boundary
  lint and a private constructor.
- **Adversarial CI suite** attempts to reach personal data without a consent context, through every
  entry point. These tests failing to fail is itself a build failure.
- A revocation integration test asserts removal from Postgres, Neo4j, OpenSearch, pgvector, Redis and
  object storage within the SLO.
- `consent_revocation_propagation_seconds` is a paging alert above 300 s p99.
- Consent code paths require **Governance Lead and Security Lead** approval via CODEOWNERS.

## Reversal

This is effectively irreversible, and deliberately so. Removing it would mean removing the
foundational guarantee of the product. Any weakening requires Steering Committee approval, and the
Governance Lead holds an **absolute veto** that neither the CTO nor the Founder can override
([`GOVERNANCE.md`](../../GOVERNANCE.md)).

## References

- [`docs/governance/CONSENT_FRAMEWORK.md`](../../docs/governance/CONSENT_FRAMEWORK.md)
- [W3C ODRL](https://www.w3.org/TR/odrl-model/) — machine-readable consent expression
- GDPR Arts. 4(11), 7, 17; and the recognition that GDPR is one framework among many, not the model
