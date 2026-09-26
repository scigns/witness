/**
 * HTTP adapter for facilitator curation of "what we're hearing" and the
 * minimal live-control room view (Phase 6, Track E).
 *
 * Nested under `:workspaceId/sessions/:sessionId`, same convention as
 * `session-consent-configuration.controller.ts`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  featureInsightRequestSchema,
  type FeaturedInsightCandidateView,
  type FeaturedInsightView,
  type SessionRoomView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { SessionFeaturedInsightsService } from './session-featured-insights.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId')
@UseGuards(AuthorizationGuard)
export class SessionFeaturedInsightsController {
  constructor(private readonly insights: SessionFeaturedInsightsService) {}

  @Get('featured-insights')
  @Requires('participant_knowledge_response:read')
  list(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<FeaturedInsightView[]> {
    return this.insights.listForWorkspace(workspaceId, sessionId);
  }

  @Get('featured-insights/candidates')
  @Requires('session_featured_insight:manage')
  candidates(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<FeaturedInsightCandidateView[]> {
    return this.insights.listCandidates(workspaceId, sessionId);
  }

  @Post('featured-insights')
  @Requires('session_featured_insight:manage')
  curate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<FeaturedInsightView> {
    const parsed = featureInsightRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.insights.curate(workspaceId, sessionId, parsed.data, request.principal!);
  }

  @Delete('featured-insights/:insightId')
  @Requires('session_featured_insight:manage')
  remove(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('insightId', new ParseUUIDPipe()) insightId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    return this.insights.remove(workspaceId, sessionId, insightId, request.principal!);
  }

  @Get('room-view')
  @Requires('participant_knowledge_response:read')
  roomView(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ): Promise<SessionRoomView> {
    return this.insights.roomView(workspaceId, sessionId);
  }
}
