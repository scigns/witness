import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { toActorId } from '@witness/domain';
import type { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { StorageQuotaService } from './storage-quota.service.js';
import { StorageReconciliationService } from './storage-reconciliation.service.js';
import type { StoragePort } from '../storage/storage.port.js';
import { ResourcesService } from '../resources/resources.service.js';

describe.skipIf(!process.env.DATABASE_URL)('durable reservations (live PostgreSQL)', () => {
  const db = new PrismaService();
  const quota = new StorageQuotaService(db, {} as EffectiveCommercialConfigurationService);
  const org = randomUUID();
  const other = randomUUID();
  const workspace = randomUUID();
  const user = randomUUID();
  const actor = {
    id: toActorId(randomUUID()),
    kind: 'human' as const,
    displayName: `Acceptance ${org}`,
  };
  const principal = {
    subject: `user:${user}`,
    kind: 'human' as const,
    displayName: actor.displayName,
    roles: [],
  };
  const reconcile = new StorageReconciliationService(db, null, quota);
  const reserve = (
    sizeBytes = 600,
    requestKey = randomUUID(),
    requestFingerprint = 'a'.repeat(64),
  ) =>
    quota.reserve({
      organisationId: org,
      requestKey,
      requestFingerprint,
      kind: 'resource',
      sizeBytes,
      objectStorage: false,
      actor,
    });
  beforeAll(async () => {
    await db.$connect();
    await db.actor.create({ data: actor });
    await db.organisation.createMany({
      data: [org, other].map((id) => ({
        id,
        name: `Synthetic acceptance ${id}`,
        storageQuotaBytes: 1000n,
      })),
    });
    await db.workspace.create({ data: { id: workspace, name: 'Acceptance', organisationId: org } });
    await db.user.create({
      data: {
        id: user,
        email: `${user}@acceptance.example`,
        displayName: actor.displayName,
        accountState: 'active',
      },
    });
  });
  beforeEach(async () => {
    await db.resource.deleteMany({ where: { workspaceId: workspace } });
    await db.storageReservation.deleteMany({ where: { organisationId: org } });
  });
  afterAll(async () => {
    await db.resource.deleteMany({ where: { workspaceId: workspace } });
    await db.storageReservation.deleteMany({ where: { organisationId: org } });
    await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await db.workspace.deleteMany({ where: { id: workspace } });
    await db.user.deleteMany({ where: { id: user } });
    await db.organisation.deleteMany({ where: { id: { in: [org, other] } } });
    await db.actor.delete({ where: { id: actor.id } });
    await db.$disconnect();
  });
  it('serialises simultaneous capacity reservations before any provider write', async () => {
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'STORAGE_QUOTA_EXCEEDED' },
    });
    expect(await quota.usage(org)).toMatchObject({
      usedBytes: 0n,
      reservedBytes: 600n,
      availableBytes: 400n,
    });
    expect(await quota.usage(other)).toMatchObject({ usedBytes: 0n, reservedBytes: 0n });
  });
  it('does not reserve twice for a duplicate in-flight request or changed payload', async () => {
    const key = randomUUID();
    await reserve(600, key);
    await expect(reserve(600, key)).rejects.toMatchObject({
      response: { error: { code: 'UPLOAD_IN_PROGRESS' } },
    });
    await expect(reserve(600, key, 'b'.repeat(64))).rejects.toMatchObject({
      response: { error: { code: 'IDEMPOTENCY_CONFLICT' } },
    });
    expect((await quota.usage(org)).reservedBytes).toBe(600n);
  });
  it('atomically replaces reserved bytes with committed bytes and replays a completed request', async () => {
    const key = randomUUID();
    const reservation = await reserve(600, key);
    await quota.claim(reservation);
    await db.$transaction(async (tx) => {
      await quota.checkReservation(tx, reservation, actor, new Date());
      await tx.resource.create({
        data: {
          id: reservation.targetId,
          workspaceId: workspace,
          title: 'Synthetic bytes',
          resourceType: 'file',
          sizeBytes: 600,
          content: Buffer.alloc(600),
          uploadedById: user,
        },
      });
      await quota.commitReservation(tx, reservation);
    });
    expect(await quota.usage(org)).toMatchObject({
      usedBytes: 600n,
      reservedBytes: 0n,
      availableBytes: 400n,
    });
    expect(await reserve(600, key)).toMatchObject({ id: reservation.id, state: 'COMMITTED' });
    expect(await reconcile.inspect(org, principal)).toMatchObject({
      discrepancies: [],
      repairsPerformed: 0,
    });
  });
  it('retains capacity on database rollback and unknown provider outcome', async () => {
    const reservation = await reserve();
    await quota.claim(reservation);
    await expect(
      db.$transaction(async (tx) => {
        await quota.checkReservation(tx, reservation, actor, new Date());
        await quota.commitReservation(tx, reservation);
        throw new Error('simulate crash before commit');
      }),
    ).rejects.toThrow('simulate crash');
    await quota.markUncertain(reservation);
    expect(await quota.usage(org)).toMatchObject({ usedBytes: 0n, reservedBytes: 600n });
    await expect(reserve()).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
  });
  it('releases an expired never-started lease but fences an expired writer without freeing its bytes', async () => {
    const neverStarted = await reserve(400);
    const writing = await reserve(600);
    await quota.claim(writing);
    await db.storageReservation.updateMany({
      where: { organisationId: org },
      data: { expiresAt: new Date(0) },
    });
    expect(await reconcile.cleanExpired(org, principal)).toEqual({
      releasedNeverStarted: 1,
      retainedUncertain: 1,
      objectsDeleted: 0,
    });
    await expect(quota.claim(neverStarted)).rejects.toMatchObject({
      response: { error: { code: 'RESERVATION_NOT_WRITABLE' } },
    });
    await expect(
      db.$transaction((tx) => quota.checkReservation(tx, writing, actor, new Date())),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_WRITABLE' });
    expect((await quota.usage(org)).reservedBytes).toBe(600n);
    expect(await reconcile.inspect(org, principal)).toMatchObject({
      discrepancies: [{ code: 'STUCK_RESERVATION', reference: writing.id }],
    });
  });
  it('releases a proven failed write once without creating negative accounting', async () => {
    const reservation = await reserve();
    await quota.claim(reservation);
    await quota.releaseKnownFailure(reservation, actor);
    await quota.releaseKnownFailure(reservation, actor);
    expect((await quota.usage(org)).reservedBytes).toBe(0n);
    expect(await reserve(1000)).toMatchObject({ sizeBytes: 1000n });
  });
  it('reports orphan objects without deleting customer data', async () => {
    const key = `${org}/resource/${randomUUID()}`;
    let deletes = 0;
    const storage = {
      list: async () => ({ objects: [{ key, sizeBytes: 7 }], cursor: null }),
      head: async () => null,
      delete: async () => {
        deletes++;
      },
    } as unknown as StoragePort;
    const report = await new StorageReconciliationService(db, storage, quota).inspect(
      org,
      principal,
    );
    expect(report).toMatchObject({
      objectStorageBytes: '7',
      discrepancies: [{ code: 'ORPHAN_OBJECT', reference: key }],
      repairsPerformed: 0,
    });
    expect(deletes).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { subjectId: org, action: 'organisation.storage_reconciled' },
      }),
    ).toBeGreaterThan(0);
  });

  it('enforces capacity through the complete resource upload path and replays without a second object write', async () => {
    const objects = new Map<string, Buffer>();
    let puts = 0;
    const storage = {
      put: async (key: string, bytes: Buffer) => {
        puts++;
        objects.set(key, bytes);
      },
      delete: async (key: string) => {
        objects.delete(key);
      },
    } as unknown as StoragePort;
    const service = new ResourcesService(db, storage, quota);
    const key = randomUUID();
    const file = {
      originalname: 'acceptance.txt',
      mimetype: 'text/plain',
      size: 600,
      buffer: Buffer.alloc(600),
    };
    const results = await Promise.allSettled([
      service.createFile(workspace, { title: 'Acceptance' }, file, principal, key),
      service.createFile(workspace, { title: 'Competing' }, file, principal, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const successful = results.find((r) => r.status === 'fulfilled');
    // The first reservation enters the database queue first, but do not assume scheduler ordering.
    const completed = await db.storageReservation.findFirstOrThrow({
      where: { organisationId: org, state: 'COMMITTED' },
    });
    const title = completed.requestKey === key ? 'Acceptance' : 'Competing';
    const replay = await service.createFile(
      workspace,
      { title },
      file,
      principal,
      completed.requestKey,
    );
    expect(successful).toMatchObject({ status: 'fulfilled', value: { id: replay.id } });
    expect(puts).toBe(1);
    expect(objects.size).toBe(1);
    expect(await quota.usage(org)).toMatchObject({ usedBytes: 600n, reservedBytes: 0n });
  });

  it('preserves objects and charges capacity when a storage provider reports an uncertain failure', async () => {
    const objects = new Map<string, Buffer>();
    const storage = {
      put: async (key: string, bytes: Buffer) => {
        objects.set(key, bytes);
        throw new Error('provider timeout after write');
      },
      delete: async () => {
        throw new Error('must not delete uncertain write');
      },
    } as unknown as StoragePort;
    const service = new ResourcesService(db, storage, quota);
    await expect(
      service.createFile(
        workspace,
        { title: 'Acceptance' },
        { originalname: 'test.txt', mimetype: 'text/plain', size: 600, buffer: Buffer.alloc(600) },
        principal,
      ),
    ).rejects.toThrow('provider timeout');
    expect(objects.size).toBe(1);
    expect(await quota.usage(org)).toMatchObject({ usedBytes: 0n, reservedBytes: 600n });
    expect(await db.storageReservation.findFirst({ where: { organisationId: org } })).toMatchObject(
      { state: 'NEEDS_RECONCILIATION' },
    );
  });

  it('preserves provider bytes when the application cannot establish the transaction outcome', async () => {
    let puts = 0;
    let deletes = 0;
    const storage = {
      put: async () => {
        puts++;
      },
      delete: async () => {
        deletes++;
      },
    } as unknown as StoragePort;
    const failingDb = new Proxy(db, {
      get(target, property) {
        if (property === '$transaction')
          return async () => {
            throw new Error('database connection lost');
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const service = new ResourcesService(failingDb, storage, quota);
    await expect(
      service.createFile(
        workspace,
        { title: 'Acceptance' },
        { originalname: 'test.txt', mimetype: 'text/plain', size: 600, buffer: Buffer.alloc(600) },
        principal,
      ),
    ).rejects.toThrow('database connection lost');
    expect(puts).toBe(1);
    expect(deletes).toBe(0);
    expect(await quota.usage(org)).toMatchObject({ usedBytes: 0n, reservedBytes: 600n });
  });
});
