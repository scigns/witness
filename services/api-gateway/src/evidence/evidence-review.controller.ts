/**
 * HTTP adapter for evidence review and validation (BUILD_ROADMAP.md
 * Milestone 6).
 *
 * Nested under the same `:workspaceId/sessions/:sessionId/evidence/:evidenceId`
 * path `EvidenceController` uses, mirroring `EvidenceLinkService`'s own
 * sub-resource pattern (`/evidence/:evidenceId/links`) — `AuthorizationGuard`
 * scopes every route via the same `workspaceId` param, no guard change
 * needed. Every `@Requires` here is the *coarse* Casbin check (does this
 * role hold the action at all, in this workspace); `EvidenceReviewService`
 * layers the *fine* "are you the assigned reviewer" check on top where the
 * milestone's authorisation matrix requires it — see that service's file
 * header.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  assignReviewerRequestSchema,
  cancelReviewAssignmentRequestSchema,
  correctEvidenceRequestSchema,
  evidenceReviewActionRequestSchema,
  reassignReviewerRequestSchema,
  requestClarificationRequestSchema,
  respondToClarificationRequestSchema,
  withdrawClarificationRequestSchema,
  type ClarificationView,
  type EvidenceDetail,
  type ReviewAssignmentView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';
import type { ZodType } from 'zod';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { EvidenceReviewService } from './evidence-review.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/evidence/:evidenceId')
@UseGuards(AuthorizationGuard)
export class EvidenceReviewController {
  constructor(private readonly review: EvidenceReviewService) {}

  // ─── Assignment ───────────────────────────────────────────────────────────

  @Get('review/assignment')
  @Requires('evidence_review:read')
  async getActiveAssignment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ): Promise<{ assignment: ReviewAssignmentView | null }> {
    return {
      assignment: await this.review.getActiveAssignment(workspaceId, sessionId, evidenceId),
    };
  }

  @Post('review/assignment')
  @Requires('evidence_review:assign')
  async assign(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReviewAssignmentView> {
    const parsed = parseOr(assignReviewerRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.assign(workspaceId, sessionId, evidenceId, parsed, request.principal!),
    );
  }

  @Post('review/assignment/:assignmentId/reassign')
  @Requires('evidence_review:reassign')
  async reassign(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReviewAssignmentView> {
    const parsed = parseOr(reassignReviewerRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.reassign(
        workspaceId,
        sessionId,
        evidenceId,
        assignmentId,
        parsed,
        request.principal!,
      ),
    );
  }

  // POST, not DELETE: the cancellation reason travels in the body, and
  // intermediaries are entitled to drop a body on DELETE — which would lose
  // the reason silently from the audit event.
  @Post('review/assignment/:assignmentId/cancel')
  @HttpCode(204)
  @Requires('evidence_review:assign')
  async cancelAssignment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    const parsed = parseOr(cancelReviewAssignmentRequestSchema, body ?? {});
    await this.translateDomainErrors(() =>
      this.review.cancelAssignment(
        workspaceId,
        sessionId,
        evidenceId,
        assignmentId,
        parsed,
        request.principal!,
      ),
    );
  }

  // ─── Review lifecycle ───────────────────────────────────────────────────────

  @Post('review/actions')
  @HttpCode(200)
  @Requires('evidence_review:read')
  async reviewAction(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    const parsed = parseOr(evidenceReviewActionRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.reviewAction(workspaceId, sessionId, evidenceId, parsed, request.principal!),
    );
  }

  @Post('review/correction')
  @Requires('evidence_review:correct')
  async correct(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    const parsed = parseOr(correctEvidenceRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.correct(workspaceId, sessionId, evidenceId, parsed, request.principal!),
    );
  }

  // ─── Clarifications ───────────────────────────────────────────────────────

  @Get('review/clarifications')
  @Requires('evidence_review:read')
  async listClarifications(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ): Promise<{ clarifications: ClarificationView[] }> {
    return {
      clarifications: await this.review.listClarifications(workspaceId, sessionId, evidenceId),
    };
  }

  @Post('review/clarifications')
  @Requires('evidence_review:clarify')
  async requestClarification(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ClarificationView> {
    const parsed = parseOr(requestClarificationRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.requestClarification(
        workspaceId,
        sessionId,
        evidenceId,
        parsed,
        request.principal!,
      ),
    );
  }

  @Post('review/clarifications/:clarificationId/respond')
  @Requires('evidence_review:respond')
  async respondToClarification(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('clarificationId', ParseUUIDPipe) clarificationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ClarificationView> {
    const parsed = parseOr(respondToClarificationRequestSchema, body);
    return this.translateDomainErrors(() =>
      this.review.respondToClarification(
        workspaceId,
        sessionId,
        evidenceId,
        clarificationId,
        parsed,
        request.principal!,
      ),
    );
  }

  @Post('review/clarifications/:clarificationId/withdraw')
  @Requires('evidence_review:clarify')
  async withdrawClarification(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('clarificationId', ParseUUIDPipe) clarificationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ClarificationView> {
    const parsed = parseOr(withdrawClarificationRequestSchema, body ?? {});
    return this.translateDomainErrors(() =>
      this.review.withdrawClarification(
        workspaceId,
        sessionId,
        evidenceId,
        clarificationId,
        parsed,
        request.principal!,
      ),
    );
  }

  @Post('review/clarifications/:clarificationId/close')
  @Requires('evidence_review:clarify')
  async closeClarification(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('clarificationId', ParseUUIDPipe) clarificationId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<ClarificationView> {
    return this.translateDomainErrors(() =>
      this.review.closeClarification(
        workspaceId,
        sessionId,
        evidenceId,
        clarificationId,
        request.principal!,
      ),
    );
  }

  private async translateDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  }
}

function parseOr<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body is not valid.',
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  }
  return parsed.data;
}
