/**
 * HTTP adapter for candidate decisions/commitments/actions — gated by
 * `outcome:create` (the same permission proposing one from scratch already
 * requires, since accepting a candidate is exactly that). `POST` starts a
 * background job and returns immediately; `GET` polls it — see
 * `OutcomeCandidateService`'s file header for why this is async rather than
 * a single blocking request.
 */

import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import type { OutcomeCandidateJobView } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { OutcomeCandidateService } from './outcome-candidate.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/outcome-candidates')
@UseGuards(AuthorizationGuard)
export class OutcomeCandidateController {
  constructor(private readonly candidates: OutcomeCandidateService) {}

  @Post()
  @Requires('outcome:create')
  async request(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ jobId: string }> {
    return this.candidates.request(workspaceId, sessionId);
  }

  @Get(':jobId')
  @HttpCode(200)
  @Requires('outcome:create')
  getJob(@Param('jobId') jobId: string): OutcomeCandidateJobView {
    return this.candidates.getJob(jobId);
  }
}
