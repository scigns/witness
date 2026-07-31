# Templates

**Owner:** Developer Experience Lead
**Status:** Active

Scaffolding, so the correct path is the easy path.

| Template | Generates | Command |
|---|---|---|
| [`adr/`](adr/) | An Architecture Decision Record | `make adr TITLE="..."` |
| [`rfc/`](rfc/) | An RFC for exploring a problem before a decision exists | manual |
| [`service/`](service/) | A NestJS service with the hexagonal structure | `pnpm gen:service <name>` |
| [`package/`](package/) | A workspace package | `pnpm gen:package <name>` |
| [`runbook/`](runbook/) | An operational runbook | manual |
| [`postmortem/`](postmortem/) | A blameless incident postmortem | manual |

## The principle

**Every standard that depends on someone remembering will eventually be violated.** Templates convert
standards into defaults.

A generated service passes every CI gate on creation — correct layering, tests, observability,
documentation stub. If a template produces something that fails a gate, that is a bug in the template,
not a task for the contributor.
