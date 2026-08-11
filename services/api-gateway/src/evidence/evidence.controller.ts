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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import {
  captureEvidenceRequestSchema,
  createEvidenceLinkRequestSchema,
  editTranscriptRequestSchema,
  evidenceTransitionRequestSchema,
  transcriptVersionRequestSchema,
  updateEvidenceDraftRequestSchema,
  type EvidenceAttachmentView,
  type EvidenceDetail,
  type EvidenceLinkView,
  type EvidenceSummary,
  type TranscriptView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { EvidenceService } from './evidence.service.js';
import { EvidenceAttachmentService } from './evidence-attachment.service.js';
import { EvidenceLinkService } from './evidence-link.service.js';
import { TranscriptService } from './transcript.service.js';

/**
 * A memory-safety backstop, not the product limit — `EvidenceAttachmentService`
 * enforces the real, configurable `WITNESS_MAX_EVIDENCE_ATTACHMENT_MB` cap
 * once it can see the file's actual size. This just stops multer from
 * buffering something absurd into process memory before that check runs.
 */
const MULTER_HARD_CEILING_BYTES = 500 * 1024 * 1024;

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/evidence')
@UseGuards(AuthorizationGuard)
export class EvidenceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly links: EvidenceLinkService,
    private readonly attachments: EvidenceAttachmentService,
    private readonly transcripts: TranscriptService,
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

  /**
   * Attaching a file is enriching the evidence record, not a separate
   * lifecycle action — same permission as editing the draft (`evidence:update`).
   */
  @Post(':evidenceId/attachment')
  @Requires('evidence:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async uploadAttachment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: RequestWithPrincipal,
  ): Promise<EvidenceAttachmentView> {
    return this.translateDomainErrors(() =>
      this.attachments.upload(workspaceId, sessionId, evidenceId, file, request.principal!),
    );
  }

  @Get(':evidenceId/attachment/content')
  @Requires('evidence:read')
  async downloadAttachment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.content(workspaceId, sessionId, evidenceId);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition':
        `attachment; filename="${file.filename.replace(/"/g, '')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Content-Length': String(file.content.length),
    });
    res.send(file.content);
  }

  @Post(':evidenceId/transcript')
  @Requires('transcript:create')
  async requestTranscript(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<TranscriptView> {
    return this.transcripts.request(workspaceId, sessionId, evidenceId, request.principal!);
  }

  @Post(':evidenceId/transcript/retry')
  @HttpCode(200)
  @Requires('transcript:create')
  async retryTranscript(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<TranscriptView> {
    return this.transcripts.retry(workspaceId, sessionId, evidenceId, request.principal!);
  }

  @Get(':evidenceId/transcript')
  @Requires('transcript:read')
  async getTranscript(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ): Promise<TranscriptView> {
    return this.transcripts.get(workspaceId, sessionId, evidenceId);
  }

  @Patch(':evidenceId/transcript')
  @Requires('transcript:update')
  async editTranscript(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<TranscriptView> {
    const parsed = editTranscriptRequestSchema.safeParse(body);
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
      this.transcripts.edit(workspaceId, sessionId, evidenceId, parsed.data, request.principal!),
    );
  }

  @Post(':evidenceId/transcript/confirm')
  @HttpCode(200)
  @Requires('transcript:update')
  async confirmTranscript(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<TranscriptView> {
    const parsed = transcriptVersionRequestSchema.safeParse(body);
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
      this.transcripts.confirm(
        workspaceId,
        sessionId,
        evidenceId,
        parsed.data.expectedVersion,
        request.principal!,
      ),
    );
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
