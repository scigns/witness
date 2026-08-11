/**
 * HTTP adapter for organisation-scoped user onboarding, nested under an
 * organisation — same pattern as `OrganisationMembershipsController`: parse,
 * authorise, delegate, serialise (ADR-0003).
 */

import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';

import {
  inviteOrganisationUserRequestSchema,
  type OrganisationInvitationView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { OrganisationInvitationsService } from './organisation-invitations.service.js';

@Controller('api/v1/organisations/:organisationId/users')
@UseGuards(AuthorizationGuard)
export class OrganisationInvitationsController {
  constructor(private readonly invitations: OrganisationInvitationsService) {}

  @Post()
  @Requires('user:create')
  async invite(
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<OrganisationInvitationView> {
    const parsed = inviteOrganisationUserRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    try {
      return await this.invitations.invite(organisationId, parsed.data, request.principal!);
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
