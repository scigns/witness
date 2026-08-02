# Witness Architecture

**Owner:** Unassigned — pending reconciliation
**Status:** ⚠️ Under reconciliation — overlaps
[`architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)

> **This document and [`architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) cover the
> same ground.** These describe **different systems**. This one specifies a modular monolith with
> JWT auth, OpenAI, Cloudflare and Azure. `architecture/ARCHITECTURE.md` and ADR-0003/0007/0009/0013
> specify bounded-context services, Keycloak with Casbin, local-first inference and a sovereign
> self-hosted default.
>
> Neither has been changed or removed. Which one is authoritative is a decision for the
> project owner, raised on [PR #1](https://github.com/scigns/witness/pull/1). Until it is
> resolved, treat this file as unreconciled rather than current.

Architecture Style

- Modular Monolith
- Domain Driven Design
- Event Driven
- API First

Technology

Frontend

- Next.js
- React
- Tailwind
- TypeScript

Backend

- Node
- Prisma
- PostgreSQL

Authentication

- JWT
- Refresh Tokens
- RBAC

Infrastructure

- Docker
- GitHub Actions
- Cloudflare
- Azure

AI

- OpenAI
- Ollama
- pgvector
- RAG

Principles

Every module must be

- independently testable
- loosely coupled
- highly cohesive
