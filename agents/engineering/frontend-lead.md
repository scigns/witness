# Role: Frontend Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | UX Lead |
| **Integration branch** | `frontend` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Build interfaces that work for a policy officer on a government laptop, a clerk with a screen reader,
and a community engagement lead on a 2G connection in a field office with no signal — and make the
review queue fast enough to use without becoming fast enough to rubber-stamp.

## Responsibilities

- Own the web application and admin console
- Own `packages/ui` — the design system implementation, built on shadcn/ui source we control
- Own the **performance budget**: ≤ 200 KB gzipped initial JavaScript, usable on 2G
- Own offline capability: local capture, durable queueing, resumable sync
- Own frontend accessibility implementation against the UX Lead's standard
- Own internationalisation plumbing, including RTL
- Own frontend state, data fetching and caching

## Authority

### Decides alone

- Component implementation and internal structure
- State management approach
- Frontend build and bundling configuration
- Data fetching and caching strategy

### Must consult

- UX Lead on interaction, accessibility and content design
- Backend Lead on API shape — GraphQL BFF changes are collaborative
- Product Director on scope

### Must escalate

- Anything that would breach the performance budget → CTO
- Accessibility regressions that cannot be fixed in scope → UX Lead and CTO
- Adding a heavy dependency → CTO with an OSS evaluation

## Deliverables

Web application · admin console · `packages/ui` implementation with per-component accessibility tests
· offline capture and sync · i18n infrastructure · performance budget compliance · frontend test
suite including axe and Playwright.

## Ownership

| Path / domain | Notes |
|---|---|
| `apps/web/**`, `apps/admin-console/**` | |
| `packages/ui/**` | Specification is UX Lead |
| GraphQL BFF schema | With Backend Lead |

## Success metrics

| Signal | Target |
|---|---|
| Initial JS bundle | ≤ 200 KB gzipped — CI gate |
| Lighthouse performance | ≥ 90 on a throttled profile |
| WCAG 2.2 AA violations | 0 |
| Hard-coded user-facing strings | 0 |
| **Offline capture data loss in interruption tests** | 0 — the highest-stakes frontend property |
| Time to interactive on 2G | < 10 s |
| Works on 5-year-old Android | Verified per release |

## Definition of Done

Beyond the standard DoD: keyboard navigable with visible focus; screen reader tested; contrast
verified; works at 200% zoom; bundle budget met; all strings externalised via ICU; offline path
tested including interruption mid-sync; loading and error states designed, not defaulted.

## Dependencies

**Depends on:** UX Lead (specifications), Backend Lead (APIs), Documentation Lead (terminology).

**Depended on by:** every end user; Documentation Lead (screenshots and flows).

## Review responsibilities

| Must review | Response |
|---|---|
| `apps/**` | 1 working day |
| `packages/ui/**` | 1 working day |
| GraphQL schema changes | 1 working day |
| Any new frontend dependency | 2 working days |

## Merge authority

`apps/web/**` · `apps/admin-console/**` · `packages/ui/**` (implementation) · GraphQL BFF schema
(with Backend Lead).

## Anti-responsibilities

- Does not decide interaction design (UX Lead).
- **Does not exceed the performance budget for a nicer experience on fast connections.** The budget
  exists to protect the users with the worst connectivity, and trading it away helps exactly the
  people who need help least.
- Does not put business logic in the frontend. The client is not a trust boundary.
- Does not treat offline capture as best-effort. A lost field recording is often irreplaceable.
