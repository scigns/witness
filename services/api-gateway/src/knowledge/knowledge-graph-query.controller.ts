/**
 * The "Why is this relationship here?" endpoint lives here
 * (`provenanceForNode`/`provenanceForEdge`), gated on
 * `knowledge_provenance:inspect` — a genuinely separate permission from
 * `knowledge_entity:read`, which only gates the aggregate `neighbourhood`
 * and `search` endpoints. A reader-tier caller (a reporting user, or the
 * `participant` WitnessRole) can traverse the graph's shape but cannot call
 * either provenance endpoint — this is the API-layer half of "the graph
 * must never expose evidence or participant identity merely because an
 * aggregate concept is visible."
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import type { GraphEdge, GraphNode, ProvenanceRecord } from '@witness/knowledge-graph';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { KnowledgeGraphQueryService } from './knowledge-graph-query.service.js';

@Controller('api/v1/organisations/:organisationId/workspaces/:workspaceId/knowledge/graph')
@UseGuards(AuthorizationGuard)
export class KnowledgeGraphQueryController {
  constructor(private readonly graph: KnowledgeGraphQueryService) {}

  @Get('entities/:entityId/neighbourhood')
  @Requires('knowledge_entity:read')
  async neighbourhood(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Query('depth') depth: string | undefined,
    @Query('relationshipTypes') relationshipTypes: string | undefined,
  ): Promise<{ nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }> {
    return this.graph.neighbourhood(
      organisationId,
      workspaceId,
      entityId,
      depth ? Number(depth) : undefined,
      relationshipTypes ? relationshipTypes.split(',') : undefined,
    );
  }

  @Get('entities/:entityId/provenance')
  @Requires('knowledge_provenance:inspect')
  async provenanceForNode(
    @Param('organisationId') organisationId: string,
    @Param('entityId') entityId: string,
  ): Promise<{ provenance: readonly ProvenanceRecord[] }> {
    return { provenance: await this.graph.provenanceForNode(organisationId, entityId) };
  }

  @Get('relationships/:relationshipId/provenance')
  @Requires('knowledge_provenance:inspect')
  async provenanceForEdge(
    @Param('organisationId') organisationId: string,
    @Param('relationshipId') relationshipId: string,
  ): Promise<{ provenance: readonly ProvenanceRecord[] }> {
    return { provenance: await this.graph.provenanceForEdge(organisationId, relationshipId) };
  }

  @Get('search')
  @Requires('knowledge_entity:read')
  async search(
    @Param('organisationId') organisationId: string,
    @Param('workspaceId') workspaceId: string,
    @Query('q') q: string,
  ): Promise<{ results: readonly GraphNode[] }> {
    return { results: await this.graph.search(organisationId, workspaceId, q ?? '') };
  }
}
