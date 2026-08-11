/**
 * Application layer for evidence attachments — the audio recording backing
 * one piece of `Evidence`.
 *
 * Same consent posture as `EvidenceService.resolveConsentBasis`: a refused
 * or missing consent answer throws `ForbiddenException` before anything is
 * written, and this service never re-derives that decision itself — it asks
 * `ConsentPolicyService.mayRecordAudio`, the same question capture already
 * asks for the `attributed`/`anonymous` quotation categories. Evidence with
 * no source participant (institutional-source, unattributed) has no consent
 * to check, same as capture.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { captureEvidenceAttachment, toEvidenceAttachmentId, toEvidenceId } from '@witness/domain';
import type { EvidenceAttachmentView } from '@witness/contracts';
import type { WitnessConfig } from '@witness/config';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { WITNESS_CONFIG } from '../tokens.js';
import type { Principal } from '../authz/authorization.port.js';

export interface UploadedAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface EvidenceAttachmentContent {
  filename: string;
  contentType: string;
  content: Buffer;
}

@Injectable()
export class EvidenceAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
    @Inject(WITNESS_CONFIG) private readonly config: WitnessConfig,
  ) {}

  async upload(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    file: UploadedAttachmentFile | undefined,
    principal: Principal,
  ): Promise<EvidenceAttachmentView> {
    if (file === undefined) {
      throw new BadRequestException({
        error: { code: 'FILE_REQUIRED', message: "No file was received in the 'file' field." },
      });
    }

    const maxBytes = this.config.maxEvidenceAttachmentMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException({
        error: {
          code: 'FILE_TOO_LARGE',
          message:
            `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ` +
            `${this.config.maxEvidenceAttachmentMb} MB.`,
        },
      });
    }

    const evidenceRow = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const existing = await this.prisma.evidenceAttachment.findUnique({ where: { evidenceId } });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'ATTACHMENT_EXISTS',
          message:
            `Evidence '${evidenceId}' already has an attachment. Withdraw this evidence and ` +
            'capture a new one to replace it.',
        },
      });
    }

    const now = new Date();

    if (evidenceRow.sourceParticipantId !== null) {
      const consent = await this.consentPolicy.mayRecordAudio(
        sessionId,
        evidenceRow.sourceParticipantId,
        now,
      );
      if (!consent.allowed) {
        throw new ForbiddenException({
          error: { code: 'CONSENT_NOT_GRANTED', message: consent.reason },
        });
      }
    }

    const actor = await resolveActor(this.prisma, principal);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    const outcome = captureEvidenceAttachment({
      id: toEvidenceAttachmentId(randomUUID()),
      evidenceId: toEvidenceId(evidenceId),
      kind: 'audio',
      originalFilename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256,
      capturedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.evidenceAttachment.create({
        data: {
          id: outcome.attachment.id,
          evidenceId: outcome.attachment.evidenceId,
          kind: outcome.attachment.kind,
          originalFilename: outcome.attachment.originalFilename,
          contentType: outcome.attachment.contentType,
          sizeBytes: outcome.attachment.sizeBytes,
          checksumSha256: outcome.attachment.checksumSha256,
          content: file.buffer,
          createdAt: outcome.attachment.createdAt,
        },
      });

      await appendAuditEvent(tx, 'evidence_attachment', outcome.attachment.id, outcome.event, now);
    });

    return {
      id: outcome.attachment.id,
      evidenceId: outcome.attachment.evidenceId,
      kind: outcome.attachment.kind,
      originalFilename: outcome.attachment.originalFilename,
      contentType: outcome.attachment.contentType,
      sizeBytes: outcome.attachment.sizeBytes,
      checksumSha256: outcome.attachment.checksumSha256,
      createdAt: outcome.attachment.createdAt.toISOString(),
    };
  }

  async content(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<EvidenceAttachmentContent> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const row = await this.prisma.evidenceAttachment.findUnique({ where: { evidenceId } });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'ATTACHMENT_NOT_FOUND',
          message: `Evidence '${evidenceId}' has no attachment.`,
        },
      });
    }

    return { filename: row.originalFilename, contentType: row.contentType, content: row.content };
  }

  private async requireEvidenceRow(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<{ sourceParticipantId: string | null }> {
    const row = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      select: { workspaceId: true, sessionId: true, sourceParticipantId: true },
    });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence '${evidenceId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }
}
