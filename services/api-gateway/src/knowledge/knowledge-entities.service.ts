/**
 * KnowledgeEntity CRUD + alias + merge. Creating an entity itself carries no
 * provenance requirement (an entity is an identity, not a claim about it —
 * `KNOWLEDGE_GRAPH.md` §2.3, "everything is asserted" applies to
 * *attributes and relationships*, not to the existence of a placeholder for
 * "there is a topic called X"). Merge and alias operations do — aliases
 * carry `contributedBy`; merges carry `decidedBy` and a rationale, and are
 * gated on `knowledge_entity:steward`.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  addEntityAlias,
  createEntityMergeLog,
  createKnowledgeEntity,
  mergeKnowledgeEntities,
  toActorId,
  toEntityAliasId,
  toEntityMergeLogId,
  toEvidenceId,
  toKnowledgeEntityId,
  toOrganisationId,
  toWorkspaceId,
  InvariantViolation,
  type KnowledgeEntity,
} from '@witness/domain';
import type {
  AddEntityAliasRequest,
  CreateKnowledgeEntityRequest,
  EntityAliasView,
  KnowledgeEntityView,
  MergeKnowledgeEntitiesPreview,
  MergeKnowledgeEntitiesRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

const ONTOLOGY_VERSION = '0.1.0';

type EntityRow = Awaited<ReturnType<PrismaService['knowledgeEntity']['findFirstOrThrow']>> & {
  _count?: { aliases: number };
};

function toView(row: EntityRow): KnowledgeEntityView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    entityType: row.entityType as KnowledgeEntityView['entityType'],
    topicScheme: row.topicScheme as KnowledgeEntityView['topicScheme'],
    canonicalLabel: row.canonicalLabel,
    definition: row.definition,
    sensitivityClass: row.sensitivityClass as KnowledgeEntityView['sensitivityClass'],
    status: row.status as KnowledgeEntityView['status'],
    mergedIntoId: row.mergedIntoId,
    ontologyVersion: row.ontologyVersion,
    createdAt: row.createdAt.toISOString(),
    aliasCount: row._count?.aliases ?? 0,
  };
}

function toDomainEntity(
  row: Awaited<ReturnType<PrismaService['knowledgeEntity']['findFirstOrThrow']>>,
): KnowledgeEntity {
  return {
    id: toKnowledgeEntityId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    entityType: row.entityType as KnowledgeEntity['entityType'],
    topicScheme: row.topicScheme as KnowledgeEntity['topicScheme'],
    canonicalLabel: row.canonicalLabel,
    definition: row.definition,
    sensitivityClass: row.sensitivityClass as KnowledgeEntity['sensitivityClass'],
    communityRestrictionId: row.communityRestrictionId as KnowledgeEntity['communityRestrictionId'],
    status: row.status as KnowledgeEntity['status'],
    mergedIntoId: row.mergedIntoId as KnowledgeEntity['mergedIntoId'],
    ontologyVersion: row.ontologyVersion,
    createdAt: row.createdAt,
    createdBy: { id: row.createdById as never, kind: 'human', displayName: '' },
    version: row.version,
  };
}

@Injectable()
export class KnowledgeEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, entityType?: string): Promise<KnowledgeEntityView[]> {
    const rows = await this.prisma.knowledgeEntity.findMany({
      where: { workspaceId, status: 'active', ...(entityType ? { entityType } : {}) },
      include: { _count: { select: { aliases: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toView);
  }

  async get(workspaceId: string, entityId: string): Promise<KnowledgeEntityView> {
    const row = await this.prisma.knowledgeEntity.findFirst({
      where: { id: entityId, workspaceId },
      include: { _count: { select: { aliases: true } } },
    });
    if (row === null)
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge entity not found.' },
      });
    return toView(row);
  }

  async create(
    organisationId: string,
    workspaceId: string,
    request: CreateKnowledgeEntityRequest,
    principal: Principal,
  ): Promise<KnowledgeEntityView> {
    const actor = await resolveActor(this.prisma, principal);
    const { entity, event } = createKnowledgeEntity({
      id: toKnowledgeEntityId(randomUUID()),
      organisationId: toOrganisationId(organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      entityType: request.entityType,
      topicScheme: request.topicScheme,
      canonicalLabel: request.canonicalLabel,
      definition: request.definition,
      ...(request.sensitivityClass ? { sensitivityClass: request.sensitivityClass } : {}),
      ontologyVersion: ONTOLOGY_VERSION,
      createdBy: actor,
      at: new Date(),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeEntity.create({
        data: {
          id: entity.id,
          organisationId: entity.organisationId,
          workspaceId: entity.workspaceId,
          entityType: entity.entityType,
          topicScheme: entity.topicScheme,
          canonicalLabel: entity.canonicalLabel,
          definition: entity.definition,
          sensitivityClass: entity.sensitivityClass,
          status: entity.status,
          ontologyVersion: entity.ontologyVersion,
          createdAt: entity.createdAt,
          createdById: entity.createdBy.id,
          version: entity.version,
        },
      });
      await appendAuditEvent(tx, 'knowledge_entity', created.id, event, entity.createdAt);
      return created;
    });

    return toView({ ...row, _count: { aliases: 0 } });
  }

  async addAlias(
    workspaceId: string,
    entityId: string,
    request: AddEntityAliasRequest,
    principal: Principal,
  ): Promise<EntityAliasView> {
    const entity = await this.prisma.knowledgeEntity.findFirst({
      where: { id: entityId, workspaceId },
    });
    if (entity === null)
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge entity not found.' },
      });

    const actor = await resolveActor(this.prisma, principal);
    const { alias, event } = addEntityAlias({
      id: toEntityAliasId(randomUUID()),
      entityId: toKnowledgeEntityId(entityId),
      aliasText: request.aliasText,
      language: request.language,
      sourceEvidenceId: request.sourceEvidenceId ? toEvidenceId(request.sourceEvidenceId) : null,
      contributedBy: actor,
      at: new Date(),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.entityAlias.create({
        data: {
          id: alias.id,
          entityId: alias.entityId,
          aliasText: alias.aliasText,
          language: alias.language,
          sourceEvidenceId: alias.sourceEvidenceId,
          contributedById: alias.contributedBy.id,
          createdAt: alias.createdAt,
        },
      });
      await appendAuditEvent(tx, 'entity_alias', created.id, event, alias.createdAt);
      return created;
    });

    return {
      id: row.id,
      entityId: row.entityId,
      aliasText: row.aliasText,
      language: row.language,
      sourceEvidenceId: row.sourceEvidenceId,
      contributedByName: actor.displayName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listAliases(workspaceId: string, entityId: string): Promise<EntityAliasView[]> {
    const rows = await this.prisma.entityAlias.findMany({
      where: { entityId, entity: { workspaceId } },
      include: { contributedBy: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      entityId: row.entityId,
      aliasText: row.aliasText,
      language: row.language,
      sourceEvidenceId: row.sourceEvidenceId,
      contributedByName: row.contributedBy.displayName,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Dry-run of `merge()` — same invariants (self-merge, cross-organisation,
   * inactive entities, community/named-person re-identification), zero
   * writes. Never resolves an `Actor` row for the caller (that would be a
   * persistence side effect from what must behave like a `GET`); the
   * synthetic actor below is discarded after the invariant check runs and is
   * never returned to the caller or stored anywhere.
   *
   * Known gap (see `architecture/KNOWLEDGE_GRAPH.md` §6 and this feature's
   * closing report): a completed merge does not currently repoint or
   * reproject `KnowledgeRelationship`/`KnowledgeEntityAttribute` rows in
   * Neo4j, so this preview's relationship/attribute counts describe rows
   * that stay attached to the tombstoned entity's id in the graph
   * projection until that gap is closed — surfaced here rather than hidden,
   * per this feature's "never claim more than is true" requirement.
   */
  async previewMerge(
    workspaceId: string,
    survivingEntityId: string,
    mergedEntityId: string,
  ): Promise<MergeKnowledgeEntitiesPreview> {
    const [survivingRow, mergedRow] = await Promise.all([
      this.prisma.knowledgeEntity.findFirst({
        where: { id: survivingEntityId, workspaceId },
        include: { _count: { select: { aliases: true } } },
      }),
      this.prisma.knowledgeEntity.findFirst({
        where: { id: mergedEntityId, workspaceId },
        include: { _count: { select: { aliases: true } } },
      }),
    ]);
    if (survivingRow === null || mergedRow === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge entity not found.' },
      });
    }

    const previewActor = {
      id: toActorId(randomUUID()),
      kind: 'human' as const,
      displayName: 'merge preview (not persisted)',
    };
    let canMerge = true;
    let blockingReason: string | null = null;
    try {
      mergeKnowledgeEntities({
        mergeLogId: toEntityMergeLogId(randomUUID()),
        surviving: toDomainEntity(survivingRow),
        merged: toDomainEntity(mergedRow),
        rationale: 'merge preview',
        reversibleUntil: new Date(),
        decidedBy: previewActor,
        at: new Date(),
        elevatedAuthorityConfirmed: true,
      });
    } catch (error) {
      if (error instanceof InvariantViolation) {
        canMerge = false;
        blockingReason = error.message;
      } else {
        throw error;
      }
    }

    const bothCommunity =
      survivingRow.entityType === 'community' && mergedRow.entityType === 'community';
    const crossesIntoNamedPerson =
      (survivingRow.entityType === 'person' && mergedRow.entityType === 'community') ||
      (survivingRow.entityType === 'community' && mergedRow.entityType === 'person');

    const [aliasesToCarryOver, attributesOnMergedEntity, relationshipsOnMergedEntity] =
      await Promise.all([
        this.prisma.entityAlias.count({ where: { entityId: mergedEntityId } }),
        this.prisma.knowledgeEntityAttribute.count({ where: { entityId: mergedEntityId } }),
        this.prisma.knowledgeRelationship.count({
          where: { OR: [{ fromEntityId: mergedEntityId }, { toEntityId: mergedEntityId }] },
        }),
      ]);

    return {
      survivingEntity: toView(survivingRow),
      mergedEntity: toView(mergedRow),
      canMerge,
      blockingReason,
      requiresElevatedAuthority: bothCommunity || crossesIntoNamedPerson,
      aliasesToCarryOver,
      attributesOnMergedEntity,
      relationshipsOnMergedEntity,
    };
  }

  /** Steward-gated (`knowledge_entity:steward`) at the controller. */
  async merge(
    workspaceId: string,
    survivingEntityId: string,
    request: MergeKnowledgeEntitiesRequest,
    principal: Principal,
  ): Promise<KnowledgeEntityView> {
    const [survivingRow, mergedRow] = await Promise.all([
      this.prisma.knowledgeEntity.findFirst({ where: { id: survivingEntityId, workspaceId } }),
      this.prisma.knowledgeEntity.findFirst({ where: { id: request.mergedEntityId, workspaceId } }),
    ]);
    if (survivingRow === null || mergedRow === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge entity not found.' },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    let outcome: ReturnType<typeof mergeKnowledgeEntities>;
    const mergeLogId = toEntityMergeLogId(randomUUID());
    try {
      outcome = mergeKnowledgeEntities({
        mergeLogId,
        surviving: toDomainEntity(survivingRow),
        merged: toDomainEntity(mergedRow),
        rationale: request.rationale,
        reversibleUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        decidedBy: actor,
        at: now,
        ...(request.elevatedAuthorityConfirmed ? { elevatedAuthorityConfirmed: true } : {}),
      });
    } catch (error) {
      if (error instanceof InvariantViolation) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }

    const mergeLog = createEntityMergeLog({
      id: mergeLogId,
      organisationId: toOrganisationId(survivingRow.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      survivingEntityId: outcome.survivingEntity.id,
      mergedEntityId: outcome.mergedEntity.id,
      decidedBy: actor,
      decidedAt: now,
      rationale: request.rationale,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const survived = await tx.knowledgeEntity.update({
        where: { id: outcome.survivingEntity.id },
        data: {
          sensitivityClass: outcome.survivingEntity.sensitivityClass,
          version: outcome.survivingEntity.version,
        },
      });
      await tx.knowledgeEntity.update({
        where: { id: outcome.mergedEntity.id },
        data: {
          status: 'merged',
          mergedIntoId: outcome.survivingEntity.id,
          version: outcome.mergedEntity.version,
        },
      });
      await tx.knowledgeEntityMergeLog.create({
        data: {
          id: mergeLog.id,
          organisationId: mergeLog.organisationId,
          workspaceId: mergeLog.workspaceId,
          survivingEntityId: mergeLog.survivingEntityId,
          mergedEntityId: mergeLog.mergedEntityId,
          decidedById: mergeLog.decidedBy.id,
          decidedAt: mergeLog.decidedAt,
          rationale: mergeLog.rationale,
          reversibleUntil: mergeLog.reversibleUntil,
        },
      });
      // Aliases are carried forward onto the surviving entity — never
      // deleted, never rewritten in place (packages/domain/src/entity-alias.ts).
      await tx.entityAlias.updateMany({
        where: { entityId: outcome.mergedEntity.id },
        data: { entityId: outcome.survivingEntity.id },
      });
      for (const evt of outcome.events) {
        await appendAuditEvent(tx, 'knowledge_entity', outcome.survivingEntity.id, evt, now);
      }
      return survived;
    });

    return toView({ ...updated, _count: { aliases: 0 } });
  }
}
