/**
 * HTTP adapter for organisation memberships, nested under an organisation.
 * Mirrors the existing controller pattern: parse, authorise, delegate,
 * serialise (ADR-0003).
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
  type OrganisationMembershipView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { OrganisationMembershipsService } from './organisation-memberships.service.js';

@Controller('api/v1/organisations/:organisationId/memberships')
@UseGuards(AuthorizationGuard)
export class OrganisationMembershipsController {
  constructor(private readonly memberships: OrganisationMembershipsService) {}

  @Get()
  @Requires('organisation_membership:read')
  async list(
    @Param('organisationId') organisationId: string,
  ): Promise<{ memberships: OrganisationMembershipView[] }> {
    return { memberships: await this.memberships.list(organisationId) };
  }

  @Post()
  @Requires('organisation_membership:create')
  async add(
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<OrganisationMembershipView> {
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
      this.memberships.add(organisationId, parsed.data.userId, request.principal!),
    );
  }

  @Post(':membershipId/status')
  @HttpCode(200)
  @Requires('organisation_membership:update')
  async transition(
    @Param('organisationId') organisationId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<OrganisationMembershipView> {
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
      this.memberships.transition(organisationId, membershipId, parsed.data, request.principal!),
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
