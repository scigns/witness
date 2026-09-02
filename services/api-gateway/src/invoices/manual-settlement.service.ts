import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createManualBankTransferEvidence,
  createManualBankTransferMethod,
  createInvoiceLineItem,
  markInvoicePaid,
  money,
  toInvoiceId,
  toInvoiceLineItemId,
  toOrganisationId,
  toPaymentId,
  toPaymentMethodId,
  verifyPaymentEvidence,
  type Invoice,
} from '@witness/domain';
import type {
  ManualSettlementContextView,
  ManualSettlementRequest,
  ManualSettlementResultView,
} from '@witness/contracts';
import type { Principal } from '../authz/authorization.port.js';
import { CommercialCatalogueService } from '../commercial/commercial-catalogue.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { sha256 } from '../infrastructure/hashing.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { InvoicesService } from './invoices.service.js';

function periodEnd(start: Date, interval: string): Date {
  const end = new Date(start);
  if (interval === 'MONTHLY') end.setUTCMonth(end.getUTCMonth() + 1);
  else if (interval === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else {
    throw new BadRequestException({
      error: { code: 'INVALID_BILLING_INTERVAL', message: 'Paid activation requires an interval.' },
    });
  }
  return end;
}

function invoiceToDomain(row: {
  id: string;
  organisationId: string;
  billingAccountId: string;
  status: string;
  currency: string;
  lines: Array<{
    id: string;
    description: string;
    quantity: bigint;
    unitAmountMinor: bigint;
    taxRateBasisPoints: number;
  }>;
  invoiceNumber: string | null;
  customerReference: string | null;
  purchaseOrderId: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  statusChangedAt: Date;
  statusReason: string | null;
}): Invoice {
  const lines = row.lines.map((line) =>
    createInvoiceLineItem({
      id: toInvoiceLineItemId(line.id),
      description: line.description,
      quantity: line.quantity,
      unitAmount: money(row.currency, line.unitAmountMinor),
      taxRateBasisPoints: line.taxRateBasisPoints,
    }),
  );
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal.amountMinor, 0n);
  const tax = lines.reduce((sum, line) => sum + line.tax.amountMinor, 0n);
  return {
    id: toInvoiceId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    billingAccountId: row.billingAccountId,
    status: row.status as Invoice['status'],
    currency: row.currency,
    lineItems: lines,
    subtotal: money(row.currency, subtotal),
    tax: money(row.currency, tax),
    total: money(row.currency, subtotal + tax),
    invoiceNumber: row.invoiceNumber,
    customerReference: row.customerReference,
    purchaseOrderId: row.purchaseOrderId as Invoice['purchaseOrderId'],
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    statusChangedAt: row.statusChangedAt,
    statusReason: row.statusReason,
  };
}

