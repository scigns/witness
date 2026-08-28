import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  createDraftInvoice,
  createInvoiceLineItem,
  createInvoiceSnapshot,
  issueInvoice,
  money,
  toInvoiceId,
  toInvoiceLineItemId,
  toOrganisationId,
  toPurchaseOrderId,
} from '@witness/domain';
import type { IssueInvoiceRequest, InvoiceRenderView, InvoiceView } from '@witness/contracts';
import type { WitnessConfig } from '@witness/config';
import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { WITNESS_CONFIG } from '../tokens.js';

type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: { lines: true } }>;
type InvoiceWithRender = Prisma.InvoiceGetPayload<{
  include: { lines: true; remittanceSnapshot: true };
}>;

function requiredSnapshot(value: string | null, field: string): string {
  if (value === null || value.length === 0)
    throw new Error(`Persisted invoice is missing ${field}.`);
  return value;
}

function sameIssuanceRequest(row: InvoiceWithLines, request: IssueInvoiceRequest): boolean {
  const customer = {
    legalName: request.customer.legalName,
    businessIdentifier: request.customer.businessIdentifier ?? null,
    address: request.customer.address,
    email: request.customer.email ?? null,
  };
  const requestedDueAt = new Date(request.dueAt).getTime();
  return (
    row.billingAccountId === request.billingAccountId &&
    row.currency === request.currency &&
    row.supplierLegalNameSnapshot !== null &&
    row.supplierAddressSnapshot !== null &&
    row.supplierBillingEmailSnapshot !== null &&
    row.customerLegalNameSnapshot === customer.legalName &&
    row.customerBusinessIdentifierSnapshot === customer.businessIdentifier &&
    row.customerAddressSnapshot === customer.address &&
    row.customerBillingEmailSnapshot === customer.email &&
    row.customerReference === (request.customerReference ?? null) &&
    row.purchaseOrderId === (request.purchaseOrderId ?? null) &&
    row.dueAt?.getTime() === requestedDueAt &&
    row.lines.length === request.lines.length &&
    row.lines.every((line, index) => {
      const requested = request.lines[index]!;
      return (
        line.description === requested.description &&
        line.quantity === BigInt(requested.quantity) &&
        line.unitAmountMinor === BigInt(requested.unitAmountMinor) &&
        line.taxRateBasisPoints === requested.taxRateBasisPoints
      );
    })
  );
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    error: {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'The idempotency key was already used for a different invoice request.',
    },
  });
}

