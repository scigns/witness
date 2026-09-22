/**
 * HTTP adapter for external-collaborator workspace invitations (ADR-0028).
 *
 * Two controllers, deliberately: `WorkspaceInvitationsController` is the
 * admin-facing, workspace-scoped, `AuthorizationGuard`-protected surface
 * (create/list/resend/revoke) — the same `role_assignment:*` actions that
 * already gate `WorkspaceRoleAssignmentsController`, since creating an
 * invitation is, structurally, the first step of granting a role.
 * `WorkspaceInvitationTokenController` is deliberately NOT behind that guard
 * — an invitee has no workspace standing yet, which is the entire point —
 * same "produces/precedes a principal" reasoning `AuthenticationController`
 * already documents for `login`/`callback`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createWorkspaceInvitationRequestSchema,
  type WorkspaceInvitationContextView,
  type WorkspaceInvitationView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { sessionToken } from '../authn/browser-session.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

@Controller('api/v1/workspaces/:workspaceId/invitations')
@UseGuards(AuthorizationGuard)
export class WorkspaceInvitationsController {
  constructor(private readonly invitations: WorkspaceInvitationsService) {}

  @Post()
  @Requires('role_assignment:write')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceInvitationView> {
    const parsed = createWorkspaceInvitationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.invitations.create(workspaceId, parsed.data, request.principal!);
  }

  @Get()
  @Requires('role_assignment:read')
  async list(@Param('workspaceId') workspaceId: string): Promise<WorkspaceInvitationView[]> {
    return this.invitations.list(workspaceId);
  }

  @Post(':invitationId/resend')
  @Requires('role_assignment:write')
  async resend(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceInvitationView> {
    return this.invitations.resend(workspaceId, invitationId, request.principal!);
  }

  @Post(':invitationId/revoke')
  @Requires('role_assignment:write')
  async revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceInvitationView> {
    return this.invitations.revoke(workspaceId, invitationId, request.principal!);
  }
}

@Controller('api/v1/workspace-invitations')
export class WorkspaceInvitationTokenController {
  constructor(
    private readonly invitations: WorkspaceInvitationsService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  /** Public — token possession alone is enough to view context, never to accept. */
  @Get(':token')
  async context(@Param('token') token: string): Promise<WorkspaceInvitationContextView> {
    return this.invitations.getContext(token);
  }

  /**
   * Requires a signed-in session (to know who is accepting and their
   * verified email) but deliberately not `AuthorizationGuard` — there is no
   * workspace-scoped grant to check yet; that is exactly what this endpoint
   * produces. Mirrors `CurrentUserController.requireSessionUserId`.
   */
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Req() request: Request,
  ): Promise<{ workspaceId: string; role: string }> {
    const { userId, email, displayName } = await this.requireSession(request);
    return this.invitations.accept(token, userId, email, {
      subject: `user:${userId}`,
      displayName,
      kind: 'human',
      roles: [],
    });
  }

  /** No authentication required — declining needs no proof of identity. */
  @Post(':token/decline')
  async decline(@Param('token') token: string): Promise<{ status: 'declined' }> {
    await this.invitations.decline(token);
    return { status: 'declined' };
  }

  private async requireSession(
    request: Request,
  ): Promise<{ userId: string; email: string; displayName: string }> {
    const token = sessionToken(request);
    if (token === null) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to accept this invitation.' },
      });
    }
    const session = await this.sessions.resolveSession(token);
    if (session.status !== 'valid') {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to accept this invitation.' },
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, displayName: true, accountState: true },
    });
    if (user === null) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'Account not found.' },
      });
    }
    // A suspended/deactivated account must not be able to ride a stale
    // session to accept an invitation, the same guarantee the normal
    // sign-in path enforces (`assertAccountAccessible`) — this endpoint
    // bypasses `AuthorizationGuard` entirely (see this file's header), so
    // it has to check this independently rather than inherit it.
    if (user.accountState === 'suspended' || user.accountState === 'deactivated') {
      throw new UnauthorizedException({
        error: {
          code: user.accountState === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_DEACTIVATED',
          message: `This account has been ${user.accountState} and cannot accept invitations.`,
        },
      });
    }
    return { userId: session.userId, email: user.email, displayName: user.displayName };
  }
}
