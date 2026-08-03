# Technical Debt Register

**Owner:** CTO
**Status:** Active
**Review:** Every release; audited quarterly

---

## What counts as debt

**Debt** is a deliberate shortcut, taken knowingly, with a reason, recorded with an owner and a
review date. It is a legitimate engineering tool.

**Rot** is an accidental shortcut nobody recorded. It is a defect, and it is fixed as one.

The distinction is the record. If you are about to write "we'll clean this up later", either log it
here **in the same pull request** or do not write it.

## Rules

1. Debt is logged **in the pull request that incurs it**, never afterwards.
2. Every entry has an **owner** and a **review date**. Debt without an owner is rot.
3. Each release allocates capacity to debt reduction. If features consistently consume that capacity,
   that is reported to the Steering Committee — it is a strategic signal, not a scheduling detail.
4. **Security exceptions always have an expiry date.** An open-ended exception is a permanent
   weakening disguised as a temporary one, and we do not grant them.
5. Debt that is deliberately accepted permanently is not debt — it is a design decision, and it
   belongs in an ADR.

## Severity

| Level | Meaning | Target |
|---|---|---|
| **S1** | Actively causing defects, security exposure or blocking work | Next release |
| **S2** | Slowing development or increasing risk measurably | Within 2 releases |
| **S3** | Untidy; no measurable impact yet | Opportunistic |
| **S4** | Cosmetic | May never be paid; review annually and close if not worth it |

Closing S4 items as "won't fix" is healthy. A register that only grows is a list of things we are
quietly not doing.

## Register

