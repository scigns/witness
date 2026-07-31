# Service Template

**Owner:** Developer Experience Lead
**Status:** Phase 2

Generates a NestJS service with the hexagonal structure: `domain/` → `application/` →
`adapters/{inbound,outbound}/`.

**A generated service passes every CI gate on creation** — correct layering, tests, observability and
a documentation stub. If it does not, that is a bug in the template, not a task for the contributor.

```bash
pnpm gen:service <name>
```