@Injectable()
export class ManualSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly commercial: CommercialCatalogueService,
  ) {}

  async context(organisationId: string, invoiceId: string): Promise<ManualSettlementContextView> {
    const invoice = await this.invoices.get(organisationId, invoiceId);
    if (invoice.commercialChangeRequestId === null) {
      throw new NotFoundException({
        error: {
          code: 'COMMERCIAL_CHANGE_NOT_FOUND',
          message: 'Invoice has no commercial intent.',
        },
      });
    }
    const change = await this.prisma.commercialChangeRequest.findFirst({
      where: { id: invoice.commercialChangeRequestId, organisationId },
    });
    if (!change || change.requestedPlanCode === null) {
      throw new NotFoundException({
        error: { code: 'COMMERCIAL_CHANGE_NOT_FOUND', message: 'Commercial intent not found.' },
      });
    }
    const catalogue = await this.commercial.catalogue();
    const requestedPlan = catalogue.plans.find((plan) => plan.code === change.requestedPlanCode);
    if (!requestedPlan) {
      throw new NotFoundException({
        error: { code: 'PLAN_NOT_FOUND', message: 'Requested plan is not available.' },
      });
    }
    return {
      invoice,
      commercialChange: {
        id: change.id,
        action: change.action as 'CHANGE_PLAN',
        requestedPlanCode: change.requestedPlanCode as typeof requestedPlan.code,
        billingInterval: change.billingInterval as 'MONTHLY' | 'YEARLY' | null,
        paymentMethod: change.paymentMethod as 'CARD' | 'BANK_TRANSFER' | 'INVOICE' | null,
        status: change.status as ManualSettlementContextView['commercialChange']['status'],
        sourceSubscriptionId: change.sourceSubscriptionId,
        sourceSubscriptionUpdatedAt: change.sourceSubscriptionUpdatedAt.toISOString(),
        effectiveAt: change.effectiveAt?.toISOString() ?? null,
        requestedAt: change.requestedAt.toISOString(),
      },
      requestedPlan,
    };
  }

  async record(
    organisationId: string,
    invoiceId: string,
    request: ManualSettlementRequest,
    principal: Principal,
  ): Promise<ManualSettlementResultView> {
    const verifiedAt = new Date();
    const receivedAt = new Date(request.receivedAt);

    const paymentId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('manual_settlement'), hashtext(${invoiceId}))`;

      // Actor creation is part of the same unit of work: a failed activation
      // must not leave even its audit principal behind as a committed side effect.
      const actor = await resolveActor(tx as PrismaService, principal);

      const replay = await tx.payment.findUnique({
        where: {
          organisationId_settlementIdempotencyKey: {
            organisationId,
            settlementIdempotencyKey: request.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (
          replay.invoiceId !== invoiceId ||
          replay.amountMinor !== BigInt(request.amountMinor) ||
          replay.currency !== request.currency ||
          replay.method !== request.paymentMethod ||
          replay.sourceReference !== request.sourceReference ||
          replay.receivedAt.getTime() !== receivedAt.getTime()
        ) {
          throw new ConflictException({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'The idempotency key was used for different settlement evidence.',
            },
          });
        }
        return replay.id;
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organisationId },
        include: {
          lines: true,
          commercialChangeRequest: { include: { sourceSubscription: true } },
        },
      });
      if (!invoice) {
        throw new NotFoundException({
          error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' },
        });
      }
      const change = invoice.commercialChangeRequest;
      if (
        !change ||
        change.status !== 'PENDING' ||
        change.action !== 'CHANGE_PLAN' ||
        change.requestedPlanCode === null ||
        change.billingInterval === null ||
        change.paymentMethod === null ||
        change.paymentMethod === 'CARD'
      ) {
        throw new BadRequestException({
          error: {
            code: 'COMMERCIAL_CHANGE_NOT_SETTLEABLE',
            message: 'Invoice is not linked to a pending paid institutional plan change.',
          },
        });
      }
      const subscription = change.sourceSubscription;
      if (
        subscription.organisationId !== organisationId ||
        subscription.billingAccountId !== invoice.billingAccountId ||
        subscription.updatedAt.getTime() !== change.sourceSubscriptionUpdatedAt.getTime()
      ) {
        throw new ConflictException({
          error: {
            code: 'STALE_COMMERCIAL_CHANGE',
            message: 'The subscription changed after this commercial request was made.',
          },
        });
      }
      const plan = await tx.plan.findFirst({
        where: { code: change.requestedPlanCode, active: true, quoteBased: false },
      });
      if (!plan) {
        throw new BadRequestException({
          error: { code: 'PLAN_NOT_SETTLEABLE', message: 'Requested plan cannot be activated.' },
        });
      }
      const duplicateEvidence = await tx.payment.findFirst({
        where: {
          organisationId,
          method: request.paymentMethod,
          sourceReference: request.sourceReference,
        },
      });
      if (duplicateEvidence) {
        throw new ConflictException({
          error: {
            code: 'DUPLICATE_PAYMENT_EVIDENCE',
            message: 'This settlement reference has already been recorded.',
          },
        });
      }

      let method = await tx.paymentMethod.findFirst({
        where: {
          organisationId,
          billingAccountId: invoice.billingAccountId,
          type: request.paymentMethod,
        },
      });
      if (!method) {
        method = await tx.paymentMethod.create({
          data: {
            id: randomUUID(),
            organisationId,
            billingAccountId: invoice.billingAccountId,
            type: request.paymentMethod,
          },
        });
      }
      const methodDomain = createManualBankTransferMethod({
        id: toPaymentMethodId(method.id),
        organisationId: toOrganisationId(organisationId),
        billingAccountId: invoice.billingAccountId,
      });
      const evidence = createManualBankTransferEvidence({
        id: toPaymentId(randomUUID()),
        organisationId: toOrganisationId(organisationId),
        billingAccountId: invoice.billingAccountId,
        invoiceId: toInvoiceId(invoice.id),
        paymentMethod: methodDomain,
        sourceReference: request.sourceReference,
        amount: money(request.currency, BigInt(request.amountMinor)),
        receivedAt,
      });
      const verified = verifyPaymentEvidence(evidence, verifiedAt);
      const paidInvoice = markInvoicePaid(invoiceToDomain(invoice), verified, verifiedAt);
      const nextPeriodEnd = periodEnd(verifiedAt, change.billingInterval);

      await tx.payment.create({
        data: {
          id: verified.id,
          organisationId,
          billingAccountId: invoice.billingAccountId,
          invoiceId,
          paymentMethodId: method.id,
          method: verified.method,
          sourceReference: verified.sourceReference,
          settlementIdempotencyKey: request.idempotencyKey,
          amountMinor: verified.amount.amountMinor,
          currency: verified.amount.currency,
          receivedAt: verified.receivedAt,
          status: verified.status,
          statusChangedAt: verified.statusChangedAt,
          verifiedAt: verified.verifiedAt,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: paidInvoice.status,
          paidAt: paidInvoice.paidAt,
          statusChangedAt: paidInvoice.statusChangedAt,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          billingInterval: change.billingInterval,
          currentPeriodStart: verifiedAt,
          currentPeriodEnd: nextPeriodEnd,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.commercialChangeRequest.update({
        where: { id: change.id },
        data: { status: 'APPLIED', effectiveAt: verifiedAt },
      });

      const safeMetadata = {
        organisationId,
        invoiceId,
        paymentId: verified.id,
        commercialChangeRequestId: change.id,
        priorSubscriptionState: subscription.status,
        resultingSubscriptionState: 'ACTIVE',
        priorPlanId: subscription.planId,
        resultingPlanId: plan.id,
        paymentMethod: verified.method,
        sourceReferenceDigest: sha256(verified.sourceReference),
        amountMinor: verified.amount.amountMinor.toString(),
        currency: verified.amount.currency,
        receivedAt: verified.receivedAt.toISOString(),
        effectiveAt: verifiedAt.toISOString(),
      };
      await appendAuditEvent(
        tx,
        'payment',
        verified.id,
        { action: 'payment.settled', actor, metadata: safeMetadata },
        verifiedAt,
      );
      await appendAuditEvent(
        tx,
        'invoice',
        invoiceId,
        { action: 'invoice.paid', actor, metadata: safeMetadata },
        verifiedAt,
      );
      await appendAuditEvent(
        tx,
        'subscription',
        subscription.id,
        { action: 'subscription.activated', actor, metadata: safeMetadata },
        verifiedAt,
      );
      return verified.id;
    });

    const [payment, invoice, overview] = await Promise.all([
      this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      this.invoices.get(organisationId, invoiceId),
      this.commercial.overview(organisationId),
    ]);
    return {
      payment: {
        id: payment.id,
        status: 'VERIFIED',
        method: 'MANUAL_BANK_TRANSFER',
        sourceReference: payment.sourceReference,
        amountMinor: payment.amountMinor.toString(),
        currency: payment.currency,
        receivedAt: payment.receivedAt.toISOString(),
        verifiedAt: payment.verifiedAt!.toISOString(),
      },
      invoice,
      subscription: overview.subscription,
      plan: overview.currentPlan,
      resolvedEntitlements: overview.resolvedEntitlements,
      effectiveAt: payment.verifiedAt!.toISOString(),
    };
  }
}
