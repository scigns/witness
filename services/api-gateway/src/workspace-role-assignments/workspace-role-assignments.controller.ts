/**
 * HTTP adapter for workspace-scoped role assignments. Mirrors
 * `OrganisationRoleAssignmentsController`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { assignRoleRequestSchema, type RoleAssignmentView } from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { WorkspaceRoleAssignmentsService } from './workspace-role-assignments.service.js';

@Controller('api/v1/workspaces/:workspaceId/memberships/:membershipId/role')
@UseGuards(AuthorizationGuard)
export class WorkspaceRoleAssignmentsController {
  constructor(private readonly roleAssignments: WorkspaceRoleAssignmentsService) {}

  @Get()
  @Requires('role_assignment:read')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<RoleAssignmentView> {
    return this.roleAssignments.get(workspaceId, membershipId);
  }

  @Put()
  @Requires('role_assignment:write')
  async assignOrChange(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<RoleAssignmentView> {
    const parsed = assignRoleRequestSchema.safeParse(body);

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
      this.roleAssignments.assignOrChange(
        workspaceId,
        membershipId,
        parsed.data,
        request.principal!,
      ),
    );
  }

  @Delete()
  @HttpCode(204)
  @Requires('role_assignment:delete')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    return this.translateDomainErrors(() =>
      this.roleAssignments.remove(workspaceId, membershipId, request.principal!),
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
