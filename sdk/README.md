# SDKs

**Owner:** Backend Lead & Documentation Lead
**Status:** Phase 6 deliverable
**Licence:** **Apache-2.0** — deliberately permissive so integrating with Witness carries no copyleft
obligation for your system ([ADR-0002](../architecture/decisions/ADR-0002-licensing-strategy.md))

| SDK | Package | Language |
|---|---|---|
| [`typescript/`](typescript/) | `@witness/sdk` (npm) | TypeScript |
| [`python/`](python/) | `witness-sdk` (PyPI) | Python 3.11+ |

## Generated, not hand-written

Both SDKs are generated from the OpenAPI specification in `packages/contracts`, so they cannot drift
from the API. **Hand-editing generated code fails CI.**

## What they cover

The **REST API only** — the stable, versioned public contract. The GraphQL BFF is excluded on purpose:
it is not a public contract and evolves with our own applications
([ADR-0006](../architecture/decisions/ADR-0006-api-strategy.md)).

## If you build on these

Three obligations, because of what this data is:

1. **Never present a candidate as a fact.** Candidates are model proposals, not institutional record.
2. **Always offer a path to provenance.** A user seeing an assertion must be able to reach the words
   that produced it.
3. **Respect consent.** A revoked grant means the data must disappear from your system too. Do not
   cache past the boundary.

See [`docs/guides/API_GUIDE.md`](../docs/guides/API_GUIDE.md).
