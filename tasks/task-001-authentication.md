# Task 001

Title

Authentication

Goal

Implement secure JWT authentication.

Requirements

- Login
- Logout
- Refresh Token
- Password Hashing

Acceptance Criteria

- Tests pass
- API documented
- No lint errors

Status

**PHASE 2 / GATED / NOT STARTED**

Do not start this task. It is gated for two independent reasons, either of which alone
would be sufficient.

**1. Phase.** Witness is in Phase 1 (Architecture & research). Identity is Phase 2,
roadmap items 2.5 and 2.6, and is additionally blocked on TD-001. See
docs/engineering/PHASE_EXECUTION_PLAN.md.

**2. Architecture.** The requirements above — login, refresh tokens, password hashing —
describe Witness acting as its own identity provider. ADR-0007 considered that and chose
Keycloak federating to whatever identity provider the institution already runs, with
Casbin as a single policy decision point. Asking a ministry that already operates an IdP
to maintain a second set of credentials is the thing that ADR was written to avoid.

Building this as specified therefore requires an ADR superseding ADR-0007, not a task
file. See architecture/decisions/ADR-0007-identity-and-access.md and
docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md section 7.

Ownership is D6 Security, Privacy & Sovereignty — not D3 Application Engineering.
