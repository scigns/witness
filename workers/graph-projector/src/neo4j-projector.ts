/**
 * The one place Neo4j is ever written to (ADR-0011). Every write is
 * `MERGE`, never `CREATE` — replaying the same assertion twice produces the
 * identical graph, which is both this file's idempotency guarantee
 * (`EVENT_CATALOGUE.md` §3) and the mechanism the rebuild command
 * (`rebuild.ts`) relies on to reconstruct the whole graph from Postgres.
 *
 * Graph shape is documented in
 * `services/knowledge-graph/src/neo4j-graph-repository.ts`'s file header —
 * that file's read queries and this file's writes must agree on it, since
 * nothing else checks that they do (a rebuild-equivalence test is the
 * closest thing; see `rebuild.ts`'s doc comment on why it needs a running
 * Neo4j to actually run).
 */

import type { Session } from 'neo4j-driver';

import type { AssertionProjection, EntityRow } from './postgres-source.js';

const MERGE_ENTITY_CYPHER = `
  MERGE (n:KnowledgeEntity {id: $id})
  SET n.organisationId = $organisationId,
      n.workspaceId = $workspaceId,
      n.entityType = $entityType,
      n.topicScheme = $topicScheme,
      n.canonicalLabel = $canonicalLabel,
      n.sensitivityClass = $sensitivityClass,
      n.status = $status,
      n.ontologyVersion = $ontologyVersion
`;

const MERGE_ASSERTION_CYPHER = `
  MERGE (a:Assertion {id: $id})
  SET a.organisationId = $organisationId,
      a.workspaceId = $workspaceId,
      a.provenanceChainId = $provenanceChainId,
      a.sourceEvidenceIds = $sourceEvidenceIds,
      a.extractionMethod = $extractionMethod,
      a.extractionModel = $extractionModel,
      a.extractionModelVersion = $extractionModelVersion,
      a.confirmedByDisplayName = $confirmedByDisplayName,
      a.confirmedAt = $confirmedAt,
      a.confidence = $confidence,
      a.lifecycleState = $lifecycleState,
      a.perspectiveTags = $perspectiveTags,
      a.sensitivityClass = $sensitivityClass
`;

function entityParams(entity: EntityRow): Record<string, unknown> {
  return {
    id: entity.id,
    organisationId: entity.organisationId,
    workspaceId: entity.workspaceId,
    entityType: entity.entityType,
    topicScheme: entity.topicScheme,
    canonicalLabel: entity.canonicalLabel,
    sensitivityClass: entity.sensitivityClass,
    status: entity.status,
    ontologyVersion: entity.ontologyVersion,
  };
}

function assertionParams(projection: AssertionProjection): Record<string, unknown> {
  const a = projection.assertion;
  return {
    id: a.id,
    organisationId: a.organisationId,
    workspaceId: a.workspaceId,
    provenanceChainId: a.provenanceChainId,
    sourceEvidenceIds: a.sourceEvidenceIds,
    extractionMethod: a.extractionMethod,
    extractionModel: a.extractionModel,
    extractionModelVersion: a.extractionModelVersion,
    confirmedByDisplayName: a.confirmedByDisplayName,
    confirmedAt: a.confirmedAt,
    confidence: a.confidence,
    lifecycleState: a.lifecycleState,
    perspectiveTags: a.perspectiveTags,
    sensitivityClass: a.sensitivityClass,
  };
}

/**
 * `lifecycleState` gates whether an assertion is even visible in the
 * projection: `rejected` and `superseded` assertions, and anything not yet
 * at least `evidence_reviewed`/`community_validated`/`approved`/
 * `published`, are removed from (or never enter) the graph — "rejected
 * assertions do not appear in published graph projections" and "the
 * projector ignores unconfirmed candidates by default" (ADR-0012).
 * `facilitator_curated` is included: a manually-curated assertion with no
 * AI candidate behind it has already been confirmed by a human at that
 * point (ADR-0012's gate is about candidate→assertion, not about which
 * post-confirmation lifecycle states are graph-visible).
 */
