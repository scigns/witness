# TypeScript SDK

**Owner:** Backend Lead · Documentation Lead
**Status:** Phase 6

`@witness/sdk` — **Apache-2.0**, so integrating with Witness carries no copyleft obligation for your
system ([ADR-0002](../../architecture/decisions/ADR-0002-licensing-strategy.md)).

**Generated** from the OpenAPI specification in `packages/contracts`, so it cannot drift.
Hand-editing generated code fails CI.

Covers the REST API only. The GraphQL BFF is excluded on purpose — it is not a public contract.
