import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  addPerspectiveTagRequestSchema,
  proposeCandidateAssertionRequestSchema,
  respondToCandidateClarificationRequestSchema,
  reviewCandidateAssertionRequestSchema,
  type CandidateAssertionView,
  type KnowledgeAssertionView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { KnowledgeCandidatesService } from './knowledge-candidates.service.js';

@Controller('api/v1/organisations/:organisationId/workspaces/:workspaceId/knowledge/candidates')
@UseGuards(AuthorizationGuard)
export class KnowledgeCandidatesController {
  constructor(private readonly candidates: KnowledgeCandidatesService) {}

  @Get()
  @Requires('knowledge_candidate:review')
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status: string | undefined,
  ): Promise<{ candidates: CandidateAssertionView[] }> {
    return { candidates: await this.candidates.list(workspaceId, status) };
  }

  @Get(':candidateId')
  @Requires('knowledge_candidate:review')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
  ): Promise<CandidateAssertionView> {
    return this.candidates.get(workspaceId, candidateId);
  }

  @Post()
  @Requires('knowledge_relationship:suggest')
  async propose(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CandidateAssertionView> {
    const parsed = proposeCandidateAssertionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.candidates.propose(organisationId, workspaceId, parsed.data, request.principal!);
  }

  @Post(':candidateId/review')
  @Requires('knowledge_candidate:review')
  async review(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CandidateAssertionView> {
    const parsed = reviewCandidateAssertionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    try {
      return await this.candidates.review(
        organisationId,
        workspaceId,
        candidateId,
        parsed.data,
        request.principal!,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }

  /** Answering a reviewer's question — a contributor-tier action, matching `propose`'s gate. */
  @Post(':candidateId/respond-to-clarification')
  @Requires('knowledge_relationship:suggest')
  async respondToClarification(
    @Param('workspaceId') workspaceId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CandidateAssertionView> {
    const parsed = respondToCandidateClarificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    try {
      return await this.candidates.respondToClarification(
        workspaceId,
        candidateId,
        parsed.data.response,
        request.principal!,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }
}

/**
 * `knowledge_candidate:review` gates this — the tier granted to both
 * `reviewer` and `steward` (see `packages/policy/policy.csv`), matching the
 * originating request naming this a capability of both roles ("Reviewer:
 * ... mark contested; mark unresolved" and "Knowledge Steward: ... flag
 * contradictions").
 */
@Controller('api/v1/organisations/:organisationId/workspaces/:workspaceId/knowledge/assertions')
@UseGuards(AuthorizationGuard)
export class KnowledgeAssertionsController {
  constructor(private readonly candidates: KnowledgeCandidatesService) {}

  @Post(':assertionId/perspective-tags')
  @Requires('knowledge_candidate:review')
  async addPerspectiveTag(
    @Param('workspaceId') workspaceId: string,
    @Param('assertionId') assertionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<KnowledgeAssertionView> {
    const parsed = addPerspectiveTagRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.candidates.addAssertionPerspectiveTag(
      workspaceId,
      assertionId,
      parsed.data.tag,
      request.principal!,
    );
  }
}
