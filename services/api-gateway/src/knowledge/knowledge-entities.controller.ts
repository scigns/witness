import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  addEntityAliasRequestSchema,
  createKnowledgeEntityRequestSchema,
  mergeKnowledgeEntitiesRequestSchema,
  type EntityAliasView,
  type KnowledgeEntityView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { KnowledgeEntitiesService } from './knowledge-entities.service.js';

function parseOr400<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const zodError = parsed.error as { flatten: () => { fieldErrors: unknown } };
    throw new BadRequestException({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body is not valid.',
        fields: zodError.flatten().fieldErrors,
      },
    });
  }
  return parsed.data as T;
}

@Controller('api/v1/organisations/:organisationId/workspaces/:workspaceId/knowledge/entities')
@UseGuards(AuthorizationGuard)
export class KnowledgeEntitiesController {
  constructor(private readonly entities: KnowledgeEntitiesService) {}

  @Get()
  @Requires('knowledge_entity:read')
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query('entityType') entityType: string | undefined,
  ): Promise<{ entities: KnowledgeEntityView[] }> {
    return { entities: await this.entities.list(workspaceId, entityType) };
  }

  @Get(':entityId')
  @Requires('knowledge_entity:read')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
  ): Promise<KnowledgeEntityView> {
    return this.entities.get(workspaceId, entityId);
  }

  @Post()
  @Requires('knowledge_concept:suggest')
  async create(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<KnowledgeEntityView> {
    const parsed = parseOr400(createKnowledgeEntityRequestSchema, body);
    return this.entities.create(organisationId, workspaceId, parsed, request.principal!);
  }

  @Get(':entityId/aliases')
  @Requires('knowledge_entity:read')
  async listAliases(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
  ): Promise<{ aliases: EntityAliasView[] }> {
    return { aliases: await this.entities.listAliases(workspaceId, entityId) };
  }

  @Post(':entityId/aliases')
  @Requires('knowledge_concept:suggest')
  async addAlias(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EntityAliasView> {
    const parsed = parseOr400(addEntityAliasRequestSchema, body);
    return this.entities.addAlias(workspaceId, entityId, parsed, request.principal!);
  }

  @Post(':entityId/merge')
  @Requires('knowledge_entity:steward')
  async merge(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<KnowledgeEntityView> {
    const parsed = parseOr400(mergeKnowledgeEntitiesRequestSchema, body);
    try {
      return await this.entities.merge(workspaceId, entityId, parsed, request.principal!);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }
}
