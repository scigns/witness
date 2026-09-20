/**
 * Read-only graph traversal — the "traversal APIs" deliverable of Phase 2.
 * Thin wrapper over `@witness/knowledge-graph`'s `Neo4jGraphRepository`,
 * constructed here (not through `@witness/config`, which does not yet model
 * Neo4j settings — a narrower, honest scope than teaching the shared,
 * heavily-validated config loader a new subsystem in the same pass) from
 * env vars read once at module init.
 *
 * This is the one place `knowledge_entity:read` (aggregate visibility) and
 * `knowledge_provenance:inspect` (evidence/provenance visibility) are
 * enforced as genuinely separate gates — see the controller.
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';

import {
  Neo4jGraphRepository,
  type GraphEdge,
  type GraphNode,
  type ProvenanceRecord,
} from '@witness/knowledge-graph';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} must be set to use the knowledge graph query API.`);
  }
  return value;
}

@Injectable()
export class KnowledgeGraphQueryService implements OnModuleDestroy {
  private repository: Neo4jGraphRepository | null = null;

  private getRepository(): Neo4jGraphRepository {
    if (this.repository === null) {
      this.repository = Neo4jGraphRepository.connect({
        uri: requiredEnv('NEO4J_URI'),
        user: process.env['NEO4J_READONLY_USER'] ?? requiredEnv('NEO4J_USER'),
        password: process.env['NEO4J_READONLY_PASSWORD'] ?? requiredEnv('NEO4J_PASSWORD'),
      });
    }
    return this.repository;
  }

  async neighbourhood(
    organisationId: string,
    workspaceId: string,
    entityId: string,
    depth?: number,
    relationshipTypes?: string[],
  ): Promise<{ nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }> {
    return this.getRepository().neighbourhood({
      organisationId,
      workspaceId,
      entityId,
      ...(depth !== undefined ? { depth } : {}),
      ...(relationshipTypes !== undefined ? { relationshipTypes } : {}),
    });
  }

  async provenanceForNode(
    organisationId: string,
    entityId: string,
  ): Promise<readonly ProvenanceRecord[]> {
    return this.getRepository().provenanceForNode({ organisationId }, entityId);
  }

  async provenanceForEdge(
    organisationId: string,
    relationshipId: string,
  ): Promise<readonly ProvenanceRecord[]> {
    return this.getRepository().provenanceForEdge({ organisationId }, relationshipId);
  }

  async search(
    organisationId: string,
    workspaceId: string,
    query: string,
  ): Promise<readonly GraphNode[]> {
    return this.getRepository().search({ organisationId, workspaceId }, query);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.repository !== null) await this.repository.close();
  }
}
