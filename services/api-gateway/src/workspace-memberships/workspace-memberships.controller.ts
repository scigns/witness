/**
 * HTTP adapter for workspace memberships, nested under a workspace. Mirrors
 * `OrganisationMembershipsController`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  addMembershipRequestSchema,
  membershipActionSchema,
  type WorkspaceMembershipView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { WorkspaceMembershipsService } from './workspace-memberships.service.js';

@Controller('api/v1/workspaces/:workspaceId/memberships')
@UseGuards(AuthorizationGuard)
export class WorkspaceMembershipsController {
  constructor(private readonly memberships: WorkspaceMembershipsService) {}

  @Get()
  @Requires('workspace_membership:read')
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ memberships: WorkspaceMembershipView[] }> {
    return { memberships: await this.memberships.list(workspaceId) };
  }

  @Post()
  @Requires('workspace_membership:create')
  async add(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceMembershipView> {
    const parsed = addMembershipRequestSchema.safeParse(body);

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
      this.memberships.add(workspaceId, parsed.data.userId, request.principal!),
    );
  }

  @Post(':membershipId/status')
  @HttpCode(200)
  @Requires('workspace_membership:update')
  async transition(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceMembershipView> {
    const parsed = membershipActionSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The membership action is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.memberships.transition(workspaceId, membershipId, parsed.data, request.principal!),
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
