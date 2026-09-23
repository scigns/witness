/**
 * HTTP adapter for governed QR/link session joining (Phase 5, Workstream
 * 1.6). Two controllers, deliberately — same split, and same reasoning, as
 * `workspace-invitations.controller.ts`: `SessionJoinLinksController` is the
 * facilitator-facing, session-scoped, `AuthorizationGuard`-protected surface
 * (create/list/revoke), gated by `participant:create`/`participant:read` —
 * minting a join link is structurally the same authority as adding a
 * participant by hand, since it is just a second way to produce the same
 * `SessionParticipant` row. `SessionJoinController` is deliberately NOT
 * behind that guard — a scanning participant has no workspace standing yet,
 * which is the entire point.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createSessionJoinLinkRequestSchema,
  joinSessionRequestSchema,
  type JoinSessionResult,
  type SessionJoinContextView,
  type SessionJoinLinkCreatedView,
  type SessionJoinLinkView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { SessionJoinService } from './session-join.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/join-links')
@UseGuards(AuthorizationGuard)
export class SessionJoinLinksController {
  constructor(private readonly sessionJoin: SessionJoinService) {}

  @Post()
  @Requires('participant:create')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionJoinLinkCreatedView> {
    const parsed = createSessionJoinLinkRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.sessionJoin.create(workspaceId, sessionId, parsed.data, request.principal!);
  }

  @Get()
  @Requires('participant:read')
  async list(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<SessionJoinLinkView[]> {
    return this.sessionJoin.list(workspaceId, sessionId);
  }

  @Post(':linkId/revoke')
  @Requires('participant:create')
  async revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Param('linkId') linkId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionJoinLinkView> {
    return this.sessionJoin.revoke(workspaceId, sessionId, linkId, request.principal!);
  }
}

@Controller('api/v1/session-join')
export class SessionJoinController {
  constructor(private readonly sessionJoin: SessionJoinService) {}

  /** Public — token possession alone is enough to view context, never to join. */
  @Get(':token')
  async context(@Param('token') token: string): Promise<SessionJoinContextView> {
    return this.sessionJoin.getContext(token);
  }

  /**
   * Public — no `AuthorizationGuard`. `verified_guest`/`invited_only`
   * governance modes independently require a real session inside
   * `SessionJoinService.resolveIdentity`; this route itself grants nothing
   * by virtue of any header, the same discipline
   * `WorkspaceInvitationTokenController.accept` documents.
   */
  @Post(':token/join')
  async join(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<JoinSessionResult> {
    const parsed = joinSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.sessionJoin.join(token, parsed.data, request);
  }
}
