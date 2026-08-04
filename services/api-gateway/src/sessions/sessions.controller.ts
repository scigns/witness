/**
 * HTTP adapter for co-design sessions (BUILD_ROADMAP.md Milestone 2).
 *
 * Nested entirely under `:workspaceId`, on every route including read —
 * mirrors `WorkspaceRoleAssignmentsController` and
 * `WorkspaceMembershipsController` rather than a flat `/sessions/:id`. This
 * is not just a URL-shape preference: `AuthorizationGuard.resolveScope`
 * (Milestone 1.4) reads `request.params['workspaceId']` to decide which
 * organisation/workspace scope a request concerns, so nesting here is what
 * makes every session action correctly Casbin-scoped without any change to
 * the guard itself.
 *
 * Lifecycle transitions (schedule/unschedule/open/close/reopen/archive) are
 * bundled under one `POST :sessionId/transition` endpoint behind a single
 * `session:transition` permission — the same shape `RecordsController`
 * uses for `record:review`'s submit/confirm/correct/reject/reopen family.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  createCoDesignSessionRequestSchema,
  sessionTransitionRequestSchema,
  updateCoDesignSessionRequestSchema,
  type CoDesignSessionDetail,
  type CoDesignSessionSummary,
  type SessionLifecycleEventView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { SessionsService } from './sessions.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions')
@UseGuards(AuthorizationGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @Requires('session:read')
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ sessions: CoDesignSessionSummary[] }> {
    return { sessions: await this.sessions.list(workspaceId) };
  }

  @Get(':sessionId')
  @Requires('session:read')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<CoDesignSessionDetail> {
    return this.sessions.get(workspaceId, sessionId);
  }

  @Get(':sessionId/history')
  @Requires('session:read')
  async history(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<{ events: SessionLifecycleEventView[] }> {
    return { events: await this.sessions.history(workspaceId, sessionId) };
  }

  @Post()
  @Requires('session:create')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CoDesignSessionDetail> {
    const parsed = createCoDesignSessionRequestSchema.safeParse(body);

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
      this.sessions.create(workspaceId, parsed.data, request.principal!),
    );
  }

  @Patch(':sessionId')
  @Requires('session:update')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CoDesignSessionDetail> {
    const parsed = updateCoDesignSessionRequestSchema.safeParse(body);

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
      this.sessions.update(workspaceId, sessionId, parsed.data, request.principal!),
    );
  }

  @Post(':sessionId/transition')
  @HttpCode(200)
  @Requires('session:transition')
  async transition(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CoDesignSessionDetail> {
    const parsed = sessionTransitionRequestSchema.safeParse(body);

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
      this.sessions.transition(workspaceId, sessionId, parsed.data, request.principal!),
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
