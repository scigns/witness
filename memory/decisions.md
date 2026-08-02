# Architecture Decisions

**Owner:** Unassigned — pending reconciliation
**Status:** ⚠️ Under reconciliation — overlaps
[`architecture/decisions/`](../architecture/decisions/)

> **This document and [`architecture/decisions/`](../architecture/decisions/) cover the same
> ground.** Two parallel decision logs. Decisions 001-003 here (modular monolith, JWT,
> PostgreSQL+Prisma) overlap with and partly contradict ADR-0003, ADR-0007 and ADR-0004.
>
> Neither has been changed or removed. Which one is authoritative is a decision for the
> project owner, raised on [PR #1](https://github.com/scigns/witness/pull/1). Until it is
> resolved, treat this file as unreconciled rather than current.

Decision 001

Architecture

Chosen

Modular Monolith

Reason

Simpler deployment while maintaining modularity.

---

Decision 002

Authentication

Chosen

JWT

Reason

Supports mobile and offline workflows.

---

Decision 003

Database

Chosen

PostgreSQL + Prisma

Reason

Scalable and type-safe.
