/**
 * Application layer for evidence attachments — the audio, document, or image
 * file backing one piece of `Evidence`.
 *
 * Same consent posture as `EvidenceService.resolveConsentBasis`: a refused
 * or missing consent answer throws `ForbiddenException` before anything is
 * written, and this service never re-derives that decision itself. Which
 * question it asks depends on the file's kind (`inferAttachmentKind`,
 * `evidence-attachment.ts`'s file header): `audio` asks
 * `ConsentPolicyService.mayRecordAudio`; `document`/`image` ask
 * `maySubmitEvidence` — a participant consenting to be recorded is not the
 * same question as a participant consenting to hand over an existing
 * document or photo. Neither question says anything about a third party the
 * file's content may identify, or about what may be done with it afterwards
 * (transcription, AI processing, publication, ... — each its own category,
 * asked elsewhere, unaffected by this one). Evidence with no source
 * participant (institutional-source, unattributed) has no consent to check,
 * same as capture.
 *
 * The declared content type is also checked against the file's actual bytes
 * (`matchesDeclaredContentType`) before any of that, for `document`/`image`
 * — the two kinds this build serves back for direct browser rendering or
 * download. Trusting the caller-supplied `Content-Type` alone would let
 * arbitrary bytes be stored and later served back as if they were a real
 * PDF or image.
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

import {
  captureEvidenceAttachment,
  inferAttachmentKind,
  InvariantViolation,
  matchesDeclaredContentType,
  toEvidenceAttachmentId,
  toEvidenceId,
} from '@witness/domain';
import type { EvidenceAttachmentView } from '@witness/contracts';
import type { WitnessConfig } from '@witness/config';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { StoragePort } from '../storage/storage.port.js';
import { objectKey, resolveStoredContent } from '../storage/storage.service.js';
import { StorageQuotaService } from '../organisations/storage-quota.service.js';
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
    @Inject(StoragePort) private readonly storage: StoragePort | null,
    private readonly storageQuota: StorageQuotaService,
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

    const kind = inferAttachmentKind(file.mimetype);
    if (kind === null) {
      throw new BadRequestException({
        error: {
          code: 'UNSUPPORTED_CONTENT_TYPE',
          message: `'${file.mimetype}' is not a supported evidence attachment format.`,
        },
      });
    }

    if (!matchesDeclaredContentType(file.mimetype, file.buffer)) {
      throw new BadRequestException({
        error: {
          code: 'CONTENT_TYPE_MISMATCH',
          message: `This file's contents do not look like '${file.mimetype}'.`,
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

    // Consent is checked — and can refuse the request — before the quota
    // check or anything is written. A denied submission must cost the
    // organisation nothing: no DB row, no object storage write, no quota
    // consumed.
    if (evidenceRow.sourceParticipantId !== null) {
      const consent =
        kind === 'audio'
          ? await this.consentPolicy.mayRecordAudio(sessionId, evidenceRow.sourceParticipantId, now)
          : await this.consentPolicy.maySubmitEvidence(
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

    try {
      await this.storageQuota.checkQuota(evidenceRow.organisationId, file.size);
    } catch (error) {
      if (error instanceof InvariantViolation && error.code === 'STORAGE_QUOTA_EXCEEDED') {
        throw new PayloadTooLargeException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }

    const actor = await resolveActor(this.prisma, principal);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    const outcome = captureEvidenceAttachment({
      id: toEvidenceAttachmentId(randomUUID()),
      evidenceId: toEvidenceId(evidenceId),
      kind,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256,
      capturedBy: actor,
      at: now,
    });

    // Written before the transaction, not after: if this put fails, nothing
    // has touched the database and the request simply fails. The reverse
    // order risks a committed row pointing at an object that was never
    // written, which is a broken reference rather than wasted storage.
    let storageKey: string | null = null;
    if (this.storage !== null) {
      storageKey = objectKey({
        organisationId: evidenceRow.organisationId,
        kind: 'evidence-attachment',
        id: outcome.attachment.id,
      });
      await this.storage.put(storageKey, file.buffer, file.mimetype);
    }

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
          content: storageKey === null ? file.buffer : null,
          storageKey,
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

    let content: Buffer;
    try {
      content = await resolveStoredContent(this.storage, row);
    } catch (error) {
      // Data-integrity states (object storage disabled/missing an object
      // that a record still points at), not "no attachment exists" — but
      // surfaced as 404 either way, since there is no content to return
      // regardless of which is true, and the distinction is an operator
      // concern, not a caller one.
      throw new NotFoundException({
        error: {
          code: 'ATTACHMENT_NOT_FOUND',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }

    return { filename: row.originalFilename, contentType: row.contentType, content };
  }

  private async requireEvidenceRow(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<{ organisationId: string; sourceParticipantId: string | null }> {
    const row = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      select: {
        workspaceId: true,
        sessionId: true,
        organisationId: true,
        sourceParticipantId: true,
      },
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
