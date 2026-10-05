import { describe, expect, it } from 'vitest';
import { assessProvisioning, type ProvisioningObservation } from './provisioning.port.js';
import { RecordedProvisioningAdapter } from './recorded-provisioning.adapter.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

const desired = {
  deploymentIsolation: 'DEDICATED' as const,
  resourceProfileCode: 'dedicated-institutional',
  configurationFingerprint: 'a'.repeat(64),
};
const ready: ProvisioningObservation = {
  state: 'READY',
  deploymentIsolation: 'DEDICATED',
  resourceProfileCode: desired.resourceProfileCode,
  configurationFingerprint: desired.configurationFingerprint,
  verifiedAt: '2026-10-05T00:00:00Z',
  evidenceReference: 'controlled-acceptance-record',
  detail: 'Verified by deployment adapter.',
};
describe('desired versus observed provisioning', () => {
  it('does not fulfil a dedicated promise from shared infrastructure', () => {
    expect(assessProvisioning(desired, { ...ready, deploymentIsolation: 'SHARED' }).state).toBe(
      'DEGRADED',
    );
  });
  it.each([
    { resourceProfileCode: 'old-profile' },
    { configurationFingerprint: 'b'.repeat(64) },
    { verifiedAt: null },
    { verifiedAt: 'invalid' },
    { evidenceReference: '' },
  ])('rejects incomplete or stale verification %j', (fields) => {
    expect(assessProvisioning(desired, { ...ready, ...fields }).state).toBe('DEGRADED');
  });
  it('accepts only provider evidence matching the contracted allocation', () => {
    expect(assessProvisioning(desired, ready).state).toBe('READY');
  });
  it.each([
    null,
    { provisioningStatus: 'SHARED_INFRASTRUCTURE' },
    { provisioningStatus: 'READY' },
    { provisioningStatus: 'DEDICATED' },
  ])('never turns tenant metadata %j into READY', async (row) => {
    const db = { tenant: { findUnique: async () => row } } as unknown as PrismaService;
    expect((await new RecordedProvisioningAdapter(db).observe('tenant')).state).not.toBe('READY');
  });
});
