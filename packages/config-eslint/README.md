# Shared ESLint Configuration

**Owner:** Developer Experience Lead
**Status:** Phase 2

Flat config shared across the workspace, including `eslint-plugin-boundaries`, which enforces the
layering rules from [ADR-0003](../../architecture/decisions/ADR-0003-hexagonal-ddd-clean-architecture.md).

**`packages/domain` may import nothing** but the standard library and other domain code. That is a
hard CI failure, not a convention — which is the only reason it will still hold in 2036.