function toView(row: InvoiceWithLines | InvoiceWithRender): InvoiceView {
  if (!row.invoiceNumber || !row.issuedAt || !row.dueAt)
    throw new Error('Persisted invoice is incomplete.');
  return {
    id: row.id,
    organisationId: row.organisationId,
    billingAccountId: row.billingAccountId,
    status: row.status,
    currency: row.currency,
    invoiceNumber: row.invoiceNumber,
    customerReference: row.customerReference,
    purchaseOrderId: row.purchaseOrderId,
    supplier: {
      legalName: requiredSnapshot(row.supplierLegalNameSnapshot, 'supplier legal name'),
      businessIdentifier: row.supplierBusinessIdentifierSnapshot,
      address: requiredSnapshot(row.supplierAddressSnapshot, 'supplier address'),
      email: requiredSnapshot(row.supplierBillingEmailSnapshot, 'supplier billing email'),
    },
    customer: {
      legalName: requiredSnapshot(row.customerLegalNameSnapshot, 'customer legal name'),
      businessIdentifier: row.customerBusinessIdentifierSnapshot,
      address: requiredSnapshot(row.customerAddressSnapshot, 'customer address'),
      email: row.customerBillingEmailSnapshot,
    },
    lines: row.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      unitAmountMinor: line.unitAmountMinor.toString(),
      taxRateBasisPoints: line.taxRateBasisPoints,
      subtotalMinor: line.subtotalMinor.toString(),
      taxMinor: line.taxMinor.toString(),
      totalMinor: line.totalMinor.toString(),
    })),
    subtotalMinor: row.subtotalMinor.toString(),
    taxMinor: row.taxMinor.toString(),
    totalMinor: row.totalMinor.toString(),
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WITNESS_CONFIG) private readonly config: WitnessConfig,
  ) {}

  async issue(
    organisationId: string,
    request: IssueInvoiceRequest,
    principal: Principal,
  ): Promise<InvoiceView> {
    const profile = this.config.billingProfile;
    if (profile === null)
      throw new ServiceUnavailableException({
        error: {
          code: 'BILLING_UNAVAILABLE',
          message: 'Invoice issuance is not configured for this deployment.',
        },
      });
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { organisationId, issuanceIdempotencyKey: request.idempotencyKey },
          include: { lines: true },
        });
        if (existing) {
          if (!sameIssuanceRequest(existing, request)) throw idempotencyConflict();
          return toView(existing);
        }
        const account = await tx.billingAccount.findFirst({
          where: { id: request.billingAccountId, organisationId },
        });
        if (!account)
          throw new NotFoundException({
            error: { code: 'BILLING_ACCOUNT_NOT_FOUND', message: 'Billing account not found.' },
          });
        if (account.currency !== request.currency)
          throw new BadRequestException({
            error: {
              code: 'CURRENCY_MISMATCH',
              message: 'Invoice currency does not match the billing account.',
            },
          });
        const purchaseOrder = request.purchaseOrderId
          ? await tx.purchaseOrder.findFirst({
              where: { id: request.purchaseOrderId, organisationId, billingAccountId: account.id },
            })
          : null;
        if (request.purchaseOrderId && !purchaseOrder)
          throw new BadRequestException({
            error: {
              code: 'PURCHASE_ORDER_NOT_FOUND',
              message: 'Purchase order not found for this organisation.',
            },
          });
        const organisation = await tx.organisation.findUnique({ where: { id: organisationId } });
        if (!organisation)
          throw new NotFoundException({
            error: { code: 'ORGANISATION_NOT_FOUND', message: 'Organisation not found.' },
          });
        const id = randomUUID();
        const lines = request.lines.map((line) =>
          createInvoiceLineItem({
            id: toInvoiceLineItemId(randomUUID()),
            description: line.description,
            quantity: BigInt(line.quantity),
            unitAmount: money(request.currency, BigInt(line.unitAmountMinor)),
            taxRateBasisPoints: line.taxRateBasisPoints,
          }),
        );
        const draft = createDraftInvoice({
          id: toInvoiceId(id),
          organisationId: toOrganisationId(organisationId),
          billingAccountId: account.id,
          currency: request.currency,
          lineItems: lines,
          customerReference: request.customerReference ?? null,
          purchaseOrderId: request.purchaseOrderId
            ? toPurchaseOrderId(request.purchaseOrderId)
            : null,
          at: now,
        });
        const snapshot = createInvoiceSnapshot({
          supplier: {
            legalName: profile.legalName,
            businessIdentifier: profile.businessIdentifier,
            billingAddress: profile.address,
            billingEmail: profile.email,
          },
          customer: {
            legalName: request.customer.legalName,
            businessIdentifier: request.customer.businessIdentifier ?? null,
            billingAddress: request.customer.address,
            billingEmail: request.customer.email ?? null,
          },
          remittance: profile.remittance,
        });
        const numberRows = await tx.$queryRaw<
          Array<{ allocate_invoice_number: string }>
        >`SELECT "allocate_invoice_number"(${organisationId}::uuid)`;
        const issued = issueInvoice({
          invoice: draft,
          invoiceNumber: numberRows[0]!.allocate_invoice_number,
          issuedAt: now,
          dueAt: new Date(request.dueAt),
          purchaseOrder: purchaseOrder
            ? {
                id: toPurchaseOrderId(purchaseOrder.id),
                organisationId: toOrganisationId(purchaseOrder.organisationId),
                billingAccountId: purchaseOrder.billingAccountId,
                customerReference: purchaseOrder.customerReference,
                status: purchaseOrder.status as 'DRAFT' | 'AUTHORISED' | 'CANCELLED',
                authorisedAmount: money(purchaseOrder.currency, purchaseOrder.authorisedAmount),
                validFrom: purchaseOrder.validFrom,
                validUntil: purchaseOrder.validUntil,
              }
            : null,
        });
        await tx.invoice.create({
          data: {
            id,
            organisationId,
            billingAccountId: account.id,
            status: issued.status,
            currency: issued.currency,
            invoiceNumber: issued.invoiceNumber,
            issuanceIdempotencyKey: request.idempotencyKey,
            customerReference: issued.customerReference,
            purchaseOrderId: issued.purchaseOrderId,
            subtotalMinor: issued.subtotal.amountMinor,
            taxMinor: issued.tax.amountMinor,
            totalMinor: issued.total.amountMinor,
            issuedAt: issued.issuedAt,
            dueAt: issued.dueAt,
            statusChangedAt: issued.statusChangedAt,
            supplierLegalNameSnapshot: snapshot.supplier.legalName,
            supplierBusinessIdentifierSnapshot: snapshot.supplier.businessIdentifier,
            supplierAddressSnapshot: snapshot.supplier.billingAddress,
            supplierBillingEmailSnapshot: snapshot.supplier.billingEmail,
            customerLegalNameSnapshot: snapshot.customer.legalName,
            customerBusinessIdentifierSnapshot: snapshot.customer.businessIdentifier,
            customerAddressSnapshot: snapshot.customer.billingAddress,
            customerBillingEmailSnapshot: snapshot.customer.billingEmail,
            lines: {
              create: issued.lineItems.map((line) => ({
                id: line.id,
                organisationId,
                description: line.description,
                currency: line.total.currency,
                quantity: line.quantity,
                unitAmountMinor: line.unitAmount.amountMinor,
                taxRateBasisPoints: line.taxRateBasisPoints,
                subtotalMinor: line.subtotal.amountMinor,
                taxMinor: line.tax.amountMinor,
                totalMinor: line.total.amountMinor,
              })),
            },
            remittanceSnapshot: {
              create: {
                id: randomUUID(),
                accountName: snapshot.remittance.accountName,
                routingIdentifier: snapshot.remittance.routingIdentifier,
                accountNumber: snapshot.remittance.accountNumber,
                paymentInstructions: snapshot.remittance.paymentInstructions,
              },
            },
          },
        });
        await appendAuditEvent(
          tx,
          'invoice',
          id,
          {
            action: 'invoice.issued',
            actor,
            metadata: {
              invoiceId: id,
              invoiceNumber: issued.invoiceNumber!,
              totalMinor: issued.total.amountMinor.toString(),
              currency: issued.currency,
            },
          },
          now,
        );
        const created = await tx.invoice.findUniqueOrThrow({
          where: { id },
          include: { lines: true },
        });
        return toView(created);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const retry = await this.prisma.invoice.findFirst({
        where: { organisationId, issuanceIdempotencyKey: request.idempotencyKey },
        include: { lines: true },
      });
      if (retry) {
        if (!sameIssuanceRequest(retry, request)) throw idempotencyConflict();
        return toView(retry);
      }
      throw error;
    }
  }

  async get(organisationId: string, invoiceId: string): Promise<InvoiceView> {
    const row = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organisationId, status: { not: 'DRAFT' } },
      include: { lines: true },
    });
    if (!row)
      throw new NotFoundException({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' },
      });
    return toView(row);
  }
  async render(organisationId: string, invoiceId: string): Promise<InvoiceRenderView> {
    const row = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organisationId, status: { not: 'DRAFT' } },
      include: { lines: true, remittanceSnapshot: true },
    });
    if (!row || !row.remittanceSnapshot)
      throw new NotFoundException({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' },
      });
    return {
      ...toView(row),
      remittance: {
        accountName: row.remittanceSnapshot.accountName,
        routingIdentifier: row.remittanceSnapshot.routingIdentifier,
        accountNumber: row.remittanceSnapshot.accountNumber,
        paymentInstructions: row.remittanceSnapshot.paymentInstructions,
      },
    };
  }
}
