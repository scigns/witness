# API Gateway

**Owner:** Backend Lead
**Status:** Phase 3

Edge service: GraphQL backend-for-frontend plus the versioned REST API.

**REST is the stable public contract** (`/api/v1`); **GraphQL is a BFF** and evolves with our own
applications ([ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md)).

Every endpoint declares its authorisation requirement — one without it fails a fitness test.
