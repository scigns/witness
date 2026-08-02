# Witness Engineering Operating System

> **⚠️ This document describes a repository layout that does not exist.**
>
> It instructs agents to read `engineering/vision/`, `engineering/architecture/`,
> `engineering/standards/`, `engineering/memory/` and `engineering/tasks/`, and to update
> `memory/completed-features.md` and `memory/architecture-log.md`. **None of those paths exist**,
> in this repository or any branch of it. An agent following this literally fails at step one.
>
> The canonical engineering operating model is
> [`docs/engineering/`](../docs/engineering/) — start with
> [`AGENT_HANDOFF_PROTOCOL.md`](../docs/engineering/AGENT_HANDOFF_PROTOCOL.md), whose precedence
> order in section 2 expresses the same intent as the priority list below, against paths that are
> real.
>
> This file has been **retained, not deleted**. Whether to build the layout it proposes, rewrite it
> to point at the actual paths, or deprecate it is decision **D-8** in
> [`docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md`](../docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md),
> and it belongs to the CTO.

This repository is the single source of truth.

No AI agent may make assumptions.

If information is missing,
the AI must search the repository before asking questions.

Priority Order

1 Vision
2 Architecture
3 Standards
4 Decisions
5 Tasks

Never violate a higher priority document.

Workflow

Read:

engineering/vision/

engineering/architecture/

engineering/standards/

engineering/memory/

engineering/tasks/

before making changes.

Every completed task must update

memory/completed-features.md

memory/architecture-log.md

if architecture changed.

Never duplicate logic.

Never rewrite completed modules unless instructed.
