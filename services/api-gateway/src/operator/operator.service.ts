import { Injectable } from '@nestjs/common';
import type {
  OperatorFailureGroup,
  OperatorFailureItem,
  OperatorHealthView,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';

const ITEMS_PER_GROUP = 25;

function group(count: number, items: OperatorFailureItem[]): OperatorFailureGroup {
  return { count, items };
}

@Injectable()
export class OperatorService {
  constructor(private readonly prisma: PrismaService) {}

  async health(): Promise<OperatorHealthView> {
    const now = new Date();
    const [transcription, summaries, email, settlement] = await Promise.all([
      this.transcriptionFailures(),
      this.summaryFailures(),
      this.emailFailures(),
      this.settlementIssues(now),
    ]);

    return { transcription, summaries, email, settlement, generatedAt: now.toISOString() };
  }

  private async transcriptionFailures(): Promise<OperatorFailureGroup> {
    const [count, rows] = await Promise.all([
      this.prisma.transcript.count({ where: { status: 'failed' } }),
      this.prisma.transcript.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: ITEMS_PER_GROUP,
        include: {
          evidence: { include: { organisation: { select: { name: true } } } },
        },
      }),
    ]);
    return group(
      count,
      rows.map((row) => ({
        id: row.id,
        organisationId: row.evidence.organisationId,
        organisationName: row.evidence.organisation.name,
        detail: `Transcript for "${row.evidence.title}"`,
        reason: row.failureReason,
        occurredAt: row.updatedAt.toISOString(),
        linkWorkspaceId: row.evidence.workspaceId,
        linkSessionId: row.evidence.sessionId,
        linkEvidenceId: row.evidence.id,
      })),
    );
  }

  private async summaryFailures(): Promise<OperatorFailureGroup> {
    const [count, rows] = await Promise.all([
      this.prisma.sessionSummary.count({ where: { status: 'failed' } }),
      this.prisma.sessionSummary.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: ITEMS_PER_GROUP,
        include: {
          session: { include: { organisation: { select: { name: true } } } },
        },
      }),
    ]);
    return group(
      count,
      rows.map((row) => ({
        id: row.id,
        organisationId: row.session.organisationId,
        organisationName: row.session.organisation.name,
        detail: `Summary for "${row.session.title}"`,
        reason: row.failureReason,
        occurredAt: row.updatedAt.toISOString(),
        linkWorkspaceId: row.session.workspaceId,
        linkSessionId: row.session.id,
        linkEvidenceId: null,
      })),
    );
  }

  private async emailFailures(): Promise<OperatorFailureGroup> {
    const [notificationCount, invitationCount, notifications, invitations] = await Promise.all([
      this.prisma.invitationNotification.count({ where: { status: 'failed' } }),
      this.prisma.workspaceInvitation.count({ where: { deliveryStatus: 'failed' } }),
      this.prisma.invitationNotification.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: ITEMS_PER_GROUP,
        include: { organisation: { select: { name: true } } },
      }),
      this.prisma.workspaceInvitation.findMany({
        where: { deliveryStatus: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: ITEMS_PER_GROUP,
        include: { organisation: { select: { name: true } } },
      }),
    ]);

    const items: OperatorFailureItem[] = [
      ...notifications.map((row) => ({
        id: row.id,
        organisationId: row.organisationId,
        organisationName: row.organisation.name,
        detail: `Organisation invitation to ${row.recipientEmail}`,
        reason: row.lastError,
        occurredAt: row.updatedAt.toISOString(),
        linkWorkspaceId: null,
        linkSessionId: null,
        linkEvidenceId: null,
      })),
      ...invitations.map((row) => ({
        id: row.id,
        organisationId: row.organisationId,
        organisationName: row.organisation.name,
        detail: `Workspace invitation to ${row.invitedEmail}`,
        reason: row.lastDeliveryError,
        occurredAt: row.updatedAt.toISOString(),
        linkWorkspaceId: row.workspaceId,
        linkSessionId: null,
        linkEvidenceId: null,
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, ITEMS_PER_GROUP);

    return group(notificationCount + invitationCount, items);
  }

  private async settlementIssues(now: Date): Promise<OperatorFailureGroup> {
    // `Invoice.status` never transitions to `OVERDUE` on its own (no
    // background job does that, deliberately — see the domain layer's
    // `markInvoiceOverdue`, which nothing currently calls); "overdue" is
    // computed here at read time the same way `effectiveAgreementStatus`
    // computes a lapsed agreement term, rather than needing one.
    const overdueWhere = { status: 'OPEN', dueAt: { lt: now } } as const;
    const rejectedWhere = { status: 'REJECTED' } as const;
    const [overdueCount, rejectedCount, overdueInvoices, rejectedPayments] = await Promise.all([
      this.prisma.invoice.count({ where: overdueWhere }),
      this.prisma.payment.count({ where: rejectedWhere }),
      this.prisma.invoice.findMany({
        where: overdueWhere,
        orderBy: { dueAt: 'asc' },
        take: ITEMS_PER_GROUP,
        include: { organisation: { select: { name: true } } },
      }),
      this.prisma.payment.findMany({
        where: rejectedWhere,
        orderBy: { updatedAt: 'desc' },
        take: ITEMS_PER_GROUP,
        include: { organisation: { select: { name: true } } },
      }),
    ]);

    const items: OperatorFailureItem[] = [
      ...overdueInvoices.map((row) => ({
        id: row.id,
        organisationId: row.organisationId,
        organisationName: row.organisation.name,
        detail: `Invoice ${row.invoiceNumber ?? row.id} overdue`,
        reason: null,
        occurredAt: (row.dueAt ?? row.statusChangedAt).toISOString(),
        linkWorkspaceId: null,
        linkSessionId: null,
        linkEvidenceId: null,
      })),
      ...rejectedPayments.map((row) => ({
        id: row.id,
        organisationId: row.organisationId,
        organisationName: row.organisation.name,
        detail: `Payment evidence rejected (${row.sourceReference})`,
        reason: row.reason,
        occurredAt: row.statusChangedAt.toISOString(),
        linkWorkspaceId: null,
        linkSessionId: null,
        linkEvidenceId: null,
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, ITEMS_PER_GROUP);

    return group(overdueCount + rejectedCount, items);
  }
}
