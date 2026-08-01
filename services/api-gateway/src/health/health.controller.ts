/**
 * Health and readiness.
 *
 * Two endpoints with genuinely different jobs:
 *
 *   /health  — liveness. Is the process alive? Never touches the database, so a
 *              database outage does not cause an orchestrator to kill and
 *              restart application containers that are working perfectly.
 *   /ready   — readiness. Can this instance serve traffic? Checks dependencies.
 *
 * Conflating the two is how a brief database blip becomes a cascading restart
 * loop across every replica.
 *
 * The response also names what this build does NOT do. A Developer Preview that
 * lets a user guess whether a missing capability is broken or simply unbuilt is
 * failing them.
 */

import { Controller, Get, Header, HttpCode, Inject } from '@nestjs/common';

import type { HealthResponse } from '@witness/contracts';
import type { WitnessConfig } from '@witness/config';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { BUILD_INFO } from '../build-info.js';
import { WITNESS_CONFIG } from '../tokens.js';

/**
 * Capabilities the architecture specifies and this build does not implement.
 *
 * Kept here, served over the API and rendered in the UI, so that one list is the
 * single answer to "what is missing" — three separate lists would disagree
 * within a month.
 */
const NOT_IMPLEMENTED: readonly string[] = [
  'AI extraction of candidate assertions (Phase 5)',
  'Transcription and diarisation (Phase 5)',
  'Knowledge graph projection (Phase 4)',
  'Consent service — grants, scopes, revocation (Phase 3)',
  'Keycloak authentication and Casbin authorisation (Phase 2)',
  'Hybrid search (Phase 6)',
  'Multi-tenant isolation and row-level security (Phase 3)',
  'Event-driven projection rebuild (Phase 4)',
];

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WITNESS_CONFIG) private readonly config: WitnessConfig,
  ) {}

  /** Liveness. Deliberately does no I/O. */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok'; version: string; buildId: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      version: BUILD_INFO.version,
      buildId: BUILD_INFO.buildId,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /** Readiness. Checks every dependency this build actually uses. */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async ready(): Promise<HealthResponse> {
    const components: HealthResponse['components'] = {};

    try {
      const latencyMs = await this.prisma.ping();
      components['postgres'] = {
        status: latencyMs < 1000 ? 'ok' : 'degraded',
        detail: 'System of record (ADR-0004)',
        latencyMs,
      };
    } catch (error) {
      components['postgres'] = {
        status: 'down',
        // The message, not the stack, and never the connection string — that
        // carries a password.
        detail: `Unreachable: ${error instanceof Error ? error.message.slice(0, 120) : 'unknown'}`,
      };
    }

    // Reported as not_configured rather than omitted. An operator reading this
    // should see that these are known parts of the architecture that this build
    // does not use yet, not wonder whether the check is missing.
    components['neo4j'] = { status: 'not_configured', detail: 'Graph projection — Phase 4' };
    components['opensearch'] = { status: 'not_configured', detail: 'Lexical index — Phase 6' };
    components['keycloak'] = { status: 'not_configured', detail: 'Identity — Phase 2 (ADR-0007)' };
    components['ollama'] = {
      status: 'not_configured',
      detail: 'Local inference — Phase 5 (ADR-0009)',
    };

    const statuses = Object.values(components).map((component) => component.status);
    const status: HealthResponse['status'] = statuses.includes('down')
      ? 'down'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'ok';

    return {
      status,
      version: BUILD_INFO.version,
      buildId: BUILD_INFO.buildId,
      instanceName: this.config.instanceName,
      profile: this.config.profile,
      dataResidency: this.config.dataResidency,
      externalInferenceEnabled: this.config.externalInferenceEnabled,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      components,
      notImplemented: [...NOT_IMPLEMENTED],
    };
  }
}
