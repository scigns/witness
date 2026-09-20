/**
 * KnowledgeRelationship — a typed, provenance-carrying edge between two
 * `KnowledgeEntity` rows. This is a write-model row, not the graph itself
 * (ADR-0011): the Neo4j projection is `MERGE`d from rows like this one, and
 * this row survives even if the projection is dropped and rebuilt.
 *
 * `relationshipType` is checked against the caller-supplied set of
 * registered codes, not a hardcoded union — the domain layer cannot query
 * `RelationshipTypeDefinition` itself (ADR-0003), so the service layer reads
 * the valid set and passes it in, the same shape as `assertLinkable` taking
 * pre-fetched refs in `evidence-link.ts`.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  KnowledgeAssertionId,
  KnowledgeEntityId,
  KnowledgeRelationshipId,
  OrganisationId,
  WorkspaceId,
} from './ids.js';

export interface KnowledgeRelationship {
  readonly id: KnowledgeRelationshipId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly fromEntityId: KnowledgeEntityId;
  readonly toEntityId: KnowledgeEntityId;
  readonly relationshipType: string;
  readonly assertionId: KnowledgeAssertionId;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly strength: number | null;
  readonly createdAt: Date;
  readonly createdBy: Actor;
}

export interface KnowledgeRelationshipOutcome {
  readonly relationship: KnowledgeRelationship;
  readonly event: PendingAuditEvent;
}

export interface EntityRefForRelationship {
  readonly id: KnowledgeEntityId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly status: 'active' | 'merged' | 'superseded';
}

export interface CreateKnowledgeRelationshipInput {
  id: KnowledgeRelationshipId;
  from: EntityRefForRelationship;
  to: EntityRefForRelationship;
  relationshipType: string;
  registeredTypeCodes: ReadonlySet<string>;
  assertionId: KnowledgeAssertionId;
  validFrom?: Date | undefined;
  validTo?: Date | null | undefined;
  strength?: number | null | undefined;
  createdBy: Actor;
  at: Date;
}

function assertRelatable(from: EntityRefForRelationship, to: EntityRefForRelationship): void {
  if (from.id === to.id) {
    throw new InvariantViolation(
      'A knowledge entity cannot be related to itself.',
      'RELATIONSHIP_SELF',
    );
  }
  if (from.organisationId !== to.organisationId) {
    throw new InvariantViolation(
      'Cannot relate knowledge entities across organisations.',
      'RELATIONSHIP_CROSS_ORGANISATION',
    );
  }
  if (from.workspaceId !== to.workspaceId) {
    throw new InvariantViolation(
      'Cannot relate knowledge entities across workspaces.',
      'RELATIONSHIP_CROSS_WORKSPACE',
    );
  }
  if (from.status !== 'active' || to.status !== 'active') {
    throw new InvariantViolation(
      'Only active knowledge entities may be related — resolve merges first.',
      'RELATIONSHIP_REQUIRES_ACTIVE_ENTITIES',
    );
  }
}

export function createKnowledgeRelationship(
  input: CreateKnowledgeRelationshipInput,
): KnowledgeRelationshipOutcome {
  assertRelatable(input.from, input.to);

  if (!input.registeredTypeCodes.has(input.relationshipType)) {
    throw new InvariantViolation(
      `'${input.relationshipType}' is not a registered relationship type in this deployment.`,
      'UNREGISTERED_RELATIONSHIP_TYPE',
    );
  }

  if (
    input.strength !== null &&
    input.strength !== undefined &&
    (input.strength < 0 || input.strength > 1)
  ) {
    throw new InvariantViolation(
      'Relationship strength must be between 0 and 1.',
      'INVALID_RELATIONSHIP_STRENGTH',
    );
  }

  const relationship: KnowledgeRelationship = {
    id: input.id,
    organisationId: input.from.organisationId,
    workspaceId: input.from.workspaceId,
    fromEntityId: input.from.id,
    toEntityId: input.to.id,
    relationshipType: input.relationshipType,
    assertionId: input.assertionId,
    validFrom: input.validFrom ?? input.at,
    validTo: input.validTo ?? null,
    strength: input.strength ?? null,
    createdAt: input.at,
    createdBy: input.createdBy,
  };

  return {
    relationship,
    event: {
      action: 'knowledge_relationship.created',
      actor: input.createdBy,
      metadata: {
        fromEntityId: relationship.fromEntityId,
        toEntityId: relationship.toEntityId,
        relationshipType: relationship.relationshipType,
        assertionId: relationship.assertionId,
      },
    },
  };
}

/** Close a relationship's validity interval — bitemporal, never a delete (DATA_MODEL.md §4). */
export function endKnowledgeRelationshipValidity(
  relationship: KnowledgeRelationship,
  validTo: Date,
  by: Actor,
): KnowledgeRelationshipOutcome {
  if (relationship.validTo !== null) {
    throw new InvariantViolation(
      'This relationship already has an end of validity.',
      'RELATIONSHIP_ALREADY_ENDED',
    );
  }
  return {
    relationship: { ...relationship, validTo },
    event: {
      action: 'knowledge_relationship.validity_ended',
      actor: by,
      metadata: { relationshipId: relationship.id, validTo: validTo.toISOString() },
    },
  };
}
