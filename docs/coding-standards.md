# Coding Standards

**Owner:** Unassigned — pending reconciliation
**Status:** ⚠️ Under reconciliation — overlaps
[`docs/engineering/CODING_STANDARDS.md`](engineering/CODING_STANDARDS.md)

> **This document and [`docs/engineering/CODING_STANDARDS.md`](engineering/CODING_STANDARDS.md)
> cover the same ground.** Largely compatible. This one is the shorter statement of intent; the
> other is the enforced mechanical ruleset.
>
> Neither has been changed or removed. Which one is authoritative is a decision for the
> project owner, raised on [PR #1](https://github.com/scigns/witness/pull/1). Until it is
> resolved, treat this file as unreconciled rather than current.

Always

- TypeScript strict mode
- SOLID principles
- Clean Architecture
- Repository Pattern
- Dependency Injection where appropriate
- No duplicated logic
- Unit tests
- Integration tests

Never

- Hardcode secrets
- Skip validation
- Ignore TypeScript errors
- Leave TODOs
- Create dead code

Every Pull Request must

- Build successfully
- Pass lint
- Pass tests
- Include documentation
