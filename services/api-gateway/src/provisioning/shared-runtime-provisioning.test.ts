import { describe, expect, it, vi } from 'vitest';
import type { WitnessConfig } from '@witness/config';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { StoragePort } from '../storage/storage.port.js';
import { SharedRuntimeProvisioningAdapter } from './shared-runtime-provisioning.adapter.js';
import type { ProvisioningRequest } from './provisioning.port.js';

vi.mock('../build-info.js', () => ({ BUILD_INFO: { buildId: 'a'.repeat(40) } }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const desired: ProvisioningRequest = {
  organisationId: id,
  deploymentIsolation: 'SHARED',
  resourceProfileCode: 'standard-small',
  computeClass: 'shared-standard',
  memoryClass: 'shared-standard',
  configurationFingerprint: 'b'.repeat(64),
};
function fixture() {
  const db = {
    organisation: { findUnique: vi.fn().mockResolvedValue({ id, tenantId: null }) },
    $queryRaw: vi.fn().mockResolvedValue([{ database: 'private-db', recovering: false }]),
  };
  const storage = { verifyNamespace: vi.fn().mockResolvedValue(undefined) };
  const config = { profile: 'hybrid', objectStorageEnabled: true } as WitnessConfig;
  const adapter = new SharedRuntimeProvisioningAdapter(
    db as unknown as PrismaService,
    config,
    storage as unknown as StoragePort,
  );
  return { adapter, db, storage };
}
describe('physical shared runtime verification', () => {
  it('requires a serving primary and provider-confirmed organisation namespace', async () => {
    const { adapter, db, storage } = fixture();
    const observed = await adapter.observe(id, desired);
    expect(observed).toMatchObject({
      state: 'READY',
      deploymentIsolation: 'SHARED',
      resourceProfileCode: 'standard-small',
      configurationFingerprint: desired.configurationFingerprint,
    });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(storage.verifyNamespace).toHaveBeenCalledWith(id + '/');
    expect(observed.evidenceReference).toMatch(/^shared-runtime:[a-f0-9]{40}:[a-f0-9]{64}$/);
    expect(observed.evidenceReference).not.toContain('private-db');
  });
  it.each(['DEDICATED', 'SOVEREIGN', 'ISOLATED_DATA'] as const)(
    'never fulfils %s from a shared runtime',
    async (isolation) => {
      const { adapter, db, storage } = fixture();
      expect(
        (await adapter.observe(id, { ...desired, deploymentIsolation: isolation })).state,
      ).toBe('NOT_PROVISIONED');
      expect(db.$queryRaw).not.toHaveBeenCalled();
      expect(storage.verifyNamespace).not.toHaveBeenCalled();
    },
  );
  it('rejects a tenant/organisation mismatch', async () => {
    const { adapter, storage } = fixture();
    expect((await adapter.observe('another-tenant', desired)).state).toBe('NOT_PROVISIONED');
    expect(storage.verifyNamespace).not.toHaveBeenCalled();
  });
  it('does not upgrade an unsupported resource promise', async () => {
    const { adapter } = fixture();
    expect(
      (await adapter.observe(id, { ...desired, resourceProfileCode: 'institutional' })).state,
    ).toBe('NOT_PROVISIONED');
  });
  it('degrades when the database is a recovery replica', async () => {
    const { adapter, db } = fixture();
    db.$queryRaw.mockResolvedValue([{ database: 'private-db', recovering: true }]);
    expect((await adapter.observe(id, desired)).state).toBe('DEGRADED');
  });
  it.each(['database', 'storage'])('fails closed when %s is unavailable', async (dependency) => {
    const { adapter, db, storage } = fixture();
    if (dependency === 'database')
      db.$queryRaw.mockRejectedValue(Error('secret connection string'));
    else storage.verifyNamespace.mockRejectedValue(Error('secret storage credentials'));
    const observed = await adapter.observe(id, desired);
    expect(observed.state).toBe('FAILED');
    expect(JSON.stringify(observed)).not.toContain('secret');
  });
});
