/**
 * Service-level tests for entity create/alias/merge and the read-only merge
 * preview. No prior test file existed for this service — these cover the
 * paths this Phase 3 pass added or exercises directly (merge, previewMerge),
 * plus the create/alias happy path they depend on as fixtures.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { KnowledgeEntitiesService } from './knowledge-entities.service.js';

const CONTRIBUTOR: Principal = {
  subject: 'dev:contributor',
  displayName: 'A Contributor',
  kind: 'human',
  roles: ['contributor'],
};
const STEWARD: Principal = {
  subject: 'dev:steward',
  displayName: 'A Steward',
  kind: 'human',
  roles: ['steward'],
};

const ORG = '00000000-0000-4000-8000-000000000000';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = '22222222-2222-4222-8222-222222222222';

function fakePrisma() {
  const actors: Record<string, unknown>[] = [];
  const entities: Record<string, unknown>[] = [];
  const aliases: Record<string, unknown>[] = [];
  const mergeLogs: Record<string, unknown>[] = [];
  const attributes: Record<string, unknown>[] = [];
  const relationships: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  function actorFor(kind: string, displayName: string) {
    let actor = actors.find((a) => a['kind'] === kind && a['displayName'] === displayName);
    if (actor === undefined) {
      const n = String(actors.length + 1).padStart(12, '0');
      actor = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`, kind, displayName };
      actors.push(actor);
    }
    return actor;
  }

  function aliasCount(entityId: string) {
    return aliases.filter((a) => a['entityId'] === entityId).length;
  }

  const txApi = {
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const found = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return found === undefined ? null : { ...found };
      },
      create: async ({ data }: { data: { id: string; kind: string; displayName: string } }) => {
        const created = actorFor(data.kind, data.displayName);
        return { ...created };
      },
    },
    knowledgeEntity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        entities.push({ ...data });
        return { ...data };
      },
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = entities.find(
          (e) => e['id'] === where.id && e['workspaceId'] === where.workspaceId,
        );
        return row === undefined ? null : { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = entities.findIndex((e) => e['id'] === where.id);
        entities[idx] = { ...entities[idx], ...data };
        return { ...entities[idx] };
      },
    },
    entityAlias: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        aliases.push({ ...data });
        return { ...data };
      },
      count: async ({ where }: { where: { entityId: string } }) => aliasCount(where.entityId),
      updateMany: async ({
        where,
        data,
      }: {
        where: { entityId: string };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const a of aliases) {
          if (a['entityId'] === where.entityId) {
            Object.assign(a, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    knowledgeEntityMergeLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mergeLogs.push({ ...data });
        return { ...data };
      },
    },
    knowledgeEntityAttribute: {
      count: async ({ where }: { where: { entityId: string } }) =>
        attributes.filter((a) => a['entityId'] === where.entityId).length,
    },
    knowledgeRelationship: {
      count: async ({
        where,
      }: {
        where: { OR: Array<{ fromEntityId?: string; toEntityId?: string }> };
      }) =>
        relationships.filter((r) =>
          where.OR.some(
            (clause) =>
              (clause.fromEntityId !== undefined && r['fromEntityId'] === clause.fromEntityId) ||
              (clause.toEntityId !== undefined && r['toEntityId'] === clause.toEntityId),
          ),
        ).length,
    },
    auditEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
  };

  const prisma = {
    ...txApi,
    $transaction: async (fn: (tx: typeof txApi) => Promise<unknown>) => fn(txApi),
  };

  return { prisma, entities, aliases, mergeLogs, attributes, relationships, auditEvents };
}

describe('KnowledgeEntitiesService', () => {
  it('creates an entity', async () => {
    const { prisma, entities } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);

    const view = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );

    expect(view.status).toBe('active');
    expect(entities).toHaveLength(1);
  });

  it('adds an alias to an entity', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const entity = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );

    const alias = await service.addAlias(
      WORKSPACE,
      entity.id,
      { aliasText: 'The Person' },
      CONTRIBUTOR,
    );

    expect(alias.aliasText).toBe('The Person');
  });

  it('merges two active entities, tombstoning the merged one and carrying its aliases forward', async () => {
    const { prisma, entities, aliases, mergeLogs } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);

    const surviving = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'L. Chen' },
      CONTRIBUTOR,
    );
    const merged = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'Minister Chen' },
      CONTRIBUTOR,
    );
    await service.addAlias(WORKSPACE, merged.id, { aliasText: 'Minister Chen' }, CONTRIBUTOR);

    const result = await service.merge(
      WORKSPACE,
      surviving.id,
      { mergedEntityId: merged.id, rationale: 'Same person, confirmed by two evidence items.' },
      STEWARD,
    );

    expect(result.id).toBe(surviving.id);
    const mergedRow = entities.find((e) => e['id'] === merged.id);
    expect(mergedRow?.['status']).toBe('merged');
    expect(mergedRow?.['mergedIntoId']).toBe(surviving.id);
    expect(aliases[0]?.['entityId']).toBe(surviving.id);
    expect(mergeLogs).toHaveLength(1);
  });

  it('refuses to merge an entity into itself', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const entity = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );

    await expect(
      service.merge(WORKSPACE, entity.id, { mergedEntityId: entity.id, rationale: 'x' }, STEWARD),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to merge two community entities without elevated authority confirmation', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const a = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'community', canonicalLabel: 'Group A' },
      CONTRIBUTOR,
    );
    const b = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'community', canonicalLabel: 'Group B' },
      CONTRIBUTOR,
    );

    await expect(
      service.merge(WORKSPACE, a.id, { mergedEntityId: b.id, rationale: 'x' }, STEWARD),
    ).rejects.toThrow(BadRequestException);
  });

  it('previewMerge reports a clean merge as mergeable with accurate carry-over counts, without writing anything', async () => {
    const { prisma, entities, aliases } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const surviving = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'L. Chen' },
      CONTRIBUTOR,
    );
    const merged = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'Minister Chen' },
      CONTRIBUTOR,
    );
    await service.addAlias(WORKSPACE, merged.id, { aliasText: 'Minister Chen' }, CONTRIBUTOR);

    const preview = await service.previewMerge(WORKSPACE, surviving.id, merged.id);

    expect(preview.canMerge).toBe(true);
    expect(preview.blockingReason).toBeNull();
    expect(preview.requiresElevatedAuthority).toBe(false);
    expect(preview.aliasesToCarryOver).toBe(1);
    expect(preview.attributesOnMergedEntity).toBe(0);
    expect(preview.relationshipsOnMergedEntity).toBe(0);

    // Nothing persisted — a preview must never write.
    expect(entities.find((e) => e['id'] === merged.id)?.['status']).toBe('active');
    expect(aliases[0]?.['entityId']).toBe(merged.id);
  });

  it('previewMerge surfaces the elevated-authority requirement as a flag rather than a blocking error', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const person = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'L. Chen' },
      CONTRIBUTOR,
    );
    const community = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'community', canonicalLabel: 'Group A' },
      CONTRIBUTOR,
    );

    const preview = await service.previewMerge(WORKSPACE, person.id, community.id);

    expect(preview.canMerge).toBe(true);
    expect(preview.requiresElevatedAuthority).toBe(true);
  });

  it('previewMerge reports self-merge as blocked with a reason, not an exception', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const entity = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );

    const preview = await service.previewMerge(WORKSPACE, entity.id, entity.id);

    expect(preview.canMerge).toBe(false);
    expect(preview.blockingReason).toMatch(/itself/i);
  });

  it('404s previewMerge when the merged entity is outside the workspace', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const entity = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );

    await expect(service.previewMerge(OTHER_WORKSPACE, entity.id, entity.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to merge with an entity id from another workspace (tenancy: merge cannot cross tenants)', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const surviving = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A. Person' },
      CONTRIBUTOR,
    );
    const foreignEntity = await service.create(
      ORG,
      OTHER_WORKSPACE,
      { entityType: 'person', canonicalLabel: 'A Foreign Person' },
      CONTRIBUTOR,
    );

    // From the surviving entity's workspace, the foreign entity simply does
    // not resolve — `findFirst` is scoped by `{ id, workspaceId }`, so a
    // real id from another tenant is indistinguishable from a made-up one.
    await expect(
      service.merge(
        WORKSPACE,
        surviving.id,
        { mergedEntityId: foreignEntity.id, rationale: 'x' },
        STEWARD,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('merge never rewrites the merged entity’s existing attribute/relationship rows — provenance is preserved by tombstoning, not deleting or repointing', async () => {
    const { prisma, entities, attributes, relationships } = fakePrisma();
    const service = new KnowledgeEntitiesService(prisma as never);
    const surviving = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'L. Chen' },
      CONTRIBUTOR,
    );
    const merged = await service.create(
      ORG,
      WORKSPACE,
      { entityType: 'person', canonicalLabel: 'Minister Chen' },
      CONTRIBUTOR,
    );
    attributes.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      entityId: merged.id,
      attributeKey: 'role',
      attributeValue: 'Minister of Housing',
    });
    relationships.push({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      fromEntityId: merged.id,
      toEntityId: surviving.id,
      relationshipType: 'RAISED_BY',
    });

    await service.merge(
      WORKSPACE,
      surviving.id,
      { mergedEntityId: merged.id, rationale: 'Same person, confirmed by two evidence items.' },
      STEWARD,
    );

    // The attribute and relationship rows still cite the original (now
    // tombstoned) entity id — merge tombstones via `status`/`mergedIntoId`,
    // it never mutates or deletes history-bearing rows.
    expect(attributes[0]?.['entityId']).toBe(merged.id);
    expect(relationships[0]?.['fromEntityId']).toBe(merged.id);
    const mergedRow = entities.find((e) => e['id'] === merged.id);
    expect(mergedRow?.['status']).toBe('merged');
  });
});
