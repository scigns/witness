/**
 * HTTP adapter for organisations. Mirrors `RecordsController`: parse,
 * authorise, delegate, serialise — no rule is expressed here that is not also
 * expressed in the domain (ADR-0003).
 */

import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { createOrganisationRequestSchema, type OrganisationSummary } from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { OrganisationsService } from './organisations.service.js';

@Controller('api/v1/organisations')
@UseGuards(AuthorizationGuard)
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  @Requires('organisation:read')
  async list(
    @Req() request: RequestWithPrincipal,
  ): Promise<{ organisations: OrganisationSummary[] }> {
    return { organisations: await this.organisations.list(request.principal!) };
  }

  @Post()
  @Requires('organisation:create')
  async create(
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<OrganisationSummary> {
    const parsed = createOrganisationRequestSchema.safeParse(body);

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
      return await this.organisations.create(
        parsed.data.name,
        parsed.data.administratorEmail,
        parsed.data.administratorName,
        request.principal!,
      );
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
