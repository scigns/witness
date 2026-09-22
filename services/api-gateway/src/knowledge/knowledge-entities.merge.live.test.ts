/**
 * Real-PostgreSQL proof of the one seam nothing else in this codebase
 * exercises live: that `KnowledgeEntitiesService.merge()` — a real Prisma
 * transaction, not the fake-Prisma double `knowledge-entities.service.test.ts`
 * uses — actually leaves an `outbox`/`event_log_entry` row shaped exactly
 * the way `workers/graph-projector`'s `fetchPendingOutbox` reads it
 * (`destination = 'graph-projector'`, `event_type` ending
 * `knowledge.entity.merged.v1`, `payload = {survivingEntityId,
 * mergedEntityId}`). `workers/graph-projector/src/graph-integrity.live.test.ts`
 * separately proves that once such an event is picked up, `projectEntityMerge`
 * resolves the graph correctly — this file is deliberately narrower: it
 * proves the two services actually agree on the contract between them,
 * without either package importing the other's code.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL is
 * unreachable — run via `pnpm --filter @witness/api-gateway test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { KnowledgeEntitiesService } from './knowledge-entities.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[knowledge-entities.merge.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[knowledge-entities.merge.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

describe.skipIf(prisma === null)(
  'KnowledgeEntitiesService.merge (live PostgreSQL) — outbox contract',
  () => {
    const db = prisma as PrismaService;
    const organisationId = randomUUID();
    const workspaceId = randomUUID();
    const survivorId = randomUUID();
    const mergedId = randomUUID();

    const principal: Principal = {
      subject: `user:${randomUUID()}`,
      displayName: `Live Merge Test Reviewer ${randomUUID()}`,
      kind: 'human',
      roles: [],
    };

    beforeAll(async () => {
      if (prisma === null) return;
      await db.organisation.create({
        data: {
          id: organisationId,
          name: `merge-live-${organisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: 'Live Merge Workspace', organisationId },
      });
      // `merge()` needs a creator actor for each entity's `createdById`; reuse
      // the principal's actor once resolved by the service itself is not
      // possible before that first call, so create a throwaway one directly.
      const seedActor = await db.actor.create({
        data: { id: randomUUID(), kind: 'human', displayName: 'Live Merge Seed Actor' },
      });
      await db.knowledgeEntity.create({
        data: {
          id: survivorId,
          organisationId,
          workspaceId,
          entityType: 'person',
          canonicalLabel: 'Merge Live Survivor',
          ontologyVersion: '0.1.0',
          createdById: seedActor.id,
        },
      });
      await db.knowledgeEntity.create({
        data: {
          id: mergedId,
          organisationId,
          workspaceId,
          entityType: 'person',
          canonicalLabel: 'Merge Live Merged',
          ontologyVersion: '0.1.0',
          createdById: seedActor.id,
        },
      });
    });

    afterAll(async () => {
      if (prisma === null) return;
      await db.outbox.deleteMany({ where: { event: { organisationId } } });
      await db.eventLogEntry.deleteMany({ where: { organisationId } });
      await db.knowledgeEntityMergeLog.deleteMany({ where: { organisationId } });
      await db.entityAlias.deleteMany({ where: { entity: { organisationId } } });
      await db.knowledgeEntity.deleteMany({ where: { organisationId } });
      await db.workspace.deleteMany({ where: { organisationId } });
      await db.organisation.deleteMany({ where: { id: organisationId } });
      // Actor rows are never deleted by design in this system (they are
      // permanent audit-trail identities — `audit_event.actor_id` and similar
      // FKs are RESTRICT, not CASCADE) — the two throwaway actors this test
      // creates are left behind deliberately, same as any real actor would be.
      await db.$disconnect();
    });

    it('writes an outbox event that fetchPendingOutbox-shaped SQL can find, addressed to graph-projector', async () => {
      const service = new KnowledgeEntitiesService(db);

      await service.merge(
        workspaceId,
        survivorId,
        {
          mergedEntityId: mergedId,
          rationale: 'Live integration test: proving the outbox contract.',
        },
        principal,
      );

      // The exact join `fetchPendingOutbox` (workers/graph-projector/src/postgres-source.ts)
      // performs, reproduced here rather than imported — proving the contract
      // between the two independently-deployed services without either one
      // depending on the other's code.
      const rows = await db.$queryRaw<
        {
          event_type: string;
          aggregate_id: string;
          payload: unknown;
          destination: string;
          status: string;
        }[]
      >`
      SELECT e.event_type, e.aggregate_id, e.payload, o.destination, o.status
      FROM outbox o
      JOIN event_log_entry e ON e.id = o.event_id
      WHERE e.organisation_id = ${organisationId}::uuid
        AND e.event_type = 'org.witness.knowledge.entity.merged.v1'
    `;

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row?.destination).toBe('graph-projector');
      expect(row?.status).toBe('pending');
      expect(row?.aggregate_id).toBe(survivorId);
      expect(row?.payload).toEqual({ survivingEntityId: survivorId, mergedEntityId: mergedId });
    });

    it('the merged entity row is tombstoned (status=merged, merged_into_id set) in the same transaction as the outbox event', async () => {
      const mergedRow = await db.knowledgeEntity.findUniqueOrThrow({ where: { id: mergedId } });
      expect(mergedRow.status).toBe('merged');
      expect(mergedRow.mergedIntoId).toBe(survivorId);
    });
  },
);