const PROJECTABLE_LIFECYCLE_STATES = new Set([
  'facilitator_curated',
  'evidence_reviewed',
  'community_validated',
  'approved',
  'published',
]);

export function isProjectable(projection: AssertionProjection): boolean {
  return (
    projection.assertion.retractedAt === null &&
    PROJECTABLE_LIFECYCLE_STATES.has(projection.assertion.lifecycleState)
  );
}

/** Remove everything this assertion is solely responsible for — the retraction/rejection path. */
async function retractAssertion(session: Session, projection: AssertionProjection): Promise<void> {
  await session.executeWrite(async (tx) => {
    if (projection.kind === 'relationship') {
      await tx.run(`MATCH ()-[r {id: $id}]-() DELETE r`, { id: projection.relationshipId });
    } else {
      await tx.run(`MATCH (n:KnowledgeEntity {id: $id}) REMOVE n[$key]`, {
        id: projection.entity.id,
        key: projection.attributeKey,
      });
    }
    await tx.run(`MATCH (a:Assertion {id: $id}) DETACH DELETE a`, { id: projection.assertion.id });
  });
}

export async function projectAssertion(
  session: Session,
  projection: AssertionProjection,
): Promise<void> {
  if (!isProjectable(projection)) {
    await retractAssertion(session, projection);
    return;
  }

  if (projection.kind === 'entity_attribute') {
    await session.executeWrite(async (tx) => {
      await tx.run(MERGE_ENTITY_CYPHER, entityParams(projection.entity));
      await tx.run(MERGE_ASSERTION_CYPHER, assertionParams(projection));
      // Dynamic property key: `attributeKey` is application-controlled
      // (validated in packages/domain/src/knowledge-entity-attribute.ts,
      // never raw user text embedded as Cypher), so this is the same class
      // of safe dynamic-identifier use as the relationship type below.
      await tx.run(
        `MATCH (n:KnowledgeEntity {id: $entityId}) SET n[$key] = $value
         WITH n MATCH (a:Assertion {id: $assertionId}) MERGE (n)-[:ASSERTED_BY]->(a)`,
        {
          entityId: projection.entity.id,
          key: projection.attributeKey,
          value: projection.attributeValue,
          assertionId: projection.assertion.id,
        },
      );
    });
    return;
  }

  // Relationship. The relationship *type* is interpolated (Cypher cannot
  // parameterise a relationship type in a MERGE pattern) — safe because it
  // is validated against `RelationshipTypeDefinition.code` by a real
  // foreign key before this row can exist at all
  // (`packages/domain/src/relationship-vocabulary.ts`'s
  // `RELATIONSHIP_TYPE_CODE_PATTERN`, `^[A-Z][A-Z0-9_]{1,63}$`), so it can
  // never contain anything but upper-snake-case ASCII.
  await session.executeWrite(async (tx) => {
    await tx.run(MERGE_ENTITY_CYPHER, entityParams(projection.fromEntity));
    await tx.run(MERGE_ENTITY_CYPHER, entityParams(projection.toEntity));
    await tx.run(MERGE_ASSERTION_CYPHER, assertionParams(projection));
    await tx.run(
      `MATCH (f:KnowledgeEntity {id: $fromId}), (t:KnowledgeEntity {id: $toId})
       MERGE (f)-[r:${projection.relationshipType} {id: $id}]->(t)
       SET r.assertionId = $assertionId,
           r.organisationId = $organisationId,
           r.workspaceId = $workspaceId,
           r.fromEntityId = $fromId,
           r.toEntityId = $toId,
           r.validFrom = $validFrom,
           r.validTo = $validTo,
           r.strength = $strength`,
      {
        fromId: projection.fromEntity.id,
        toId: projection.toEntity.id,
        id: projection.relationshipId,
        assertionId: projection.assertion.id,
        organisationId: projection.assertion.organisationId,
        workspaceId: projection.assertion.workspaceId,
        validFrom: projection.validFrom,
        validTo: projection.validTo,
        strength: projection.strength === null ? null : projection.strength,
      },
    );
  });
}
