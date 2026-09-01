import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  BillingOverview,
  BillingInterval,
  CommercialChangeRequest,
  CommercialChangeView,
  PublicPlan,
  PublicPlanCatalogue,
} from '@witness/contracts';
import type { CommercialChangeRequest as CommercialChangeRow, Prisma } from '@prisma/client';
import { resolveActor } from '../infrastructure/actor.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { OrganisationUsageService } from '../organisations/organisation-usage.service.js';
import { CommercialEntitlementService } from './commercial-entitlement.service.js';

function valueOf(value: unknown): boolean | number | string {
  if (typeof value !== 'object' || value === null || !('value' in value))
    throw new Error('Invalid catalogue entitlement value.');
  const result = (value as { value: unknown }).value;
  if (typeof result !== 'boolean' && typeof result !== 'number' && typeof result !== 'string')
    throw new Error('Invalid catalogue entitlement value.');
  return result;
}

type PlanRow = Prisma.PlanGetPayload<{
  include: {
    prices: true;
    entitlements: { include: { entitlementDefinition: true } };
  };
}>;

function planView(plan: PlanRow): PublicPlan {
  return {
    code: plan.code as PublicPlan['code'],
    name: plan.name,
    description: plan.description,
    quoteBased: plan.quoteBased,
    prices: plan.prices.map((price) => ({
      interval: price.interval as BillingInterval,
      currency: price.currency,
      amountMinor: price.amountMinor,
      startingFrom: price.startingFrom,
    })),
    entitlements: plan.entitlements.map((grant) => ({
      key: grant.entitlementDefinition.key,
      description: grant.entitlementDefinition.description,
      unit: grant.entitlementDefinition.unit,
      value: valueOf(grant.value),
    })),
  };
}

function changeView(change: CommercialChangeRow): CommercialChangeView {
  return {
    id: change.id,
    action: change.action as CommercialChangeView['action'],
    requestedPlanCode: change.requestedPlanCode as CommercialChangeView['requestedPlanCode'],
    billingInterval: change.billingInterval as CommercialChangeView['billingInterval'],
    paymentMethod: change.paymentMethod as CommercialChangeView['paymentMethod'],
    status: 'PENDING',
    sourceSubscriptionId: change.sourceSubscriptionId,
    sourceSubscriptionUpdatedAt: change.sourceSubscriptionUpdatedAt.toISOString(),
    effectiveAt: change.effectiveAt?.toISOString() ?? null,
    requestedAt: change.requestedAt.toISOString(),
  };
}

