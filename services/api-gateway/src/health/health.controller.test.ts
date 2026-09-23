/**
 * `/ready`'s Neo4j component — the "degraded optional capability" distinction
 * Phase 5, Workstream 4.1 asked for: a deployment that has never configured
 * Neo4j must report `not_configured` (and never attempt a connection); a
 * deployment that has, but can't reach it, must report `down` — reporting
 * `ok` in either wrong case is exactly the "healthy while a critical
 * dependency is unavailable" failure mode this check exists to prevent.
 */
import { describe, expect, it } from 'vitest';

import type { WitnessConfig } from '@witness/config';

import { HealthController } from './health.controller.js';
import type { KnowledgeGraphQueryService } from '../knowledge/knowledge-graph-query.service.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

function fakePrisma(): PrismaService {
  return { ping: async () => 5 } as unknown as PrismaService;
}

function fakeConfig(): WitnessConfig {
  return {
    profile: 'development',
    instanceName: 'test',
    dataResidency: 'test',
    externalInferenceEnabled: false,
    oidcIssuer: '',
    localLlmUrl: 'http://localhost:11434',
    localLlmModel: 'test-model',
  } as unknown as WitnessConfig;
}

describe('HealthController — Neo4j component', () => {
  it('reports not_configured, and never attempts a connection, when NEO4J_URI is unset', async () => {
    const knowledgeGraph = {
      isConfigured: () => false,
      ping: async () => {
        throw new Error('ping() must not be called when not configured');
      },
    } as unknown as KnowledgeGraphQueryService;

    const controller = new HealthController(fakePrisma(), knowledgeGraph, fakeConfig());
    const result = await controller.ready();

    expect(result.components['neo4j']).toMatchObject({ status: 'not_configured' });
  });

  it('reports ok with a latency when configured and reachable', async () => {
    const knowledgeGraph = {
      isConfigured: () => true,
      ping: async () => 42,
    } as unknown as KnowledgeGraphQueryService;

    const controller = new HealthController(fakePrisma(), knowledgeGraph, fakeConfig());
    const result = await controller.ready();

    expect(result.components['neo4j']).toMatchObject({ status: 'ok', latencyMs: 42 });
  });

  it('ATTACK — reports down, not ok, when configured but unreachable (never silently healthy)', async () => {
    const knowledgeGraph = {
      isConfigured: () => true,
      ping: async () => {
        throw new Error('connection refused');
      },
    } as unknown as KnowledgeGraphQueryService;

    const controller = new HealthController(fakePrisma(), knowledgeGraph, fakeConfig());
    const result = await controller.ready();

    expect(result.components['neo4j']).toMatchObject({ status: 'down' });
    expect(result.components['neo4j']?.detail).toContain('connection refused');
    // Readiness rolls a `down` component up to the overall status — the
    // whole point of distinguishing this from a merely-degraded dependency.
    expect(result.status).toBe('down');
  });
});
