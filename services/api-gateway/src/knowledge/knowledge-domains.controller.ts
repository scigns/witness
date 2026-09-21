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

import {
  createKnowledgeDomainRequestSchema,
  updateKnowledgeDomainPolicyRequestSchema,
  type KnowledgeDomainView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { KnowledgeDomainsService } from './knowledge-domains.service.js';

@Controller('api/v1/organisations/:organisationId/workspaces/:workspaceId/knowledge/domains')
@UseGuards(AuthorizationGuard)
export class KnowledgeDomainsController {
  constructor(private readonly domains: KnowledgeDomainsService) {}

  @Get()
  @Requires('knowledge_domain:read')
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ domains: KnowledgeDomainView[] }> {
    return { domains: await this.domains.list(workspaceId) };
  }

  @Get(':domainId')
  @Requires('knowledge_domain:read')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
  ): Promise<KnowledgeDomainView> {
    return this.domains.get(workspaceId, domainId);
  }

  @Post()
  @Requires('knowledge_domain:manage')
  async create(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<KnowledgeDomainView> {
    const parsed = createKnowledgeDomainRequestSchema.safeParse(body);
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
      return await this.domains.create(
        organisationId,
        workspaceId,
        parsed.data,
        request.principal!,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }

  @Post(':domainId/policy')
  @Requires('knowledge_domain:manage')
  async updatePolicy(
    @Param('workspaceId') workspaceId: string,
    @Param('domainId') domainId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<KnowledgeDomainView> {
    const parsed = updateKnowledgeDomainPolicyRequestSchema.safeParse(body);
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
      return await this.domains.updatePolicy(
        workspaceId,
        domainId,
        parsed.data,
        request.principal!,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }
}
