import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Agreement } from '@prisma/client';
import {
  DomainError,
  createAgreement,
  effectiveAgreementStatus,
  renewAgreement,
  terminateAgreement,
  toAgreementId,
  toOrganisationId,
  type Agreement as AgreementDomain,
} from '@witness/domain';
import type {
  AgreementView,
  CreateAgreementRequest,
  RenewAgreementRequest,
} from '@witness/contracts';
import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';

function toDomain(row: Agreement): AgreementDomain {
  return {
    id: toAgreementId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    billingAccountId: row.billingAccountId,
    reference: row.reference,
    status: row.status as AgreementDomain['status'],
    termStart: row.termStart,
    termEnd: row.termEnd,
    notes: row.notes,
    previousAgreementId:
      row.previousAgreementId === null ? null : toAgreementId(row.previousAgreementId),
    statusChangedAt: row.statusChangedAt,
    statusReason: row.statusReason,
  };
}

function toView(row: Agreement, at: Date): AgreementView {
  return {
    id: row.id,
    organisationId: row.organisationId,
    billingAccountId: row.billingAccountId,
    reference: row.reference,
    status: row.status as AgreementView['status'],
    effectiveStatus: effectiveAgreementStatus(toDomain(row), at),
    termStart: row.termStart.toISOString(),
    termEnd: row.termEnd?.toISOString() ?? null,
    notes: row.notes,
    previousAgreementId: row.previousAgreementId,
    statusChangedAt: row.statusChangedAt.toISOString(),
    statusReason: row.statusReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function asDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw new BadRequestException({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string): Promise<AgreementView[]> {
    const rows = await this.prisma.agreement.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((row) => toView(row, now));
  }

  async create(
    organisationId: string,
    request: CreateAgreementRequest,
    principal: Principal,
  ): Promise<AgreementView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Serialises concurrent agreement mutations for this organisation, the
      // same `pg_advisory_xact_lock` pattern `session-join.service.ts` and
      // `manual-settlement.service.ts` use for their own exactly-once
      // invariants — here, "at most one ACTIVE agreement per organisation".
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agreement'), hashtext(${organisationId}))`;

      const account = await tx.billingAccount.findFirst({ where: { organisationId } });
      if (!account) {
        throw new NotFoundException({
          error: { code: 'BILLING_ACCOUNT_NOT_FOUND', message: 'Billing account not found.' },
        });
      }
      const existingActive = await tx.agreement.findFirst({
        where: { organisationId, status: 'ACTIVE' },
      });
      if (existingActive) {
        throw new ConflictException({
          error: {
            code: 'AGREEMENT_ALREADY_ACTIVE',
            message:
              'This organisation already has an active agreement. Renew it instead of creating a new one.',
          },
        });
      }

      const actor = await resolveActor(tx as PrismaService, principal);
      let created: AgreementDomain;
      try {
        created = createAgreement({
          id: toAgreementId(randomUUID()),
          organisationId: toOrganisationId(organisationId),
          billingAccountId: account.id,
          reference: request.reference,
          termStart: new Date(request.termStart),
          termEnd: request.termEnd ? new Date(request.termEnd) : null,
          notes: request.notes ?? null,
          at: now,
        });
      } catch (error) {
        asDomainError(error);
      }

      await tx.agreement.create({
        data: {
          id: created.id,
          organisationId,
          billingAccountId: created.billingAccountId,
          reference: created.reference,
          status: created.status,
          termStart: created.termStart,
          termEnd: created.termEnd,
          notes: created.notes,
          previousAgreementId: null,
          statusChangedAt: created.statusChangedAt,
          statusReason: created.statusReason,
          createdById: actor.id,
        },
      });
      await appendAuditEvent(
        tx,
        'agreement',
        created.id,
        { action: 'agreement.created', actor, metadata: { reference: created.reference } },
        now,
      );
      const row = await tx.agreement.findUniqueOrThrow({ where: { id: created.id } });
      return toView(row, now);
    });
  }

  async renew(
    organisationId: string,
    agreementId: string,
    request: RenewAgreementRequest,
    principal: Principal,
  ): Promise<AgreementView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agreement'), hashtext(${organisationId}))`;

      const previousRow = await tx.agreement.findFirst({
        where: { id: agreementId, organisationId },
      });
      if (!previousRow) {
        throw new NotFoundException({
          error: { code: 'AGREEMENT_NOT_FOUND', message: 'Agreement not found.' },
        });
      }
      const actor = await resolveActor(tx as PrismaService, principal);
      let result: { superseded: AgreementDomain; renewed: AgreementDomain };
      try {
        result = renewAgreement(toDomain(previousRow), {
          id: toAgreementId(randomUUID()),
          reference: request.reference,
          termStart: new Date(request.termStart),
          termEnd: request.termEnd ? new Date(request.termEnd) : null,
          notes: request.notes ?? null,
          at: now,
        });
      } catch (error) {
        asDomainError(error);
      }
      const { superseded, renewed } = result;

      await tx.agreement.update({
        where: { id: superseded.id },
        data: {
          status: superseded.status,
          statusChangedAt: superseded.statusChangedAt,
          statusReason: superseded.statusReason,
        },
      });
      await tx.agreement.create({
        data: {
          id: renewed.id,
          organisationId,
          billingAccountId: renewed.billingAccountId,
          reference: renewed.reference,
          status: renewed.status,
          termStart: renewed.termStart,
          termEnd: renewed.termEnd,
          notes: renewed.notes,
          previousAgreementId: renewed.previousAgreementId,
          statusChangedAt: renewed.statusChangedAt,
          statusReason: renewed.statusReason,
          createdById: actor.id,
        },
      });
      await appendAuditEvent(
        tx,
        'agreement',
        renewed.id,
        {
          action: 'agreement.renewed',
          actor,
          metadata: { reference: renewed.reference, previousAgreementId: superseded.id },
        },
        now,
      );
      const row = await tx.agreement.findUniqueOrThrow({ where: { id: renewed.id } });
      return toView(row, now);
    });
  }

  async terminate(
    organisationId: string,
    agreementId: string,
    reason: string,
    principal: Principal,
  ): Promise<AgreementView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agreement'), hashtext(${organisationId}))`;

      const row = await tx.agreement.findFirst({ where: { id: agreementId, organisationId } });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'AGREEMENT_NOT_FOUND', message: 'Agreement not found.' },
        });
      }
      const actor = await resolveActor(tx as PrismaService, principal);
      let terminated: AgreementDomain;
      try {
        terminated = terminateAgreement(toDomain(row), now, reason);
      } catch (error) {
        asDomainError(error);
      }

      await tx.agreement.update({
        where: { id: terminated.id },
        data: {
          status: terminated.status,
          statusChangedAt: terminated.statusChangedAt,
          statusReason: terminated.statusReason,
        },
      });
      await appendAuditEvent(
        tx,
        'agreement',
        terminated.id,
        { action: 'agreement.terminated', actor, metadata: { reason: terminated.statusReason! } },
        now,
      );
      const updated = await tx.agreement.findUniqueOrThrow({ where: { id: terminated.id } });
      return toView(updated, now);
    });
  }
}
