Read

agents/backend.md

architecture/ARCHITECTURE.md

docs/engineering/CODING_STANDARDS.md

architecture/decisions/README.md

docs/engineering/AGENT_HANDOFF_PROTOCOL.md

Open the requested task.

Check that the task is not gated. Witness is in Phase 1; a task marked
PHASE 2 / GATED / NOT STARTED is not started, and there is no exception.

Implement only that task.

When finished

- Update task status
- Update CHANGELOG.md
- Update STATUS.md if a workstream changed state
- Explain what changed

If you hit a decision that is not yours to make, write it down and hand it back
rather than choosing a sensible-looking default. See section 13 of the handoff
protocol for what is never decided alone.

Stop.
