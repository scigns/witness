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
import { createHash } from 'node:crypto';

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
import { validateUploadMetadata } from '../storage/upload-metadata.js';
import { StoragePort } from '../storage/storage.port.js';
import { resolveStoredContent } from '../storage/storage.service.js';
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
    requestKey?: string,
  ): Promise<EvidenceAttachmentView> {
    if (file === undefined) {
      throw new BadRequestException({
        error: { code: 'FILE_REQUIRED', message: "No file was received in the 'file' field." },
      });
    }

    const maxBytes = this.config.maxEvidenceAttachmentMb * 1024 * 1024;
    if (file.size > maxBytes || file.buffer.length > maxBytes) {
      throw new PayloadTooLargeException({
        error: {
          code: 'FILE_TOO_LARGE',
          message:
            `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ` +
            `${this.config.maxEvidenceAttachmentMb} MB.`,
        },
      });
    }

    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size !== file.buffer.length) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_STORAGE_SIZE',
          message: 'The upload byte count does not match its content.',
        },
      });
    }

    validateUploadMetadata(file.originalname, file.mimetype);

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
    if (existing !== null && requestKey === undefined) {
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

    const actor = await resolveActor(this.prisma, principal);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    let reservation;
    try {
      reservation = await this.storageQuota.reserve({
        organisationId: evidenceRow.organisationId,
        requestKey,
        requestFingerprint: createHash('sha256')
          .update(
            JSON.stringify([
              principal.subject,
              workspaceId,
              sessionId,
              evidenceId,
              file.originalname,
              file.mimetype,
              checksumSha256,
            ]),
          )
          .digest('hex'),
        kind: 'evidence-attachment',
        sizeBytes: file.size,
        objectStorage: this.storage !== null,
        actor,
      });
    } catch (error) {
      if (error instanceof InvariantViolation && error.code === 'STORAGE_QUOTA_EXCEEDED')
        throw new PayloadTooLargeException({ error: { code: error.code, message: error.message } });
      throw error;
    }
    if (reservation.state === 'COMMITTED') {
      if (existing === null || existing.id !== reservation.targetId)
        throw new ConflictException({
          error: {
            code: 'UPLOAD_REPLAY_UNAVAILABLE',
            message: 'The original upload record is no longer available.',
          },
        });
      return {
        id: existing.id,
        evidenceId: existing.evidenceId,
        kind: existing.kind as EvidenceAttachmentView['kind'],
        originalFilename: existing.originalFilename,
        contentType: existing.contentType,
        sizeBytes: existing.sizeBytes,
        checksumSha256: existing.checksumSha256,
        createdAt: existing.createdAt.toISOString(),
      };
    }
    if (existing !== null) {
      await this.storageQuota.releaseKnownFailure(reservation, actor);
      throw new ConflictException({
        error: { code: 'ATTACHMENT_EXISTS', message: 'This evidence already has an attachment.' },
      });
    }

    const outcome = captureEvidenceAttachment({
      id: toEvidenceAttachmentId(reservation.targetId),
      evidenceId: toEvidenceId(evidenceId),
      kind,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256,
      capturedBy: actor,
      at: now,
    });

    const storageKey = reservation.storageKey;
    let putCompleted = false;
    try {
      await this.storageQuota.claim(reservation);
      if (storageKey !== null && this.storage !== null) {
        await this.storage.put(storageKey, file.buffer, file.mimetype);
      }
      putCompleted = true;
      await this.prisma.$transaction(async (tx) => {
        await this.storageQuota.checkReservation(tx, reservation, actor, now);

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

        await this.storageQuota.commitReservation(tx, reservation);
        await appendAuditEvent(
          tx,
          'evidence_attachment',
          outcome.attachment.id,
          outcome.event,
          now,
        );
      });
    } catch (error) {
      if (error instanceof InvariantViolation && putCompleted) {
        try {
          if (storageKey !== null && this.storage !== null) await this.storage.delete(storageKey);
          await this.storageQuota.releaseKnownFailure(reservation, actor);
        } catch {
          await this.storageQuota.markUncertain(reservation);
        }
      } else {
        await this.storageQuota.markUncertain(reservation);
      }
      if (error instanceof InvariantViolation && error.code === 'STORAGE_QUOTA_EXCEEDED') {
        throw new PayloadTooLargeException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }

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
    const evidence = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

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
      content = await resolveStoredContent(this.storage, row, {
        organisationId: evidence.organisationId,
        kind: 'evidence-attachment',
        id: row.id,
      });
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
