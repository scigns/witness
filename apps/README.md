# Applications

**Owner:** Frontend Lead
**Status:** Phase 6 deliverable

Deployable, user-facing applications.

| App | Purpose | Status |
|---|---|---|
| `marketing/` | Independent public commercial website | MKT-01A foundation verified; not deployed |
| [`web/`](web/) | The main application — sessions, review queue, search, graph, provenance | Not started |
| [`admin-console/`](admin-console/) | Tenant, consent, retention, model and user administration | Not started |
| [`docs-site/`](docs-site/) | Documentation site, built from `docs/` and shipped in the offline bundle | Not started |

## Rules

- **Performance budget: ≤ 200 KB gzipped initial JavaScript.** Enforced in CI. It protects users on
  the
  worst connections, and trading it away helps precisely the people who need help least ([ADR-0020](../architecture/decisions/ADR-0020-offline-first-and-low-connectivity.md)).
- **WCAG 2.2 AA is a merge gate**, per component, not a milestone.
- **No hard-coded user-facing strings.** ICU message format throughout.
- Applications import from `packages/` and `sdk/` — **never** from `services/` or `workers/`.
- The client is not a trust boundary. No business logic here.
