/**
 * HTTP adapter for organisation-scoped role assignments, nested under a
 * membership — same pattern as `OrganisationMembershipsController`: parse,
 * authorise, delegate, serialise (ADR-0003).
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
import { OrganisationRoleAssignmentsService } from './organisation-role-assignments.service.js';

@Controller('api/v1/organisations/:organisationId/memberships/:membershipId/role')
@UseGuards(AuthorizationGuard)
export class OrganisationRoleAssignmentsController {
  constructor(private readonly roleAssignments: OrganisationRoleAssignmentsService) {}

  @Get()
  @Requires('role_assignment:read')
  async get(
    @Param('organisationId') organisationId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<RoleAssignmentView> {
    return this.roleAssignments.get(organisationId, membershipId);
  }

  @Put()
  @Requires('role_assignment:write')
  async assignOrChange(
    @Param('organisationId') organisationId: string,
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
        organisationId,
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
    @Param('organisationId') organisationId: string,
    @Param('membershipId') membershipId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    return this.translateDomainErrors(() =>
      this.roleAssignments.remove(organisationId, membershipId, request.principal!),
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
