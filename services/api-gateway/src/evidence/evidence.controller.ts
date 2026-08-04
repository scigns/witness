/**
 * HTTP adapter for structured live evidence capture (BUILD_ROADMAP.md
 * Milestone 5).
 *
 * Nested under `:workspaceId/sessions/:sessionId`, mirroring
 * `ParticipantsController`/`SessionConsentConfigurationController` —
 * `AuthorizationGuard.resolveScope` Casbin-scopes every evidence action the
 * same way, no guard change needed.
 *
 * `updateDraft` and `transition` are separate routes, mirroring
 * `ParticipantsController`'s `update`/`transition` split: editing content is
 * `evidence:update`, while submitting or withdrawing is a named lifecycle
 * transition under `evidence:transition` — the two permissions can diverge
 * (a role that may fix a typo in a draft need not also be trusted to submit
 * it for review, and vice versa).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  captureEvidenceRequestSchema,
  createEvidenceLinkRequestSchema,
  evidenceTransitionRequestSchema,
  updateEvidenceDraftRequestSchema,
  type EvidenceDetail,
  type EvidenceLinkView,
  type EvidenceSummary,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { EvidenceService } from './evidence.service.js';
import { EvidenceLinkService } from './evidence-link.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/evidence')
@UseGuards(AuthorizationGuard)
export class EvidenceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly links: EvidenceLinkService,
  ) {}

  @Get()
  @Requires('evidence:read')
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query('reviewStatus') reviewStatus?: string,
    @Query('evidenceType') evidenceType?: string,
  ): Promise<{ evidence: EvidenceSummary[] }> {
    return {
      evidence: await this.evidence.list(workspaceId, sessionId, { reviewStatus, evidenceType }),
    };
  }

  @Get(':evidenceId')
  @Requires('evidence:read')
  async get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    return this.evidence.get(workspaceId, sessionId, evidenceId, request.principal!);
  }

  @Get(':evidenceId/history')
  @Requires('evidence:read')
  async history(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return { events: await this.evidence.history(workspaceId, sessionId, evidenceId) };
  }

  @Get(':evidenceId/links')
  @Requires('evidence_link:read')
  async listLinks(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ): Promise<{ links: EvidenceLinkView[] }> {
    return { links: await this.links.list(workspaceId, sessionId, evidenceId) };
  }

  @Post()
  @Requires('evidence:create')
  async capture(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    const parsed = captureEvidenceRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.evidence.capture(workspaceId, sessionId, parsed.data, request.principal!),
    );
  }

  @Patch(':evidenceId')
  @Requires('evidence:update')
  async updateDraft(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    const parsed = updateEvidenceDraftRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.evidence.updateDraft(
        workspaceId,
        sessionId,
        evidenceId,
        parsed.data,
        request.principal!,
      ),
    );
  }

  @Post(':evidenceId/transition')
  @HttpCode(200)
  @Requires('evidence:transition')
  async transition(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceDetail> {
    const parsed = evidenceTransitionRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The transition is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.evidence.transition(workspaceId, sessionId, evidenceId, parsed.data, request.principal!),
    );
  }

  @Post(':evidenceId/links')
  @Requires('evidence_link:manage')
  async createLink(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceLinkView> {
    const parsed = createEvidenceLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.links.create(workspaceId, sessionId, evidenceId, parsed.data, request.principal!),
    );
  }

  @Delete(':evidenceId/links/:linkId')
  @HttpCode(204)
  @Requires('evidence_link:manage')
  async removeLink(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    await this.links.remove(workspaceId, sessionId, evidenceId, linkId, request.principal!);
  }

  private async translateDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
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
