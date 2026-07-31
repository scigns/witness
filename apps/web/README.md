# Web Application

**Owner:** Frontend Lead
**Status:** Phase 6

The main Witness application — sessions, review queue, search, graph exploration, provenance.

Next.js 15, standalone output mode. **No Vercel-only feature is permitted**, verified in CI by
building and running the standalone container.

Budget: **≤ 200 KB gzipped initial JavaScript**, enforced in CI
([ADR-0020](../../architecture/decisions/ADR-0020-offline-first-and-low-connectivity.md)).
