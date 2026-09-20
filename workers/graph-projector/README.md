# Graph Projector

**Owner:** Backend Lead
**Status:** Phase 2 — implemented (`@witness/graph-projector`)

Projects confirmed assertions from the transactional outbox
(`org.witness.knowledge.assertion.confirmed.v1`) into Neo4j. Idempotent
(`MERGE`, never `CREATE`), checkpointed and resumable. The whole graph can be
dropped and rebuilt from Postgres — `pnpm --filter @witness/graph-projector run rebuild`
— verified by replaying every confirmed, non-retracted `KnowledgeAssertion`
row oldest-first.

**Minimal profile, not NATS.** This consumes the `outbox`/`event_log_entry`
Postgres tables directly (ADR-0005's "minimal profile: in-process polling
dispatcher"), not NATS JetStream — that adapter is future work behind the
same event shape; this worker's `main.ts` poll loop is the piece that
changes, not the projection logic in `neo4j-projector.ts`.

Run:

```bash
pnpm --filter @witness/graph-projector build
DATABASE_URL=... NEO4J_URI=bolt://localhost:7687 NEO4J_PROJECTOR_USER=... NEO4J_PROJECTOR_PASSWORD=... \
  pnpm --filter @witness/graph-projector start
```

## The gate worth understanding

**Every write path in this worker is `MERGE`.** There is no `CREATE` in
`neo4j-projector.ts` and there should never be one — replaying the same
assertion twice must produce the identical graph, or the rebuild guarantee
(ADR-0011's exit gate) is fiction.

## Rules

- **Every consumer is idempotent**, keyed on the CloudEvents `id` — here,
  satisfied structurally by `MERGE` rather than a dedup table.
- Assume out-of-order delivery across aggregates. Ordering holds per
  aggregate only.
- Consumes through the transactional outbox, never a direct trigger.
- Rejected, superseded, and retracted assertions are removed from the graph,
  not merely left unprojected — see `neo4j-projector.ts`'s `retractAssertion`.
