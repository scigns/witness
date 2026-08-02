# Common Task Workflows

**Owner:** Developer Experience Lead
**Status:** Active

Standard procedures. Following these means the scaffolding, gates and conventions are handled for you.

---

## Adding an API endpoint

1. **Contract first.** Add to `packages/contracts` (OpenAPI for REST, SDL for GraphQL).
2. Write the contract test. It should fail.
3. Implement: adapter → application handler → domain.
4. **Declare the authorisation requirement.** An endpoint without one fails a fitness test.
5. **Thread the `ConsentedContext`** if personal data is involved. This is a compile error if omitted.
6. Add integration tests against real infrastructure.
7. Update `docs/guides/API_GUIDE.md`.

**REST is a public contract** — breaking changes need a major version. **GraphQL is a BFF** and may
evolve with the UI ([ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md)).

## Adding a domain event

1. Add to `packages/contracts/events` (AsyncAPI) **and** `architecture/EVENT_CATALOGUE.md`.
2. Name it in the **past tense** — it is a fact that happened, not a command.
3. Publish through the **outbox**, never directly to the broker.
4. Make every consumer **idempotent**, keyed on the CloudEvents `id`.
5. Test duplicate delivery explicitly.

## Adding a database migration

1. `pnpm db:migrate:new <name>`
2. **Expand / migrate / contract** — never destructive in one release.
3. **Reversible**, or ship a tested forward-fix.
4. `tenant_id NOT NULL` and RLS enabled — a migration adding a table without RLS fails a lint check.
5. Time it on realistic volume and document the duration.
6. Test both directions.

## Changing the knowledge graph ontology

1. Read `architecture/KNOWLEDGE_GRAPH.md` §11 on ontology governance.
2. **Core node type changes require an ADR** plus Principal Architect approval.
3. Version the ontology; additive changes are minor.
4. Update the projector.
5. **Run the rebuild-from-log test** — it must produce an equivalent graph.
6. Verify the provenance invariant still holds.

## Changing a product prompt

1. Prompts are **versioned source code**, not configuration.
2. Change it, and the hash changes automatically.
3. **Run the evaluation harness and attach the delta report to the pull request.** A prompt change
   without one cannot merge.
4. Regression beyond threshold blocks the merge.
5. AI Lead review required.

## Adding a dependency

1. Write the entry in `docs/research/OSS_EVALUATION.md` — all eight criteria, **including the
   replacement strategy**.
2. Research Lead review (3 days), Security Lead review (2 days).
3. ADR if architecturally significant.
4. Licence gate must pass.

**If you cannot describe how we would remove it, we are not adding it.**

## Writing an ADR

1. `make adr TITLE="short imperative title"`
2. Fill in Context, Options, Decision, Consequences.
3. **Represent the rejected alternatives fairly** — include the one a reasonable person would choose.
4. **The Negative section must not be empty.** CI checks this.
5. State how it is enforced: a lint rule, a CI gate, a test — or admit it relies on goodwill.
6. Add it to `architecture/decisions/README.md`.
7. Open a PR labelled `adr`, status `Proposed`. Minimum 7 days.