| ID | Title | Severity | Incurred | Owner | Review by | Rationale | Exit |
|---|---|---|---|---|---|---|---|
| **TD-001** | Dependency review gate is not running — GitHub Dependency graph unavailable on this repository | **S2** | 2026-07-31 (#1) | Security Lead | **2026-10-31** | Platform feature is off; the action hard-failed on every run, turning the whole security workflow permanently red | Enable Dependency graph in repository settings, or make the repository public |
| **TD-002** | Audit hash-chain tail-read race — concurrent appends to the same subject can chain onto the same predecessor | **S2** | 2026-08-03 (#19) | Backend Lead | **2026-10-03** | `appendAuditEvent` reads the current tail inside the caller's transaction under Postgres's default read-committed isolation, which does not itself prevent two concurrent transactions both reading the same tail before either commits | Serialisable isolation or a `SELECT ... FOR UPDATE` on the subject's tail row, scoped to write paths only |
| **TD-003** | Actor-resolution TOCTOU — `resolveActor`'s find-or-create has no unique constraint on `(displayName, kind)` | **S3** | 2026-08-03 (#19) | Backend Lead | **2026-11-03** | Two concurrent first-sign-ins for the same identity (or, still, the same dev-header string) can both miss the `findFirst` and both `create`, producing two `Actor` rows for what should be one identity. Examined at the Milestone 1.3 trigger and deliberately not fixed — see full entry | Unique constraint on `(display_name, kind)` plus an upsert. Must land before Milestone 1.4 (Authorisation hardening) or any external pilot |

### TD-001 — Dependency review gate is not running

**Severity:** S2 · **Incurred:** 2026-07-31 in #1 · **Owner:** Security Lead
**Review by:** 2026-10-31 · **Area:** `.github/workflows/security.yml`

**What was done and why.**
`actions/dependency-review-action` requires GitHub's Dependency graph, which is unavailable on a
private repository without Advanced Security. It therefore hard-failed on every run. Rather than
leave the entire security workflow permanently red — which trains contributors to ignore CI, and is
worse for security than the missing check itself — the job now probes availability first, runs the
gate for real when the feature is present, and emits a loud `::warning::` when it is not.

**Cost of carrying it.**
Supply-chain review of new dependencies is **not happening**. Today that costs nothing because there
are no dependencies and no lockfile. From Phase 2 it is a real gap: a dependency with a known
vulnerability or a denied licence could merge without this gate noticing.

Partial compensating controls remain: `scripts/security/check-licenses.sh` (licence compatibility,
including Redis/RSALv2 by name), Dependabot, secret scanning, GitGuardian and CodeQL all run.

**What it would take to fix.**
A repository setting: *Settings → Code security → Dependency graph → Enable*. On a public repository
it is on by default. Roughly five minutes, and it needs someone with admin rights — which is why this
is tracked rather than fixed in a commit.

**Trigger to fix.**
**Before Phase 2 introduces the first real dependency.** A supply-chain gate that is switched off at
the moment dependencies arrive is worse than one that was never claimed.

### TD-002 — Audit hash-chain tail-read race

**Severity:** S2 · **Incurred:** 2026-08-03 in #19 · **Owner:** Backend Lead
**Review by:** 2026-10-03 · **Area:** `services/api-gateway/src/infrastructure/audit.helper.ts`

**What was done and why.**
`appendAuditEvent` (shared by the users, membership, and role-assignment services) reads a subject's
current tail hash with `findFirst` inside the caller's own transaction, then appends onto it —
exactly the pattern `RecordsService.appendAudit` already used before this capability existed. Postgres's
default read-committed isolation does not itself stop two concurrent transactions against the *same*
subject both reading the same tail before either commits, which would let both compute a hash chained
onto the same predecessor. It was identified during CodeRabbit review of #19, judged pre-existing and
inherited rather than introduced by that PR, and deliberately not fixed inside a single-capability PR
per the instruction not to silently redesign a cross-cutting system in service of one feature.

**Cost of carrying it.**
Real today only under genuine concurrent writes to the *same* subject — a single administrator working
through the UI serially never triggers it. Its blast radius grows every time a new capability starts
writing to the audit trail (four subject types now do, up from one), since more capabilities means
more surface area for two writers to collide on one subject.

**What it would take to fix.**
Serialisable transaction isolation for audit-append transactions specifically (a scoped, not global,
isolation-level change), or a `SELECT ... FOR UPDATE` on the subject's tail row before computing the
next hash. Both are small, contained changes to one shared helper — the reason this is tracked rather
than fixed inline is that it touches every write path that appends audit events at once, which is a
cross-cutting change deserving its own review, not a side effect of a role-assignment PR.

**Trigger to fix.**
Before any capability introduces genuinely concurrent writers to the same subject (e.g. two
facilitators editing the same session simultaneously) — Milestone 2 (Co-design Sessions) is the first
plausible candidate.

### TD-003 — Actor-resolution TOCTOU

**Severity:** S3 · **Incurred:** 2026-08-03 in #19 · **Owner:** Backend Lead
**Review by:** 2026-10-03 · **Area:** `services/api-gateway/src/infrastructure/actor.helper.ts`

**What was done and why.**
`resolveActor` finds-or-creates an `Actor` row by `(displayName, kind)` — a find, then a create if
nothing was found, with no unique database constraint on that pair and no transaction wrapping the
two steps together. Two concurrent requests carrying the same unverified dev-header identity can both
miss the `findFirst` and both proceed to `create`, producing two `Actor` rows for what a human would
consider one identity. Also identified during #19's review, also inherited from the pre-existing
`OrganisationsService`/`WorkspacesService` copies of the same pattern rather than introduced by the
capability that factored it into a shared helper, and deliberately not fixed for the same
single-capability-PR reasoning as TD-002.

**Cost of carrying it.**
Cosmetic today: duplicate `Actor` rows split one identity's provenance history across two ids,
confusing but not incorrect (each row is internally consistent, and the audit chain per subject is
unaffected). Concurrent requests from the *same* dev-header identity are uncommon in the current
single-operator development workflow.

**What it would take to fix.**
A unique constraint on `(display_name, kind)` plus an upsert (`ON CONFLICT DO NOTHING` /
`findFirst`-then-`create`-in-a-transaction), or — more likely to actually happen — resolving actors
through real authenticated identity once Milestone 1.3 (Authentication) lands, which may make the
current find-or-create pattern moot entirely rather than something worth hardening in its current form.

**Trigger to fix.**
Before Milestone 1.3 (Authentication) ships, decide explicitly whether `resolveActor` is fixed as-is
or superseded by identity-backed actor resolution — don't let it survive unexamined into the
authenticated system.

**Examined at the trigger (Milestone 1.3, Authentication PR).** Decision: **not superseded, still
open.** `AuthenticationService` reuses the existing `resolveActor(prisma, principal)` helper
unchanged — for first-sign-in activation, and for the system-principal audit of a denied sign-in —
rather than adding a second, identity-aware resolution path. The race is narrower than before
(the identity side of `(displayName, kind)` is now a stable, provider-verified subject rather than
an arbitrary dev-header string, so collisions require the same *provider identity* signing in
concurrently for the first time, not merely the same typed name), but the underlying find-or-create
without a unique constraint or transaction is unchanged and the race is still reachable. Deferred
again, deliberately, as out of scope for a single-capability PR — the same reasoning as TD-002.
**Owner and review date extended accordingly: Backend Lead, review by 2026-11-03; must be resolved
before Milestone 1.4 (Authorisation hardening) or any external pilot, whichever comes first**, since
Authorisation hardening is expected to introduce concurrent first-sign-in load this register should
not let outrun the fix a second time.

### Entry format

```markdown
### TD-NNN — <title>

**Severity:** S1–S4
**Incurred:** YYYY-MM-DD in #PR
**Owner:** <role>
**Review by:** YYYY-MM-DD
**Area:** <path or domain>

**What was done and why**
The shortcut, and the reason it was the right call at the time.

**Cost of carrying it**
What it makes slower, riskier or harder. Be concrete.

**What it would take to fix**
Estimated effort and approach.

**Trigger to fix**
The event, scale or date that makes this urgent.
```

## Known debt accepted by design

Not debt — deliberate decisions, recorded so nobody "fixes" them without understanding why:

| Item | Why accepted | ADR |
|---|---|---|
| Deep coupling to PostgreSQL | An abstraction over Postgres would waste the capability we chose it for | [ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md) |
| Next.js coupling in the web app | Framework-level replaceability is not worth the cost at the UI layer | [ADR-0002 / TECH_STACK](../../architecture/TECH_STACK.md) |
| Postgres as a single point of failure | Deliberate; the alternative is distributed consistency across four stores | [ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md) |
| Human review as a throughput ceiling | The control *is* the product | [ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md) |
| Two API surfaces to maintain | Serving both our UI and external integrators well requires both | [ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md) |
| Denormalised `session.consent_state` | On the hot path of the most important safety check in the system | [DATA_MODEL](../../architecture/DATA_MODEL.md) |

If you find yourself wanting to remove one of these, read the ADR first. If you still disagree, write
a superseding ADR — that is the correct route, and it is welcome.

## Quarterly audit

The CTO reviews:

- Entries past their review date (a missed review date is itself a signal)
- Trend: is the register growing faster than it shrinks?
- Whether debt-reduction capacity was actually used, or absorbed by features
- Whether any S1 or S2 item has been carried for more than two releases
- Whether any security exception is approaching or past expiry

Results go into the retrospective and, if the trend is bad, to the Steering Committee. A register
nobody audits becomes a graveyard, and a graveyard is indistinguishable from having no register.
