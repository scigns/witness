/**
 * HTTP adapter for session summaries — nested under a session, same pattern
 * as `EvidenceController`'s transcript routes.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  editSummaryRequestSchema,
  transcriptVersionRequestSchema,
  type SessionSummaryView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { SessionSummaryService } from './session-summary.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/summary')
@UseGuards(AuthorizationGuard)
export class SessionSummaryController {
  constructor(private readonly summaries: SessionSummaryService) {}

  @Post()
  @Requires('summary:create')
  async request(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionSummaryView> {
    return this.translateDomainErrors(() =>
      this.summaries.request(workspaceId, sessionId, request.principal!),
    );
  }

  @Post('retry')
  @HttpCode(200)
  @Requires('summary:create')
  async retry(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionSummaryView> {
    return this.summaries.retry(workspaceId, sessionId, request.principal!);
  }

  @Get()
  @Requires('summary:read')
  async get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionSummaryView> {
    return this.summaries.get(workspaceId, sessionId);
  }

  @Patch()
  @Requires('summary:update')
  async edit(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionSummaryView> {
    const parsed = editSummaryRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.translateDomainErrors(() =>
      this.summaries.edit(workspaceId, sessionId, parsed.data, request.principal!),
    );
  }

  @Post('confirm')
  @HttpCode(200)
  @Requires('summary:update')
  async confirm(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionSummaryView> {
    const parsed = transcriptVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.translateDomainErrors(() =>
      this.summaries.confirm(
        workspaceId,
        sessionId,
        parsed.data.expectedVersion,
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
