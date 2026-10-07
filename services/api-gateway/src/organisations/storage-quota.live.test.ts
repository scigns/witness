import { toActorId } from '@witness/domain';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { StorageQuotaService } from './storage-quota.service.js';

// Explicitly opt in; an unreachable configured database is a test failure.
const configured = Boolean(process.env.DATABASE_URL);
describe.skipIf(!configured)('storage quota (live PostgreSQL)', () => {
  const db = new PrismaService();
  const quota = new StorageQuotaService(db, {} as EffectiveCommercialConfigurationService);
  const organisationId = randomUUID();
  const otherOrganisationId = randomUUID();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const actor = {
    id: toActorId(randomUUID()),
    kind: 'human' as const,
    displayName: 'Quota uploader',
  };

  beforeAll(async () => {
    await db.$connect();
    await db.actor.create({ data: actor });
    await db.organisation.createMany({
      data: [organisationId, otherOrganisationId].map((id) => ({
        id,
        name: `Quota concurrency ${id}`,
        storageQuotaBytes: 1000n,
      })),
    });
    await db.workspace.create({ data: { id: workspaceId, name: 'Quota test', organisationId } });
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@quota.example`,
        displayName: 'Quota test',
        accountState: 'active',
      },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({
      where: { subjectType: 'organisation', subjectId: organisationId },
    });
    await db.actor.deleteMany({ where: { id: actor.id } });
    await db.resource.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organisation.deleteMany({
      where: { id: { in: [organisationId, otherOrganisationId] } },
    });
    await db.$disconnect();
  });

  function data(bytes: number) {
    return {
      id: randomUUID(),
      workspaceId,
      title: 'Quota file',
      resourceType: 'file',
      originalFilename: 'quota.bin',
      contentType: 'application/octet-stream',
      sizeBytes: bytes,
      content: Buffer.alloc(bytes),
      uploadedById: userId,
    };
  }

  it('rejects one of two competing writes that both passed preflight', async () => {
    await Promise.all([
      quota.checkQuota(organisationId, 600),
      quota.checkQuota(organisationId, 600),
    ]);
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        db.$transaction(async (tx) => {
          await quota.lockForWrite(tx, organisationId);
          await quota.checkQuotaInTransaction(tx, organisationId, 600);
          await tx.resource.create({ data: data(600) });
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'STORAGE_QUOTA_EXCEEDED' },
    });
    expect((await quota.usage(organisationId)).usedBytes).toBe(600n);
    expect((await quota.usage(otherOrganisationId)).usedBytes).toBe(0n);
  });

  it('releases capacity and the advisory lock after a failed transaction', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await quota.lockForWrite(tx, organisationId);
        await quota.checkQuotaInTransaction(tx, organisationId, 400, actor);
        await tx.resource.create({ data: data(400) });
        throw new Error('abort test upload');
      }),
    ).rejects.toThrow('abort test upload');
    expect(
      await db.auditEvent.count({
        where: { subjectId: organisationId, action: 'organisation.storage_threshold_crossed' },
      }),
    ).toBe(0);
    await db.$transaction(async (tx) => {
      await quota.lockForWrite(tx, organisationId);
      await quota.checkQuotaInTransaction(tx, organisationId, 400, actor);
      await tx.resource.create({ data: data(400) });
    });
    expect((await quota.usage(organisationId)).usedBytes).toBe(1000n);
    expect(
      await db.auditEvent.count({
        where: { subjectId: organisationId, action: 'organisation.storage_threshold_crossed' },
      }),
    ).toBe(4);
  });
});
