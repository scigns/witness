/**
 * KnowledgeEntity — a node in the evidence knowledge graph's write model.
 *
 * `KNOWLEDGE_GRAPH.md` §3 fixes the thirteen core types; §11 makes the core
 * closed (changing it needs Knowledge Graph Lead + Principal Architect
 * sign-off and its own ADR). `Topic` carries `topicScheme` to accommodate the
 * broader taxonomy (cultural concept, theme, issue, general concept) the
 * originating feature request asked for, per ADR-0026 point 2 — this is a
 * controlled vocabulary *value*, not a new node type.
 *
 * An entity never carries content directly: every fact about it is an
 * `EntityAttribute` row citing an `Assertion`, and every relationship it
 * participates in is a `Relationship` row citing an `Assertion`
 * (`KNOWLEDGE_GRAPH.md` §2.3 — "everything is asserted"). This file only
 * governs the entity's own identity, type, sensitivity and merge lineage.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EntityMergeLogId, KnowledgeEntityId, OrganisationId, WorkspaceId } from './ids.js';

export const KNOWLEDGE_ENTITY_TYPES = [
  'person',
  'community',
  'organisation',
  'project',
  'meeting',
  'policy',
  'evidence',
  'risk',
  'decision',
  'action',
  'commitment',
  'location',
  'topic',
] as const;
export type KnowledgeEntityType = (typeof KNOWLEDGE_ENTITY_TYPES)[number];

/**
 * Values for `topicScheme` when `entityType === 'topic'`. Additive — a new
 * scheme is a minor ontology version bump (`KNOWLEDGE_GRAPH.md` §11), not a
 * new node type, and is never removed without the same deprecation process
 * that would govern removing a core type.
 */
export const TOPIC_SCHEMES = ['general_concept', 'theme', 'issue', 'cultural_concept'] as const;
export type TopicScheme = (typeof TOPIC_SCHEMES)[number];

export const SENSITIVITY_CLASSES = ['public', 'internal', 'confidential', 'restricted'] as const;
export type SensitivityClass = (typeof SENSITIVITY_CLASSES)[number];

const SENSITIVITY_RANK: Readonly<Record<SensitivityClass, number>> = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
});

/** The maximum (most restrictive) of a set of sensitivities — `KNOWLEDGE_GRAPH.md` §2.6, "sensitivity travels". */
export function maxSensitivity(values: readonly SensitivityClass[]): SensitivityClass {
  if (values.length === 0) {
    throw new InvariantViolation(
      'Cannot compute sensitivity of an empty set.',
      'EMPTY_SENSITIVITY_SET',
    );
  }
  return values.reduce((max, value) =>
    SENSITIVITY_RANK[value] > SENSITIVITY_RANK[max] ? value : max,
  );
}

