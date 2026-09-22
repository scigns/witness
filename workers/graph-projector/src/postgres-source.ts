/**
 * Postgres access for the projector — hand-written parameterised SQL via
 * `pg`, not the generated Prisma Client. `@prisma/client`'s generated output
 * is tied to the exact package instance `prisma generate` resolved from
 * `services/api-gateway`; reusing it from an independent workspace package
 * is fragile in a pnpm monorepo (the generated `.prisma/client` output does
 * not reliably follow a second, separately-resolved `@prisma/client`
 * dependency). A worker this narrow — read the outbox, read confirmed
 * assertions, advance a checkpoint — does not need an ORM; every query here
 * is parameterised, never string-concatenated with input.
 */

import type { Pool } from 'pg';

export interface OutboxItem {
  readonly outboxId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly attempts: number;
  readonly payload: Record<string, unknown>;
}

export async function fetchPendingOutbox(
  pool: Pool,
  destination: string,
  limit: number,
): Promise<OutboxItem[]> {
  const { rows } = await pool.query<{
    outbox_id: string;
    event_id: string;
    event_type: string;
    aggregate_id: string;
    attempts: number;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT o.id AS outbox_id, o.event_id, e.event_type, e.aggregate_id, o.attempts, e.payload
     FROM outbox o
     JOIN event_log_entry e ON e.id = o.event_id
     WHERE o.destination = $1 AND o.status = 'pending'
     ORDER BY e.sequence ASC
     LIMIT $2`,
    [destination, limit],
  );
  return rows.map((r) => ({
    outboxId: r.outbox_id,
    eventId: r.event_id,
    eventType: r.event_type,
    aggregateId: r.aggregate_id,
    attempts: r.attempts,
    payload: r.payload ?? {},
  }));
}

export async function markOutboxDispatched(pool: Pool, outboxId: string): Promise<void> {
  await pool.query(
    `UPDATE outbox SET status = 'dispatched', dispatched_at = now(), last_attempt_at = now() WHERE id = $1`,
    [outboxId],
  );
}

export async function markOutboxAttemptFailed(
  pool: Pool,
  outboxId: string,
  attempts: number,
  maxAttempts: number,
): Promise<void> {
  const nextStatus = attempts + 1 >= maxAttempts ? 'failed' : 'pending';
  await pool.query(
    `UPDATE outbox SET status = $2, attempts = attempts + 1, last_attempt_at = now() WHERE id = $1`,
    [outboxId, nextStatus],
  );
}

export interface EntityRow {
  readonly id: string;
  readonly organisationId: string;
  readonly workspaceId: string;
  readonly entityType: string;
  readonly topicScheme: string | null;
  readonly canonicalLabel: string;
  readonly sensitivityClass: string;
  readonly status: string;
  readonly ontologyVersion: string;
  readonly mergedIntoId: string | null;
}

export interface AssertionCore {
  readonly id: string;
  readonly organisationId: string;
  readonly workspaceId: string;
  readonly confidence: number;
  readonly sensitivityClass: string;
  readonly lifecycleState: string;
  readonly perspectiveTags: string[];
  readonly retractedAt: string | null;
  readonly provenanceChainId: string;
  readonly sourceEvidenceIds: string[];
  readonly extractionMethod: string;
  readonly extractionModel: string | null;
  readonly extractionModelVersion: string | null;
  readonly confirmedByDisplayName: string;
  readonly confirmedAt: string;
}

export type AssertionProjection =
  | {
      readonly kind: 'entity_attribute';
      readonly assertion: AssertionCore;
      readonly entity: EntityRow;
      readonly attributeKey: string;
      readonly attributeValue: string;
    }
  | {
      readonly kind: 'relationship';
      readonly assertion: AssertionCore;
      readonly relationshipId: string;
      readonly relationshipType: string;
      readonly validFrom: string;
      readonly validTo: string | null;
      readonly strength: number | null;
      readonly fromEntity: EntityRow;
      readonly toEntity: EntityRow;
    };

function toEntityRow(row: Record<string, unknown>, prefix: string): EntityRow {
  return {
    id: String(row[`${prefix}id`]),
    organisationId: String(row[`${prefix}organisation_id`]),
    workspaceId: String(row[`${prefix}workspace_id`]),
    entityType: String(row[`${prefix}entity_type`]),
    topicScheme:
      row[`${prefix}topic_scheme`] === null ? null : String(row[`${prefix}topic_scheme`]),
    canonicalLabel: String(row[`${prefix}canonical_label`]),
    sensitivityClass: String(row[`${prefix}sensitivity_class`]),
    status: String(row[`${prefix}status`]),
    ontologyVersion: String(row[`${prefix}ontology_version`]),
    mergedIntoId:
      row[`${prefix}merged_into_id`] === undefined || row[`${prefix}merged_into_id`] === null
        ? null
        : String(row[`${prefix}merged_into_id`]),
  };
}

/**
 * Resolve an entity to the canonical (never-merged) entity the *current*
 * graph should show — walking `mergedIntoId` chains so `C merged into B
 * merged into A` resolves to `A` in one call, not one hop per merge
 * (`KNOWLEDGE_GRAPH.md` §13, Gap B: "chained merges"). PostgreSQL rows are
 * never rewritten by this — `mergeKnowledgeEntities`
 * (`packages/domain/src/knowledge-entity.ts`) already guarantees a merge
 * target is `active`, which structurally rules out a cycle (an entity
 * that is part of a chain is `merged`, and `merged` entities cannot become
 * a merge target — `MERGE_REQUIRES_ACTIVE_ENTITIES`); the hop cap below is
 * a defensive backstop against that invariant ever being violated, not the
 * primary defence.
 */
const MAX_MERGE_CHAIN_HOPS = 50;

export async function resolveCanonicalEntity(pool: Pool, entity: EntityRow): Promise<EntityRow> {
  let current = entity;
  let hops = 0;
  while (current.status === 'merged' && current.mergedIntoId !== null) {
    hops += 1;
    if (hops > MAX_MERGE_CHAIN_HOPS) {
      throw new Error(
        `Merge chain for entity '${entity.id}' exceeded ${MAX_MERGE_CHAIN_HOPS} hops — ` +
          'this should be structurally impossible (merge targets must be active) and indicates ' +
          'either data corruption or a cycle; refusing to loop further.',
      );
    }
    const { rows } = await pool.query(
      `SELECT id, organisation_id, workspace_id, entity_type, topic_scheme, canonical_label,
              sensitivity_class, status, ontology_version, merged_into_id
       FROM knowledge_entity WHERE id = $1`,
      [current.mergedIntoId],
    );
    const next = rows[0] as Record<string, unknown> | undefined;
    if (next === undefined) {
      // The merge target row is gone — should be structurally impossible
      // (entities are tombstoned, never deleted), but resolving to the
      // last-known entity is safer than throwing mid-projection.
      return current;
    }
    current = toEntityRow(next, '');
  }
  return current;
}

function toAssertionCore(row: Record<string, unknown>): AssertionCore {
  return {
    id: String(row['assertion_id']),
    organisationId: String(row['organisation_id']),
    workspaceId: String(row['workspace_id']),
    confidence: Number(row['confidence']),
    sensitivityClass: String(row['sensitivity_class']),
    lifecycleState: String(row['lifecycle_state']),
    perspectiveTags: Array.isArray(row['perspective_tags'])
      ? (row['perspective_tags'] as string[])
      : [],
    retractedAt: row['retracted_at'] === null ? null : String(row['retracted_at']),
    provenanceChainId: String(row['provenance_chain_id']),
    sourceEvidenceIds: Array.isArray(row['source_evidence_ids'])
      ? (row['source_evidence_ids'] as string[])
      : [],
    extractionMethod: String(row['extraction_method']),
    extractionModel: row['extraction_model'] === null ? null : String(row['extraction_model']),
    extractionModelVersion:
      row['extraction_model_version'] === null ? null : String(row['extraction_model_version']),
    confirmedByDisplayName: String(row['confirmed_by_display_name']),
    confirmedAt: String(row['confirmed_at']),
  };
}

const ASSERTION_CORE_SELECT = `
  a.id AS assertion_id, a.organisation_id, a.workspace_id, a.assertion_type,
  a.confidence, a.sensitivity_class, a.lifecycle_state, a.perspective_tags, a.retracted_at,
  pc.id AS provenance_chain_id, pc.source_evidence_ids, pc.extraction_method,
  pc.extraction_model, pc.extraction_model_version,
  confirmer.display_name AS confirmed_by_display_name, pc.confirmed_at
`;

const ENTITY_ATTRIBUTE_QUERY = `
  SELECT ${ASSERTION_CORE_SELECT},
    ea.attribute_key, ea.attribute_value,
    e.id AS e_id, e.organisation_id AS e_organisation_id, e.workspace_id AS e_workspace_id,
    e.entity_type AS e_entity_type, e.topic_scheme AS e_topic_scheme,
    e.canonical_label AS e_canonical_label, e.sensitivity_class AS e_sensitivity_class,
    e.status AS e_status, e.ontology_version AS e_ontology_version,
    e.merged_into_id AS e_merged_into_id
  FROM knowledge_assertion a
  JOIN knowledge_provenance_chain pc ON pc.id = a.provenance_chain_id
  JOIN actor confirmer ON confirmer.id = pc.confirmed_by_actor_id
  JOIN knowledge_entity_attribute ea ON ea.assertion_id = a.id
  JOIN knowledge_entity e ON e.id = ea.entity_id
  WHERE a.id = $1 AND a.assertion_type = 'entity_attribute'
`;

const RELATIONSHIP_QUERY = `
  SELECT ${ASSERTION_CORE_SELECT},
    r.id AS relationship_id, r.relationship_type, r.valid_from, r.valid_to, r.strength,
    fe.id AS from_id, fe.organisation_id AS from_organisation_id, fe.workspace_id AS from_workspace_id,
    fe.entity_type AS from_entity_type, fe.topic_scheme AS from_topic_scheme,
    fe.canonical_label AS from_canonical_label, fe.sensitivity_class AS from_sensitivity_class,
    fe.status AS from_status, fe.ontology_version AS from_ontology_version,
    fe.merged_into_id AS from_merged_into_id,
    te.id AS to_id, te.organisation_id AS to_organisation_id, te.workspace_id AS to_workspace_id,
    te.entity_type AS to_entity_type, te.topic_scheme AS to_topic_scheme,
    te.canonical_label AS to_canonical_label, te.sensitivity_class AS to_sensitivity_class,
    te.status AS to_status, te.ontology_version AS to_ontology_version,
    te.merged_into_id AS to_merged_into_id
  FROM knowledge_assertion a
  JOIN knowledge_provenance_chain pc ON pc.id = a.provenance_chain_id
  JOIN actor confirmer ON confirmer.id = pc.confirmed_by_actor_id
  JOIN knowledge_relationship r ON r.assertion_id = a.id
  JOIN knowledge_entity fe ON fe.id = r.from_entity_id
  JOIN knowledge_entity te ON te.id = r.to_entity_id
  WHERE a.id = $1 AND a.assertion_type = 'relationship'
`;

/**
 * Loads one assertion's projection data, with every referenced entity
 * resolved to its canonical (never-merged) form (`resolveCanonicalEntity`)
 * — so the *current* graph always shows `B merged into A` as `A`, while the
 * `knowledge_relationship`/`knowledge_entity_attribute` row itself keeps
 * citing the entity id it was originally confirmed against, unchanged
 * (`KNOWLEDGE_GRAPH.md` §13, Gap B). This is the one place that guarantee
 * is enforced — both the live per-event path (`main.ts`) and a full
 * `rebuild.ts` replay go through this function, so neither can drift from
 * the other on which entity a relationship currently resolves to.
 */
export async function loadAssertionProjection(
  pool: Pool,
  assertionId: string,
): Promise<AssertionProjection | null> {
  const attributeResult = await pool.query(ENTITY_ATTRIBUTE_QUERY, [assertionId]);
  const attributeRow = attributeResult.rows[0] as Record<string, unknown> | undefined;
  if (attributeRow !== undefined) {
    return {
      kind: 'entity_attribute',
      assertion: toAssertionCore(attributeRow),
      entity: await resolveCanonicalEntity(pool, toEntityRow(attributeRow, 'e_')),
      attributeKey: String(attributeRow['attribute_key']),
      attributeValue: String(attributeRow['attribute_value']),
    };
  }

  const relResult = await pool.query(RELATIONSHIP_QUERY, [assertionId]);
  const relRow = relResult.rows[0] as Record<string, unknown> | undefined;
  if (relRow !== undefined) {
    return {
      kind: 'relationship',
      assertion: toAssertionCore(relRow),
      relationshipId: String(relRow['relationship_id']),
      relationshipType: String(relRow['relationship_type']),
      validFrom: String(relRow['valid_from']),
      validTo: relRow['valid_to'] === null ? null : String(relRow['valid_to']),
      strength: relRow['strength'] === null ? null : Number(relRow['strength']),
      fromEntity: await resolveCanonicalEntity(pool, toEntityRow(relRow, 'from_')),
      toEntity: await resolveCanonicalEntity(pool, toEntityRow(relRow, 'to_')),
    };
  }

  return null;
}

/**
 * `mergedEntityId` plus every entity that has, at any point, merged into it
 * directly or transitively — the full set a merge event must re-project.
 * Needed for chained merges done as *separate* events over time: if `C`
 * merged into `B` yesterday (re-projecting `C`'s assertions onto `B` and
 * detach-deleting `C`'s node) and `B` merges into `A` today, `C`'s original
 * assertion still cites `C` in `knowledge_relationship`/
 * `knowledge_entity_attribute` (Postgres rows are never rewritten) — a
 * lookup scoped to only `B` would miss it, and `B`'s node removal would
 * then silently drop `C`'s edge from the graph instead of re-pointing it at
 * `A`. `resolveCanonicalEntity` resolving the *full* chain at load time only
 * fixes this for a rebuild that replays every assertion from scratch; the
 * incremental per-event path needs to know which Postgres rows to revisit,
 * which is what this function is for (`KNOWLEDGE_GRAPH.md` §13, Gap B —
 * chained merges).
 */
export async function fetchMergeSubtreeIds(pool: Pool, mergedEntityId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM knowledge_entity WHERE id = $1
       UNION ALL
       SELECT e.id FROM knowledge_entity e JOIN subtree s ON e.merged_into_id = s.id
     )
     SELECT id FROM subtree`,
    [mergedEntityId],
  );
  return rows.map((r) => r.id);
}

