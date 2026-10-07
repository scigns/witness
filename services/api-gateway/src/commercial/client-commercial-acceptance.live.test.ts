/** Service/PostgreSQL acceptance. OIDC, email and browser acceptance are separate release gates. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialEntitlementService } from './commercial-entitlement.service.js';
import { EffectiveCommercialConfigurationService } from './effective-commercial-configuration.service.js';
import { CommercialCatalogueService } from './commercial-catalogue.service.js';
import { CommercialOverrideService } from './commercial-override.service.js';
import { StorageQuotaService } from '../organisations/storage-quota.service.js';
import { OrganisationUsageService } from '../organisations/organisation-usage.service.js';
import { OrganisationsService } from '../organisations/organisations.service.js';
import type { ConsentTemplatesService } from '../consent-templates/consent-templates.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { ManualSettlementService } from '../invoices/manual-settlement.service.js';
import { OperatorController } from '../operator/operator.controller.js';
import { DevelopmentAuthorizationAdapter } from '../authz/development.adapter.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import type { OperatorService } from '../operator/operator.service.js';

describe.skipIf(!process.env.DATABASE_URL)(
  'synthetic client commercial lifecycle (live PostgreSQL)',
  () => {
    const db = new PrismaService();
    const suffix = randomUUID();
    const principal = {
      subject: `user:${randomUUID()}`,
      displayName: `Acceptance operator ${suffix}`,
      kind: 'human' as const,
      roles: [],
    };
    const entitlements = new CommercialEntitlementService(db);
    const configuration = new EffectiveCommercialConfigurationService(db, entitlements);
    const quota = new StorageQuotaService(db, configuration);
    const usage = new OrganisationUsageService(db, quota);
    const commercial = new CommercialCatalogueService(db, entitlements, usage);
    const organisations = new OrganisationsService(db, quota, {
      create: async () => {},
    } as unknown as ConsentTemplatesService);
    const invoices = new InvoicesService(db, {
      billingProfile: {
        legalName: 'Synthetic Witness supplier',
        businessIdentifier: null,
        address: 'Synthetic address',
        email: 'billing@acceptance.example',
        remittance: {
          accountName: 'Synthetic account',
          routingIdentifier: 'TEST',
          accountNumber: 'TEST',
          paymentInstructions: 'Synthetic only',
        },
      },
    } as never);
    const settlements = new ManualSettlementService(db, invoices, commercial);

    beforeAll(async () => {
      if (
        !['localhost', '127.0.0.1', 'postgres'].includes(
          new URL(process.env.DATABASE_URL!).hostname,
        )
      )
        throw new Error('Commercial fixture tests require isolated local/CI PostgreSQL.');
      await db.$connect();
    });
    afterAll(async () => {
      // Retain synthetic immutable financial records and audit chains in the disposable test database.
      // Never disable retention triggers to clean an acceptance run.
      await db.$disconnect();
    });

    it('creates, invoices, settles, resolves entitlements, uploads and exposes operator accounting without SQL origination', async () => {
      const email = `${suffix}@acceptance.example`;
      const org = await organisations.create(
        `Witness Production Acceptance Organisation ${suffix}`,
        email,
        'Synthetic client administrator',
        principal,
      );
      const otherEmail = `other-${suffix}@acceptance.example`;
      const other = await organisations.create(
        `Other acceptance organisation ${suffix}`,
        otherEmail,
        'Other synthetic administrator',
        principal,
      );
      expect((await configuration.resolveFor(org.id)).subscriptionStatus).toBe('FREE');
      await new CommercialOverrideService(db).upsert(
        org.id,
        {
          entitlementKey: 'resource.profile',
          value: 'standard-small',
          reason: 'Synthetic negotiated allocation',
        },
        principal,
      );
      await organisations.setStorageQuota(org.id, 1000, principal);
      const operator = new OperatorController({} as OperatorService, db, commercial);
      const context = await operator.origination(org.id);
      expect((await operator.organisations()).organisations.some((row) => row.id === org.id)).toBe(
        true,
      );
      const plan = context.billing.availablePlans.find((row) => row.code === 'TEAM')!;
      const price = plan.prices.find((row) => row.interval === 'YEARLY' && row.currency === 'AUD')!;
      expect(price.amountMinor).toBeGreaterThan(0);
      const changeRequest = {
        action: 'CHANGE_PLAN' as const,
        planCode: plan.code as 'TEAM',
        billingInterval: 'YEARLY' as const,
        paymentMethod: 'BANK_TRANSFER' as const,
        idempotencyKey: randomUUID(),
      };
      const change = await commercial.requestChange(org.id, changeRequest, principal);
      expect((await commercial.requestChange(org.id, changeRequest, principal)).id).toBe(change.id);
      const issue = {
        idempotencyKey: randomUUID(),
        billingAccountId: context.billingAccount.id,
        commercialChangeRequestId: change.id,
        currency: 'AUD',
        customer: { legalName: org.name, address: 'Synthetic customer address', email },
        customerReference: `Synthetic agreement ${suffix}`,
        dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        lines: [
          {
            description: 'Synthetic paid subscription',
            quantity: '1',
            unitAmountMinor: String(price.amountMinor),
            taxRateBasisPoints: 0,
          },
        ],
      };
      await expect(
        invoices.issue(
          org.id,
          { ...issue, lines: [{ ...issue.lines[0]!, unitAmountMinor: '1' }] },
          principal,
        ),
      ).rejects.toMatchObject({ response: { error: { code: 'INVOICE_PLAN_PRICE_MISMATCH' } } });
      const invoice = await invoices.issue(org.id, issue, principal);
      expect((await invoices.issue(org.id, issue, principal)).id).toBe(invoice.id);
      await expect(invoices.get(other.id, invoice.id)).rejects.toMatchObject({ status: 404 });
      const payment = {
        amountMinor: invoice.totalMinor,
        currency: 'AUD',
        receivedAt: new Date().toISOString(),
        paymentMethod: 'MANUAL_BANK_TRANSFER' as const,
        sourceReference: `Synthetic bank ${suffix}`,
        idempotencyKey: randomUUID(),
      };
      const paid = await settlements.record(org.id, invoice.id, payment, principal);
      const replay = await settlements.record(org.id, invoice.id, payment, principal);
      expect(paid.payment.id).toBeTruthy();
      expect(replay.payment.id).toBe(paid.payment.id);
      expect(replay.receipt.id).toBe(paid.receipt.id);
      expect(await db.payment.count({ where: { organisationId: org.id } })).toBe(1);
      await expect(
        db.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } }),
      ).rejects.toThrow('Issued invoice lines are immutable');
      expect(await db.receipt.count({ where: { invoiceId: invoice.id } })).toBe(1);
      expect((await invoices.get(org.id, invoice.id)).status).toBe('PAID');
      expect(await configuration.resolveFor(org.id)).toMatchObject({
        subscriptionStatus: 'ACTIVE',
        resourceProfile: { code: 'standard-small' },
      });
      const admin = await db.user.findUniqueOrThrow({ where: { email } });
      const customer = {
        ...principal,
        subject: `user:${admin.id}`,
        displayName: admin.displayName,
      };
      const engine = new PolicyEngineService();
      await engine.onModuleInit();
      const policy = new PolicyEnforcementService(
        new DevelopmentAuthorizationAdapter('development'),
        new RoleResolutionService(db),
        engine,
      );
      for (const action of [
        'payment:settle',
        'commercial_override:manage',
        'operator:read',
      ] as const) {
        expect(
          (await policy.decide(customer, action, { type: 'organisation', organisationId: org.id }))
            .allowed,
        ).toBe(false);
      }
      expect(
        (
          await policy.decide(customer, 'organisation:read', {
            type: 'organisation',
            organisationId: other.id,
          })
        ).allowed,
      ).toBe(false);
      const workspace = await new WorkspacesService(db).create(
        'Synthetic client program',
        org.id,
        customer,
      );
      const resources = new ResourcesService(db, null, quota);
      const resource = await resources.createFile(
        workspace.id,
        { title: 'Synthetic evidence resource' },
        {
          originalname: 'acceptance.txt',
          mimetype: 'text/plain',
          size: 700,
          buffer: Buffer.alloc(700),
        },
        customer,
        randomUUID(),
      );
      expect(await quota.usage(org.id)).toMatchObject({
        usedBytes: 700n,
        reservedBytes: 0n,
        availableBytes: 300n,
      });
      expect((await usage.usage(org.id)).programCount).toBe(1);
      expect((await usage.usage(other.id)).storageBytes).toBe('0');
      const otherWorkspace = await new WorkspacesService(db).create(
        'Other program',
        other.id,
        principal,
      );
      await expect(resources.content(otherWorkspace.id, resource.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        resources.createFile(
          workspace.id,
          { title: 'Overflow' },
          {
            originalname: 'overflow.txt',
            mimetype: 'text/plain',
            size: 301,
            buffer: Buffer.alloc(301),
          },
          customer,
        ),
      ).rejects.toMatchObject({ status: 413 });
      expect(
        await db.auditEvent.count({
          where: { subjectId: org.id, action: 'organisation.storage_threshold_crossed' },
        }),
      ).toBe(1);
      expect((await operator.origination(org.id)).billing.invoices[0]).toMatchObject({
        status: 'PAID',
      });
    });
  },
);
