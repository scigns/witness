import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ProductFeedback as ProductFeedbackRow } from '@prisma/client';

import {
  DomainError,
  isPositiveFeedback,
  submitProductFeedback,
  toCoDesignSessionId,
  toOrganisationId,
  toProductFeedbackId,
  toSessionParticipantId,
  toWorkspaceId,
  type ProductFeedback as ProductFeedbackDomain,
} from '@witness/domain';
import type {
  ProductArea,
  FeedbackMoment,
  ProductFeedbackView,
  SubmitProductFeedbackRequest,
} from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';

function toView(row: ProductFeedbackRow): ProductFeedbackView {
  const productArea = row.productArea as ProductArea;
  const moment = row.moment as FeedbackMoment;
  return {
    id: row.id,
    productArea,
    moment,
    rating: row.rating,
    comment: row.comment,
    offerTestimonial: isPositiveFeedback({ rating: row.rating } as ProductFeedbackDomain),
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
export class ProductFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<ProductFeedbackView[]> {
    const rows = await this.prisma.productFeedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toView);
  }

  /**
   * Submits feedback on behalf of an authenticated (`request.principal`)
   * actor. `sessionId`/`sourceParticipantId` may be supplied for the
   * facilitator/reviewer/report-author moments; the unauthenticated
   * participant-capture path calls `submitForParticipant` instead, which
   * forces both server-side.
   */
  async submit(
    workspaceId: string,
    request: SubmitProductFeedbackRequest,
    principal: Principal,
  ): Promise<ProductFeedbackView> {
    return this.submitInternal(workspaceId, request, null, principal);
  }

  async submitForParticipant(
    workspaceId: string,
    sessionId: string,
    sourceParticipantId: string,
    request: { rating: number; comment?: string | null | undefined },
    principal: Principal,
  ): Promise<ProductFeedbackView> {
    return this.submitInternal(
      workspaceId,
      {
        productArea: 'evidence_capture',
        moment: 'participant_capture_success',
        rating: request.rating,
        comment: request.comment ?? null,
        sessionId,
      },
      sourceParticipantId,
      principal,
    );
  }

  private async submitInternal(
    workspaceId: string,
    request: SubmitProductFeedbackRequest,
    sourceParticipantId: string | null,
    principal: Principal,
  ): Promise<ProductFeedbackView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { organisationId: true },
      });
      if (workspace === null) {
        throw new NotFoundException({
          error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found.' },
        });
      }

      const actor = await resolveActor(tx as PrismaService, principal);
      let outcome: ReturnType<typeof submitProductFeedback>;
      try {
        outcome = submitProductFeedback({
          id: toProductFeedbackId(randomUUID()),
          organisationId: toOrganisationId(workspace.organisationId),
          workspaceId: toWorkspaceId(workspaceId),
          sessionId: request.sessionId ? toCoDesignSessionId(request.sessionId) : null,
          sourceParticipantId:
            sourceParticipantId !== null ? toSessionParticipantId(sourceParticipantId) : null,
          productArea: request.productArea,
          moment: request.moment,
          rating: request.rating,
          comment: request.comment ?? null,
          submittedBy: actor,
          at: now,
        });
      } catch (error) {
        asDomainError(error);
      }
      const { feedback } = outcome;

      await tx.productFeedback.create({
        data: {
          id: feedback.id,
          organisationId: workspace.organisationId,
          workspaceId,
          sessionId: feedback.sessionId,
          sourceParticipantId: feedback.sourceParticipantId,
          productArea: feedback.productArea,
          moment: feedback.moment,
          rating: feedback.rating,
          comment: feedback.comment,
          submittedById: actor.id,
          createdAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'product_feedback',
        feedback.id,
        {
          action: 'product_feedback.submitted',
          actor,
          metadata: {
            productArea: feedback.productArea,
            moment: feedback.moment,
            rating: String(feedback.rating),
          },
        },
        now,
      );

      const row = await tx.productFeedback.findUniqueOrThrow({ where: { id: feedback.id } });
      return toView(row);
    });
  }
}