/**
 * Every confirmed, non-retracted assertion that cites any of `entityIds`
 * directly — as an attribute's own entity, or as either end of a
 * relationship — used to re-project everything a merge affects (`main.ts`'s
 * merge-event handler, together with `fetchMergeSubtreeIds`).
 */
export async function fetchAssertionIdsReferencingEntity(
  pool: Pool,
  entityIds: readonly string[],
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT a.id
     FROM knowledge_assertion a
     LEFT JOIN knowledge_entity_attribute ea ON ea.assertion_id = a.id
     LEFT JOIN knowledge_relationship r ON r.assertion_id = a.id
     WHERE a.retracted_at IS NULL
       AND (ea.entity_id = ANY($1) OR r.from_entity_id = ANY($1) OR r.to_entity_id = ANY($1))`,
    [entityIds],
  );
  return rows.map((r) => r.id);
}

/** Every confirmed, non-retracted assertion, oldest first — the rebuild replay order. */
export async function fetchAllConfirmedAssertionIds(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM knowledge_assertion WHERE retracted_at IS NULL ORDER BY recorded_at ASC`,
  );
  return rows.map((r) => r.id);
}

export async function getCheckpoint(pool: Pool, projectionName: string): Promise<string | null> {
  const { rows } = await pool.query<{ last_event_id: string | null }>(
    `SELECT last_event_id FROM knowledge_graph_projection_checkpoint WHERE projection_name = $1`,
    [projectionName],
  );
  return rows[0]?.last_event_id ?? null;
}

export async function advanceCheckpoint(
  pool: Pool,
  projectionName: string,
  lastEventId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_graph_projection_checkpoint (projection_name, last_event_id, status, updated_at)
     VALUES ($1, $2, 'idle', now())
     ON CONFLICT (projection_name)
     DO UPDATE SET last_event_id = $2, status = 'idle', updated_at = now()`,
    [projectionName, lastEventId],
  );
}

export async function resetCheckpoint(pool: Pool, projectionName: string): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_graph_projection_checkpoint (projection_name, last_event_id, status, updated_at)
     VALUES ($1, NULL, 'running', now())
     ON CONFLICT (projection_name)
     DO UPDATE SET last_event_id = NULL, status = 'running', updated_at = now()`,
    [projectionName],
  );
}
