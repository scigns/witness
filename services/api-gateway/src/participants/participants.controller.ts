/**
 * HTTP adapter for session participants (BUILD_ROADMAP.md Milestone 3).
 *
 * Nested under `:workspaceId/sessions/:sessionId`, mirroring
 * `SessionsController` — `AuthorizationGuard.resolveScope` reads
 * `request.params['workspaceId']` regardless of how deep it is nested, so
 * this three-level nesting Casbin-scopes every participant action exactly
 * the way session actions are scoped, with no guard change needed.
 *
 * `GET 'export'` is declared before `GET ':participantId'` — NestJS/Express
 * matches routes in declaration order, so a static segment declared after a
 * param segment would be swallowed by it (`'export'` would bind to
 * `:participantId`).
 *
 * `updateNotes` is the one route requiring `participant:manage_restricted`
 * rather than `participant:update` — see `session-participant.ts`'s
 * `updateFacilitatorNotes` doc comment for why that permission is kept
 * separate.
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
  addSessionParticipantRequestSchema,
  sessionParticipantTransitionRequestSchema,
  updateParticipantNotesRequestSchema,
  updateSessionParticipantRequestSchema,
  type SessionLifecycleEventView,
  type SessionParticipantDetail,
  type SessionParticipantSummary,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { ParticipantsService } from './participants.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/participants')
@UseGuards(AuthorizationGuard)
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Get()
  @Requires('participant:read')
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<{ participants: SessionParticipantSummary[] }> {
    return {
      participants: await this.participants.list(workspaceId, sessionId, request.principal!),
    };
  }

  @Get('export')
  @Requires('participant:read')
  async exportRedacted(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ participants: SessionParticipantSummary[] }> {
    return { participants: await this.participants.exportRedacted(workspaceId, sessionId) };
  }

  @Get(':participantId')
  @Requires('participant:read')
  async get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionParticipantDetail> {
    return this.participants.get(workspaceId, sessionId, participantId, request.principal!);
  }

  @Get(':participantId/history')
  @Requires('participant:read')
  async history(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ): Promise<{ events: SessionLifecycleEventView[] }> {
    return { events: await this.participants.history(workspaceId, sessionId, participantId) };
  }

  @Post()
  @Requires('participant:create')
  async add(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionParticipantDetail> {
    const parsed = addSessionParticipantRequestSchema.safeParse(body);

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
      this.participants.add(workspaceId, sessionId, parsed.data, request.principal!),
    );
  }

  @Patch(':participantId')
  @Requires('participant:update')
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionParticipantDetail> {
    const parsed = updateSessionParticipantRequestSchema.safeParse(body);

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
      this.participants.update(
        workspaceId,
        sessionId,
        participantId,
        parsed.data,
        request.principal!,
      ),
    );
  }

  @Patch(':participantId/notes')
  @Requires('participant:manage_restricted')
  async updateNotes(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionParticipantDetail> {
    const parsed = updateParticipantNotesRequestSchema.safeParse(body);

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
      this.participants.updateNotes(
        workspaceId,
        sessionId,
        participantId,
        parsed.data,
        request.principal!,
      ),
    );
  }

  @Post(':participantId/transition')
  @HttpCode(200)
  @Requires('participant:update')
  async transition(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionParticipantDetail> {
    const parsed = sessionParticipantTransitionRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The transition is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.participants.transition(
        workspaceId,
        sessionId,
        participantId,
        parsed.data,
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