export const ENTITY_STATUSES = ['active', 'merged', 'superseded'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export interface KnowledgeEntity {
  readonly id: KnowledgeEntityId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly entityType: KnowledgeEntityType;
  readonly topicScheme: TopicScheme | null;
  readonly canonicalLabel: string;
  readonly definition: string | null;
  readonly sensitivityClass: SensitivityClass;
  /** Set only when this entity is itself the community/custodian a restriction defers to. */
  readonly communityRestrictionId: KnowledgeEntityId | null;
  readonly status: EntityStatus;
  readonly mergedIntoId: KnowledgeEntityId | null;
  readonly ontologyVersion: string;
  readonly createdAt: Date;
  readonly createdBy: Actor;
  readonly version: number;
}

export interface KnowledgeEntityOutcome {
  readonly entity: KnowledgeEntity;
  readonly event: PendingAuditEvent;
}

const LABEL_MAX = 300;
const DEFINITION_MAX = 5000;

function assertEntityType(value: string): KnowledgeEntityType {
  if (!(KNOWLEDGE_ENTITY_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not one of the thirteen core knowledge entity types.`,
      'INVALID_KNOWLEDGE_ENTITY_TYPE',
    );
  }
  return value as KnowledgeEntityType;
}

function assertTopicScheme(
  entityType: KnowledgeEntityType,
  value: string | null | undefined,
): TopicScheme | null {
  if (entityType !== 'topic') {
    if (value !== null && value !== undefined) {
      throw new InvariantViolation(
        'topicScheme may only be set when entityType is topic.',
        'TOPIC_SCHEME_ON_NON_TOPIC',
      );
    }
    return null;
  }
  if (
    value === null ||
    value === undefined ||
    !(TOPIC_SCHEMES as readonly string[]).includes(value)
  ) {
    throw new InvariantViolation(
      `A topic entity must declare a topicScheme, one of: ${TOPIC_SCHEMES.join(', ')}.`,
      'INVALID_TOPIC_SCHEME',
    );
  }
  return value as TopicScheme;
}

function assertLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A knowledge entity must have a canonical label.',
      'KNOWLEDGE_ENTITY_LABEL_REQUIRED',
    );
  }
  if (trimmed.length > LABEL_MAX) {
    throw new InvariantViolation(
      `A canonical label must be ${LABEL_MAX} characters or fewer.`,
      'KNOWLEDGE_ENTITY_LABEL_TOO_LONG',
    );
  }
  return trimmed;
}

function assertDefinition(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DEFINITION_MAX) {
    throw new InvariantViolation(
      `A definition must be ${DEFINITION_MAX} characters or fewer.`,
      'KNOWLEDGE_ENTITY_DEFINITION_TOO_LONG',
    );
  }
  return trimmed;
}

export interface CreateKnowledgeEntityInput {
  id: KnowledgeEntityId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  entityType: string;
  topicScheme?: string | null | undefined;
  canonicalLabel: string;
  definition?: string | null | undefined;
  sensitivityClass?: SensitivityClass;
  communityRestrictionId?: KnowledgeEntityId | null | undefined;
  ontologyVersion: string;
  createdBy: Actor;
  at: Date;
}

export function createKnowledgeEntity(input: CreateKnowledgeEntityInput): KnowledgeEntityOutcome {
  const entityType = assertEntityType(input.entityType);
  const topicScheme = assertTopicScheme(entityType, input.topicScheme);
  const canonicalLabel = assertLabel(input.canonicalLabel);
  const definition = assertDefinition(input.definition);
  const sensitivityClass = input.sensitivityClass ?? 'internal';

  const entity: KnowledgeEntity = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    entityType,
    topicScheme,
    canonicalLabel,
    definition,
    sensitivityClass,
    communityRestrictionId: input.communityRestrictionId ?? null,
    status: 'active',
    mergedIntoId: null,
    ontologyVersion: input.ontologyVersion,
    createdAt: input.at,
    createdBy: input.createdBy,
    version: 1,
  };

  return {
    entity,
    event: {
      action: 'knowledge_entity.created',
      actor: input.createdBy,
      metadata: {
        knowledgeDomain: entity.workspaceId,
        entityType: entity.entityType,
        topicScheme: entity.topicScheme ?? '',
        sensitivityClass: entity.sensitivityClass,
      },
    },
  };
}

/**
 * Raise (never lower) an entity's sensitivity to the maximum of its
 * assertions', per `KNOWLEDGE_GRAPH.md` §2.6. Downgrade is a distinct,
 * explicit, audited operation (`declassifyKnowledgeEntity`) — there is no
 * automatic declassification path, matching `DATA_MODEL.md` §6.
 */
export function raiseKnowledgeEntitySensitivity(
  entity: KnowledgeEntity,
  candidate: SensitivityClass,
  by: Actor,
): KnowledgeEntityOutcome {
  const next = maxSensitivity([entity.sensitivityClass, candidate]);
  if (next === entity.sensitivityClass) {
    return {
      entity,
      event: {
        action: 'knowledge_entity.sensitivity_unchanged',
        actor: by,
        metadata: { entityId: entity.id, sensitivityClass: entity.sensitivityClass },
      },
    };
  }
  return {
    entity: { ...entity, sensitivityClass: next, version: entity.version + 1 },
    event: {
      action: 'knowledge_entity.sensitivity_changed',
      actor: by,
      metadata: { entityId: entity.id, from: entity.sensitivityClass, to: next },
    },
  };
}

/**
 * Explicit, audited downgrade — requires the caller to already hold
 * `knowledge_entity:steward` or `knowledge_governance:configure`; this
 * function only records that a human decided to, never decides on its own.
 */
export function declassifyKnowledgeEntity(
  entity: KnowledgeEntity,
  to: SensitivityClass,
  rationale: string,
  by: Actor,
): KnowledgeEntityOutcome {
  const trimmedRationale = rationale.trim();
  if (trimmedRationale.length === 0) {
    throw new InvariantViolation(
      'Declassifying a knowledge entity requires a rationale.',
      'DECLASSIFY_RATIONALE_REQUIRED',
    );
  }
  if (SENSITIVITY_RANK[to] >= SENSITIVITY_RANK[entity.sensitivityClass]) {
    throw new InvariantViolation(
      'declassifyKnowledgeEntity only lowers sensitivity; use raiseKnowledgeEntitySensitivity to raise it.',
      'DECLASSIFY_NOT_A_DOWNGRADE',
    );
  }
  return {
    entity: { ...entity, sensitivityClass: to, version: entity.version + 1 },
    event: {
      action: 'knowledge_entity.declassified',
      actor: by,
      metadata: {
        entityId: entity.id,
        from: entity.sensitivityClass,
        to,
        rationale: trimmedRationale,
      },
    },
  };
}

export interface MergeKnowledgeEntitiesInput {
  mergeLogId: EntityMergeLogId;
  surviving: KnowledgeEntity;
  merged: KnowledgeEntity;
  rationale: string;
  reversibleUntil: Date;
  decidedBy: Actor;
  at: Date;
}

export interface MergeKnowledgeEntitiesOutcome {
  readonly survivingEntity: KnowledgeEntity;
  readonly mergedEntity: KnowledgeEntity;
  readonly events: readonly PendingAuditEvent[];
}

/**
 * Merge two entities. `KNOWLEDGE_GRAPH.md` §6: community and Indigenous
 * entities (`entityType === 'community'`) are never auto-merged — this
 * function does not distinguish "automatic" from "human-decided" (both call
 * sites are human-triggered by construction, since there is no code path
 * that calls this without a `KnowledgeReviewDecision`), but it refuses to
 * merge two community entities at all without an explicit
 * `elevatedAuthorityConfirmed` flag, because linking a pseudonymous
 * community submission to a named individual — or merging two community
 * identities — is a re-identification event and is treated as one (§6).
 *
 * The merged entity is never deleted: it is tombstoned (`status: 'merged'`,
 * `mergedIntoId` set). Aliases are preserved by construction — this function
 * does not touch `EntityAlias` rows at all, and the service layer must not
 * delete or rewrite them on merge (see `entity-alias.ts`).
 */
export function mergeKnowledgeEntities(
  input: MergeKnowledgeEntitiesInput & { elevatedAuthorityConfirmed?: boolean },
): MergeKnowledgeEntitiesOutcome {
  if (input.surviving.id === input.merged.id) {
    throw new InvariantViolation('Cannot merge a knowledge entity into itself.', 'MERGE_SELF');
  }
  if (input.surviving.organisationId !== input.merged.organisationId) {
    throw new InvariantViolation(
      'Cannot merge knowledge entities across organisations.',
      'MERGE_CROSS_ORGANISATION',
    );
  }
  if (input.merged.status !== 'active' || input.surviving.status !== 'active') {
    throw new InvariantViolation(
      'Only active knowledge entities may be merged.',
      'MERGE_REQUIRES_ACTIVE_ENTITIES',
    );
  }
  const bothCommunity =
    input.surviving.entityType === 'community' && input.merged.entityType === 'community';
  const crossesIntoNamedPerson =
    (input.surviving.entityType === 'person' && input.merged.entityType === 'community') ||
    (input.surviving.entityType === 'community' && input.merged.entityType === 'person');
  if ((bothCommunity || crossesIntoNamedPerson) && input.elevatedAuthorityConfirmed !== true) {
    throw new InvariantViolation(
      'Merging community entities, or a community entity into a named person, is a re-identification event and requires elevatedAuthorityConfirmed.',
      'MERGE_REQUIRES_ELEVATED_AUTHORITY',
    );
  }
  const rationale = input.rationale.trim();
  if (rationale.length === 0) {
    throw new InvariantViolation('A merge requires a rationale.', 'MERGE_RATIONALE_REQUIRED');
  }

  const survivingEntity: KnowledgeEntity = {
    ...input.surviving,
    sensitivityClass: maxSensitivity([
      input.surviving.sensitivityClass,
      input.merged.sensitivityClass,
    ]),
    version: input.surviving.version + 1,
  };
  const mergedEntity: KnowledgeEntity = {
    ...input.merged,
    status: 'merged',
    mergedIntoId: survivingEntity.id,
    version: input.merged.version + 1,
  };

  return {
    survivingEntity,
    mergedEntity,
    events: [
      {
        action: 'knowledge_entity.merged',
        actor: input.decidedBy,
        metadata: {
          mergeLogId: input.mergeLogId,
          survivingEntityId: survivingEntity.id,
          mergedEntityId: mergedEntity.id,
          rationale,
          reversibleUntil: input.reversibleUntil.toISOString(),
        },
      },
    ],
  };
}

/**
 * Reverse a merge within its reversible window. The merged entity returns to
 * `active`; the surviving entity's sensitivity is left as-is (it may since
 * have accrued independent sensitivity from other assertions, and lowering
 * it automatically would be a silent declassification).
 */
export function reverseKnowledgeEntityMerge(
  mergedEntity: KnowledgeEntity,
  reversibleUntil: Date,
  now: Date,
  by: Actor,
): KnowledgeEntityOutcome {
  if (mergedEntity.status !== 'merged') {
    throw new InvariantViolation('Only a merged entity can have its merge reversed.', 'NOT_MERGED');
  }
  if (now.getTime() > reversibleUntil.getTime()) {
    throw new InvariantViolation(
      'This merge is outside its reversible window.',
      'MERGE_REVERSAL_WINDOW_EXPIRED',
    );
  }
  return {
    entity: {
      ...mergedEntity,
      status: 'active',
      mergedIntoId: null,
      version: mergedEntity.version + 1,
    },
    event: {
      action: 'knowledge_entity.merge_reversed',
      actor: by,
      metadata: { entityId: mergedEntity.id },
    },
  };
}