@Injectable()
export class CommercialCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: CommercialEntitlementService,
    private readonly usage: OrganisationUsageService,
  ) {}

  async catalogue(): Promise<PublicPlanCatalogue> {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      include: {
        prices: { where: { active: true }, orderBy: { interval: 'asc' } },
        entitlements: {
          include: { entitlementDefinition: true },
          orderBy: { entitlementDefinition: { key: 'asc' } },
        },
      },
    });
    return { currency: 'AUD', plans: plans.map(planView) };
  }

  async overview(organisationId: string): Promise<BillingOverview> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organisationId,
        status: { in: ['FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: {
          include: {
            prices: { where: { active: true } },
            entitlements: { include: { entitlementDefinition: true } },
          },
        },
      },
    });
    if (!subscription)
      throw new NotFoundException({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'This organisation has no current subscription.',
        },
      });
    const [catalogue, resolved, usage, pending, invoices] = await Promise.all([
      this.catalogue(),
      this.entitlements.forOrganisation(organisationId),
      this.usage.usage(organisationId),
      this.prisma.commercialChangeRequest.findFirst({
        where: { organisationId, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { organisationId, status: { not: 'DRAFT' } },
        orderBy: { issuedAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      organisationId,
      currentPlan: planView(subscription.plan),
      subscription: {
        status: subscription.status,
        billingInterval: subscription.billingInterval as BillingInterval | null,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      resolvedEntitlements: Array.from(resolved.values()).map((entry) => {
        const catalogueEntry = subscription.plan.entitlements.find(
          (grant) => grant.entitlementDefinition.key === entry.key,
        );
        return {
          key: entry.key,
          description: catalogueEntry?.entitlementDefinition.description ?? entry.key,
          unit: catalogueEntry?.entitlementDefinition.unit ?? null,
          value: entry.value.value,
        };
      }),
      usage,
      availablePlans: catalogue.plans,
      pendingChange: pending ? changeView(pending) : null,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber!,
        status: invoice.status,
        currency: invoice.currency,
        totalMinor: invoice.totalMinor.toString(),
        issuedAt: invoice.issuedAt!.toISOString(),
        dueAt: invoice.dueAt!.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async requestChange(
    organisationId: string,
    request: CommercialChangeRequest,
    principal: Principal,
  ): Promise<CommercialChangeView> {
    const plan =
      request.action === 'CHANGE_PLAN' || request.action === 'REQUEST_QUOTE'
        ? await this.prisma.plan.findUnique({ where: { code: request.planCode } })
        : null;
    if (request.action !== 'CANCEL' && (!plan || !plan.active))
      throw new NotFoundException({
        error: { code: 'PLAN_NOT_FOUND', message: 'That plan is not available.' },
      });
    if (
      (request.action === 'REQUEST_QUOTE' && !plan?.quoteBased) ||
      (request.action === 'CHANGE_PLAN' && plan?.quoteBased)
    )
      throw new BadRequestException({
        error: {
          code: 'INVALID_COMMERCIAL_ACTION',
          message: plan?.quoteBased
            ? 'This plan requires a quote request and cannot be selected as a self-service change.'
            : 'This plan does not use quote requests.',
        },
      });
    const now = new Date();
    const actor = await resolveActor(this.prisma, principal);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('commercial_change_request'), hashtext(${organisationId}))`;
      const existing = await tx.commercialChangeRequest.findUnique({
        where: {
          organisationId_idempotencyKey: { organisationId, idempotencyKey: request.idempotencyKey },
        },
      });
      if (existing) return changeView(existing);
      const account = await tx.billingAccount.findUnique({ where: { organisationId } });
      if (!account)
        throw new NotFoundException({
          error: {
            code: 'BILLING_ACCOUNT_NOT_FOUND',
            message: 'This organisation has no billing account.',
          },
        });
      const subscription = await tx.subscription.findFirst({
        where: {
          organisationId,
          status: { in: ['FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!subscription)
        throw new NotFoundException({
          error: {
            code: 'SUBSCRIPTION_NOT_FOUND',
            message: 'This organisation has no current subscription.',
          },
        });
      if (request.action === 'CANCEL' && subscription.status === 'FREE')
        throw new BadRequestException({
          error: {
            code: 'INVALID_SUBSCRIPTION_CHANGE',
            message: 'The Free plan does not require cancellation.',
          },
        });
      await tx.commercialChangeRequest.updateMany({
        where: { organisationId, status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });
      const created = await tx.commercialChangeRequest.create({
        data: {
          id: randomUUID(),
          organisationId,
          billingAccountId: account.id,
          action: request.action,
          sourceSubscriptionId: subscription.id,
          sourceSubscriptionUpdatedAt: subscription.updatedAt,
          requestedPlanCode:
            request.action === 'CHANGE_PLAN' || request.action === 'REQUEST_QUOTE'
              ? request.planCode
              : null,
          billingInterval: request.action === 'CHANGE_PLAN' ? request.billingInterval : null,
          paymentMethod: request.action === 'CHANGE_PLAN' ? request.paymentMethod : null,
          effectiveAt:
            request.action === 'CANCEL' ||
            (request.action === 'CHANGE_PLAN' && request.planCode === 'FREE')
              ? subscription.currentPeriodEnd
              : null,
          idempotencyKey: request.idempotencyKey,
          requestedById: actor.id,
        },
      });
      await appendAuditEvent(
        tx,
        'subscription',
        subscription.id,
        {
          action: 'subscription.change_requested',
          actor,
          metadata: {
            changeRequestId: created.id,
            action: created.action,
            requestedPlanCode: created.requestedPlanCode ?? '',
            billingInterval: created.billingInterval ?? '',
            paymentMethod: created.paymentMethod ?? '',
          },
        },
        now,
      );
      return changeView(created);
    });
  }
}
