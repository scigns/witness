/**
 * HTTP adapter for candidate decisions/commitments/actions — read-only,
 * gated by `outcome:create` (the same permission proposing one from scratch
 * already requires, since accepting a candidate is exactly that).
 */

import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import type { OutcomeCandidateView } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { OutcomeCandidateService } from './outcome-candidate.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/outcome-candidates')
@UseGuards(AuthorizationGuard)
export class OutcomeCandidateController {
  constructor(private readonly candidates: OutcomeCandidateService) {}

  @Get()
  @Requires('outcome:create')
  async suggest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ candidates: OutcomeCandidateView[] }> {
    return { candidates: await this.candidates.suggest(workspaceId, sessionId) };
  }
}
