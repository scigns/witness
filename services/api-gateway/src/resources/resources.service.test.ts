/**
 * Service-level tests for `ResourcesService.remove()` — the one method this
 * file's storage-backend fix touches. Not a full-service test suite (see
 * `evidence-attachment.service.test.ts` for that pattern applied to
 * `createFile`/`content`); this exists specifically to pin the ordering that
 * closed the R2 orphan-on-delete bug found live on witness-prod-01: a
 * resource whose bytes live in object storage must have that object deleted
 * before the row disappears, and a storage delete failure must leave the row
 * (and the object) intact rather than committing a pointer to nothing.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import type { StoragePort } from '../storage/storage.port.js';
import type { StorageQuotaService } from '../organisations/storage-quota.service.js';
import { ResourcesService } from './resources.service.js';

const UPLOADER: Principal = {
  subject: 'user:44444444-4444-4444-8444-444444444444',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const RESOURCE_R2 = '55555555-5555-4555-8555-555555555555';
const RESOURCE_INLINE = '56666666-6666-4666-8666-666666666666';

function fakePrisma(rows: Record<string, unknown>[]) {
  const resource = {
    findUnique: vi.fn(
      async ({ where: { id } }: { where: { id: string } }) =>
        rows.find((r) => r['id'] === id) ?? null,
    ),
    delete: vi.fn(async () => undefined),
  };
  const actor = {
    findFirst: vi.fn(async () => ({
      id: '99999999-9999-4999-8999-999999999999',
      kind: 'human',
      displayName: 'A Facilitator',
    })),
  };
  const auditEvent = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => undefined),
  };

  const tx = { resource, auditEvent };

  return {
    resource,
    workspace: { findUnique: vi.fn(async () => ({ organisationId: 'org-1' })) },
    actor,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService;
}

function fakeStorage(): StoragePort & {
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  } as unknown as StoragePort & { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
}

const NOOP_QUOTA = {} as StorageQuotaService;

function baseRow(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    workspaceId: WORKSPACE_1,
    sessionId: null,
    agendaItemId: null,
    title: 'A resource',
    description: null,
    resourceType: 'file',
    originalFilename: 'file.txt',
    contentType: 'text/plain',
    sizeBytes: 10,
    externalUrl: null,
    uploadedById: '44444444-4444-4444-8444-444444444444',
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    uploadedBy: { displayName: 'A Facilitator' },
    ...overrides,
  };
}

describe('ResourcesService.remove', () => {
  it('deletes the R2 object before deleting the row, for a storage-backed resource', async () => {
    const row = baseRow(RESOURCE_R2, { content: null, storageKey: 'org-1/resource/r2-key' });
    const prisma = fakePrisma([row]);
    const storage = fakeStorage();
    const service = new ResourcesService(prisma, storage, NOOP_QUOTA);

    await service.remove(WORKSPACE_1, RESOURCE_R2, UPLOADER);

    expect(storage.delete).toHaveBeenCalledWith('org-1/resource/r2-key');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('never calls storage.delete for a Postgres-inline resource', async () => {
    const row = baseRow(RESOURCE_INLINE, { content: Buffer.from('hi'), storageKey: null });
    const prisma = fakePrisma([row]);
    const storage = fakeStorage();
    const service = new ResourcesService(prisma, storage, NOOP_QUOTA);

    await service.remove(WORKSPACE_1, RESOURCE_INLINE, UPLOADER);

    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('leaves the row intact if the storage delete fails, rather than orphaning the object', async () => {
    const row = baseRow(RESOURCE_R2, { content: null, storageKey: 'org-1/resource/r2-key' });
    const prisma = fakePrisma([row]);
    const storage = fakeStorage();
    storage.delete.mockRejectedValueOnce(new Error('R2 unavailable'));
    const service = new ResourcesService(prisma, storage, NOOP_QUOTA);

    await expect(service.remove(WORKSPACE_1, RESOURCE_R2, UPLOADER)).rejects.toThrow(
      'R2 unavailable',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
