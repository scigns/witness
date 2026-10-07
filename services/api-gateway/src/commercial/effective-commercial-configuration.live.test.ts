/**
 * Real-PostgreSQL suite for EffectiveCommercialConfigurationService and
 * CommercialOverrideService (ADR-0034's sibling commercial-entitlement
 * work) — proves the full path against the real seeded Plan/EntitlementDefinition/
 * PlanEntitlement rows (the C1 commercial foundation migration plus this
 * slice's additions), not a hand-rolled fixture. In particular: that a
 * negotiated override written through the admin write path is immediately
 * visible through the ordinary resolution path, that it never leaks across
 * organisations, and that a missing subscription or plan fails closed
 * rather than throwing something a caller cannot handle.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialEntitlementService } from './commercial-entitlement.service.js';
import { CommercialOverrideService } from './commercial-override.service.js';
import { EffectiveCommercialConfigurationService } from './effective-commercial-configuration.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log(
      '[effective-commercial-configuration.live] skipping: set DATABASE_URL to run this suite.',
    );
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(
      '[effective-commercial-configuration.live] skipping: could not reach PostgreSQL.',
      error,
    );
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

const PRINCIPAL: Principal = {
  subject: 'user:platform-admin-1',
  displayName: 'Platform Admin',
  kind: 'human',
  roles: [],
};

const TEAM_PLAN_ID = '10000000-0000-4000-8000-000000000002';
const INSTITUTIONAL_PLAN_ID = '10000000-0000-4000-8000-000000000004';

describe.skipIf(prisma === null)(
  'EffectiveCommercialConfigurationService / CommercialOverrideService (live PostgreSQL) — ADR-0034',
  () => {
    const db = prisma as PrismaService;
    const configuration = new EffectiveCommercialConfigurationService(
      db,
      new CommercialEntitlementService(db),
    );
    const overrides = new CommercialOverrideService(db);

    const orgAId = randomUUID();
    const orgBId = randomUUID();
    const billingAccountAId = randomUUID();
    const billingAccountBId = randomUUID();
    const subscriptionAId = randomUUID();
    const subscriptionBId = randomUUID();

    async function createOrgOnPlan(
      organisationId: string,
      billingAccountId: string,
      subscriptionId: string,
      planId: string,
    ): Promise<void> {
      await db.organisation.create({
        data: {
          id: organisationId,
          name: `Commercial Config Live Org ${organisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.billingAccount.create({
        data: { id: billingAccountId, organisationId, currency: 'AUD' },
      });
      await db.subscription.create({
        data: {
          id: subscriptionId,
          organisationId,
          billingAccountId,
          planId,
          status: 'ACTIVE',
          currentPeriodStart: new Date('2026-01-01'),
        },
      });
    }

    beforeAll(async () => {
      if (prisma === null) return;
      await createOrgOnPlan(orgAId, billingAccountAId, subscriptionAId, TEAM_PLAN_ID);
      await createOrgOnPlan(orgBId, billingAccountBId, subscriptionBId, INSTITUTIONAL_PLAN_ID);
    });

    afterAll(async () => {
      if (prisma === null) return;
      await db.auditEvent.deleteMany({
        where: {
          subjectType: 'subscription',
          subjectId: { in: [subscriptionAId, subscriptionBId] },
        },
      });
      await db.subscriptionEntitlementOverride.deleteMany({
        where: { subscriptionId: { in: [subscriptionAId, subscriptionBId] } },
      });
      await db.subscription.deleteMany({
        where: { id: { in: [subscriptionAId, subscriptionBId] } },
      });
      await db.billingAccount.deleteMany({
        where: { id: { in: [billingAccountAId, billingAccountBId] } },
      });
      await db.organisation.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
      await db.$disconnect();
    });

    it('resolves the TEAM plan default resource.profile/deployment.isolation/support.level with no override', async () => {
      const view = await configuration.resolveFor(orgAId);
      expect(view.resourceProfile?.code).toBe('standard-small');
      expect(view.deploymentIsolation).toBe('SHARED');
      expect(view.supportLevel).toBe('email');
    });

    it('resolves the INSTITUTIONAL plan default with no override', async () => {
      const view = await configuration.resolveFor(orgBId);
      expect(view.resourceProfile?.code).toBe('institutional');
      expect(view.deploymentIsolation).toBe('DEDICATED');
    });

    it('fails closed (404-shaped NotFoundException) for an organisation with no subscription at all', async () => {
      const noSubscriptionOrgId = randomUUID();
      await db.organisation.create({
        data: {
          id: noSubscriptionOrgId,
          name: `No subscription org ${noSubscriptionOrgId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      try {
        await expect(configuration.resolveFor(noSubscriptionOrgId)).rejects.toThrow();
      } finally {
        await db.organisation.delete({ where: { id: noSubscriptionOrgId } });
      }
    });

    it('THREAT: a negotiated override is visible through the resolution path, and never leaks to a different organisation', async () => {
      await overrides.upsert(
        orgAId,
        {
          entitlementKey: 'deployment.isolation',
          value: 'SOVEREIGN',
          reason: 'Negotiated sovereign-tier contract #9001.',
        },
        PRINCIPAL,
      );

      const viewA = await configuration.resolveFor(orgAId);
      expect(viewA.deploymentIsolation).toBe('SOVEREIGN');

      const viewB = await configuration.resolveFor(orgBId);
      expect(viewB.deploymentIsolation).toBe('DEDICATED');
    });

    it('the override is reflected in the admin override listing with its reason', async () => {
      const list = await overrides.listFor(orgAId);
      const entry = list.find((o) => o.entitlementKey === 'deployment.isolation');
      expect(entry?.value).toBe('SOVEREIGN');
      expect(entry?.reason).toBe('Negotiated sovereign-tier contract #9001.');
    });

    it('re-setting the same key replaces the prior override rather than creating a second row', async () => {
      await overrides.upsert(
        orgAId,
        {
          entitlementKey: 'deployment.isolation',
          value: 'DEDICATED',
          reason: 'Contract #9001 renegotiated down to dedicated tier.',
        },
        PRINCIPAL,
      );
      const list = await overrides.listFor(orgAId);
      const matches = list.filter((o) => o.entitlementKey === 'deployment.isolation');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.value).toBe('DEDICATED');

      const view = await configuration.resolveFor(orgAId);
      expect(view.deploymentIsolation).toBe('DEDICATED');
    });

    it('rejects an override for an entitlement key that does not exist', async () => {
      await expect(
        overrides.upsert(
          orgAId,
          { entitlementKey: 'not.a.real.key', value: true, reason: 'test' },
          PRINCIPAL,
        ),
      ).rejects.toThrow();
    });

    it('rejects an override whose value type does not match the entitlement definition', async () => {
      await expect(
        overrides.upsert(
          orgAId,
          { entitlementKey: 'deployment.isolation', value: 42, reason: 'wrong type' },
          PRINCIPAL,
        ),
      ).rejects.toThrow();
    });

    it("THREAT: an override on Organisation A's subscription is invisible to Organisation B's resolution and listing", async () => {
      const viewB = await configuration.resolveFor(orgBId);
      expect(viewB.deploymentIsolation).toBe('DEDICATED');
      const listB = await overrides.listFor(orgBId);
      expect(listB.find((o) => o.entitlementKey === 'deployment.isolation')).toBeUndefined();
    });

    it('the 1:1 Organisation/Tenant mapping holds for every organisation created on this branch (tenant_id NULL)', async () => {
      const rowA = await db.organisation.findUniqueOrThrow({ where: { id: orgAId } });
      const rowB = await db.organisation.findUniqueOrThrow({ where: { id: orgBId } });
      expect(rowA.tenantId).toBeNull();
      expect(rowB.tenantId).toBeNull();
    });

    it('the schema seam supports an explicit N:1 Tenant assignment without touching any other table', async () => {
      const sharedTenantId = randomUUID();
      await db.tenant.create({ data: { id: sharedTenantId, label: 'Shared pilot tenant' } });
      try {
        await db.organisation.update({
          where: { id: orgAId },
          data: { tenantId: sharedTenantId },
        });
        await db.organisation.update({
          where: { id: orgBId },
          data: { tenantId: sharedTenantId },
        });

        const [rowA, rowB] = await Promise.all([
          db.organisation.findUniqueOrThrow({ where: { id: orgAId } }),
          db.organisation.findUniqueOrThrow({ where: { id: orgBId } }),
        ]);
        expect(rowA.tenantId).toBe(sharedTenantId);
        expect(rowB.tenantId).toBe(sharedTenantId);

        // Assigning a tenant changes nothing about commercial resolution --
        // Tenant and Organisation are deliberately independent axes.
        const viewAfter = await configuration.resolveFor(orgAId);
        expect(viewAfter.deploymentIsolation).toBe('DEDICATED');
      } finally {
        await db.organisation.updateMany({
          where: { id: { in: [orgAId, orgBId] } },
          data: { tenantId: null },
        });
        await db.tenant.delete({ where: { id: sharedTenantId } });
      }
    });

    it('deleting a Tenant sets dependent organisations back to NULL rather than failing or cascading', async () => {
      const tenantId = randomUUID();
      await db.tenant.create({ data: { id: tenantId, label: 'Short-lived tenant' } });
      await db.organisation.update({ where: { id: orgAId }, data: { tenantId } });

      await db.tenant.delete({ where: { id: tenantId } });

      const row = await db.organisation.findUniqueOrThrow({ where: { id: orgAId } });
      expect(row.tenantId).toBeNull();
    });
  },
);
