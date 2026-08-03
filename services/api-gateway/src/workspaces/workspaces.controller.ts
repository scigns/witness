/**
 * HTTP adapter for workspaces. Mirrors `OrganisationsController`: parse,
 * authorise, delegate, serialise — no rule is expressed here that is not also
 * expressed in the domain (ADR-0003).
 */

import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { createWorkspaceRequestSchema, type WorkspaceSummary } from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('api/v1/workspaces')
@UseGuards(AuthorizationGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @Requires('workspace:read')
  async list(): Promise<{ workspaces: WorkspaceSummary[] }> {
    return { workspaces: await this.workspaces.list() };
  }

  @Post()
  @Requires('workspace:create')
  async create(
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<WorkspaceSummary> {
    const parsed = createWorkspaceRequestSchema.safeParse(body);

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
      return await this.workspaces.create(
        parsed.data.name,
        parsed.data.organisationId,
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
