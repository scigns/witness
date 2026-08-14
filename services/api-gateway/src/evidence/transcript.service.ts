/**
 * Application layer for evidence transcription.
 *
 * `request()` returns as soon as a `pending` row exists — the actual
 * transcription (`runTranscription`) is kicked off but not awaited, because
 * local CPU inference over a multi-minute recording can take minutes, and
 * an HTTP request should not block on that. The process staying alive is
 * what keeps that unawaited work running to completion; this is a
 * single-node deployment (ADR-0013), so there is no second instance for the
 * job to get lost between.
 *
 * Consent is checked once, at `request()` time, the same way
 * `EvidenceAttachmentService` and `EvidenceService.resolveConsentBasis` do
 * it — `ConsentPolicyService.mayTranscribe` is asked before anything is
 * written, and a refusal throws before the domain layer runs at all.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  beginTranscriptionProcessing,
  completeTranscription,
  confirmTranscript,
  editTranscript,
  effectiveTranscriptText,
  failTranscription,
  requestTranscription,
  retryTranscription,
  toEvidenceAttachmentId,
  toEvidenceId,
  toTranscriptId,
  type Transcript,
  type TranscriptSegment,
} from '@witness/domain';
import type { EditTranscriptRequest, TranscriptView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { TranscriptionPort } from '../transcription/transcription.port.js';
import { StoragePort } from '../storage/storage.port.js';
import { resolveStoredContent } from '../storage/storage.service.js';
import type { Principal } from '../authz/authorization.port.js';

const SYSTEM_PRINCIPAL: Principal = {
  subject: 'system:local-transcription',
  displayName: 'Local transcription',
  kind: 'system',
  roles: [],
};

type TranscriptRow = {
  id: string;
  evidenceId: string;
  attachmentId: string;
  status: string;
  generatedText: string | null;
  editedText: string | null;
  segments: unknown;
  model: string | null;
  language: string | null;
  confirmed: boolean;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
    private readonly transcription: TranscriptionPort,
    @Inject(StoragePort) private readonly storage: StoragePort | null,
  ) {}

  async request(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    principal: Principal,
  ): Promise<TranscriptView> {
    const evidenceRow = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const attachment = await this.prisma.evidenceAttachment.findUnique({ where: { evidenceId } });
    if (attachment === null) {
      throw new BadRequestException({
        error: {
          code: 'ATTACHMENT_REQUIRED',
          message: 'This evidence has no audio attached yet — attach a recording first.',
        },
      });
    }

    const existing = await this.prisma.transcript.findUnique({ where: { evidenceId } });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'TRANSCRIPT_EXISTS',
          message: `Evidence '${evidenceId}' already has a transcript. Retry it instead of requesting a new one.`,
        },
      });
    }

    const now = new Date();

    if (evidenceRow.sourceParticipantId !== null) {
      const consent = await this.consentPolicy.mayTranscribe(
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
    const outcome = requestTranscription({
      id: toTranscriptId(randomUUID()),
      evidenceId: toEvidenceId(evidenceId),
      attachmentId: toEvidenceAttachmentId(attachment.id),
      requestedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.transcript.create({ data: toCreateRow(outcome.transcript) });
      await appendAuditEvent(tx, 'transcript', outcome.transcript.id, outcome.event, now);
    });

    this.runTranscription(outcome.transcript.id, evidenceId).catch((error: unknown) => {
      this.logger.error(
        `Unhandled error running transcript '${outcome.transcript.id}': ` +
          (error instanceof Error ? error.message : String(error)),
      );
    });

    return toView(outcome.transcript);
  }

  async retry(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    principal: Principal,
  ): Promise<TranscriptView> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireTranscriptRow(evidenceId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = retryTranscription(toDomain(row), actor, now);
    await this.persist(row.id, outcome.transcript, outcome.event, now);

    this.runTranscription(row.id, evidenceId).catch((error: unknown) => {
      this.logger.error(
        `Unhandled error running transcript '${row.id}': ` +
          (error instanceof Error ? error.message : String(error)),
      );
    });

    return toView(outcome.transcript);
  }

  async get(workspaceId: string, sessionId: string, evidenceId: string): Promise<TranscriptView> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireTranscriptRow(evidenceId);
    return toView(toDomain(row));
  }

  async edit(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    request: EditTranscriptRequest,
    principal: Principal,
  ): Promise<TranscriptView> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireTranscriptRow(evidenceId);
    this.assertVersion(row, request.expectedVersion);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = editTranscript(toDomain(row), request.editedText, actor, now);
    await this.persist(row.id, outcome.transcript, outcome.event, now);

    return toView(outcome.transcript);
  }

  async confirm(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    expectedVersion: number,
    principal: Principal,
  ): Promise<TranscriptView> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireTranscriptRow(evidenceId);
    this.assertVersion(row, expectedVersion);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = confirmTranscript(toDomain(row), actor, now);
    await this.persist(row.id, outcome.transcript, outcome.event, now);

    return toView(outcome.transcript);
  }

  /**
   * The background job. Not part of the request/response cycle — errors are
   * caught by the caller, which logs them; a stuck `processing` row is a
   * known limitation of a single-process job runner, not silently hidden as
   * a false "succeeded".
   */
  private async runTranscription(transcriptId: string, evidenceId: string): Promise<void> {
    const [transcriptRow, attachment] = await Promise.all([
      this.prisma.transcript.findUnique({ where: { id: transcriptId } }),
      this.prisma.evidenceAttachment.findUnique({ where: { evidenceId } }),
    ]);
    if (transcriptRow === null || attachment === null) return;

    const systemActor = await resolveActor(this.prisma, SYSTEM_PRINCIPAL);
    const startedAt = new Date();
    const processing = beginTranscriptionProcessing(
      toDomain(transcriptRow),
      systemActor,
      startedAt,
    );
    await this.persist(transcriptId, processing.transcript, processing.event, startedAt);

    try {
      const content = await resolveStoredContent(this.storage, attachment);
      const result = await this.transcription.transcribe(content, attachment.contentType);
      const now = new Date();
      const outcome = completeTranscription(
        processing.transcript,
        {
          text: result.text,
          segments: result.segments,
          model: result.model,
          language: result.language,
        },
        systemActor,
        now,
      );
      await this.persist(transcriptId, outcome.transcript, outcome.event, now);
    } catch (error) {
      const now = new Date();
      const reason = error instanceof Error ? error.message : String(error);
      const outcome = failTranscription(
        processing.transcript,
        reason.slice(0, 2000),
        systemActor,
        now,
      );
      await this.persist(transcriptId, outcome.transcript, outcome.event, now);
    }
  }

  private async persist(
    id: string,
    transcript: Transcript,
    event: ReturnType<typeof requestTranscription>['event'],
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.transcript.update({ where: { id }, data: toUpdateRow(transcript) });
      await appendAuditEvent(tx, 'transcript', id, event, at);
    });
  }

  private assertVersion(row: TranscriptRow, expectedVersion: number): void {
    if (row.version !== expectedVersion) {
      throw new ConflictException({
        error: {
          code: 'STALE_VERSION',
          message: 'This transcript was changed since you last loaded it. Reload and try again.',
        },
      });
    }
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

  private async requireTranscriptRow(evidenceId: string): Promise<TranscriptRow> {
    const row = await this.prisma.transcript.findUnique({ where: { evidenceId } });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'TRANSCRIPT_NOT_FOUND',
          message: `Evidence '${evidenceId}' has no transcript.`,
        },
      });
    }
    return row;
  }
}

export function toDomain(row: TranscriptRow): Transcript {
  return {
    id: toTranscriptId(row.id),
    evidenceId: toEvidenceId(row.evidenceId),
    attachmentId: toEvidenceAttachmentId(row.attachmentId),
    status: row.status as Transcript['status'],
    generatedText: row.generatedText,
    editedText: row.editedText,
    segments: (row.segments as TranscriptSegment[] | null) ?? [],
    model: row.model,
    language: row.language,
    confirmed: row.confirmed,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCreateRow(transcript: Transcript) {
  return {
    id: transcript.id,
    evidenceId: transcript.evidenceId,
    attachmentId: transcript.attachmentId,
    ...toUpdateRow(transcript),
    createdAt: transcript.createdAt,
  };
}

function toUpdateRow(transcript: Transcript) {
  return {
    status: transcript.status,
    generatedText: transcript.generatedText,
    editedText: transcript.editedText,
    segments: transcript.segments as unknown as object,
    model: transcript.model,
    language: transcript.language,
    confirmed: transcript.confirmed,
    failureReason: transcript.failureReason,
    updatedAt: transcript.updatedAt,
    version: transcript.version,
  };
}

export function toView(transcript: Transcript): TranscriptView {
  return {
    id: transcript.id,
    evidenceId: transcript.evidenceId,
    attachmentId: transcript.attachmentId,
    status: transcript.status,
    generatedText: transcript.generatedText,
    editedText: transcript.editedText,
    effectiveText: effectiveTranscriptText(transcript),
    segments: transcript.segments.map((s) => ({
      text: s.text,
      startMs: s.startMs,
      endMs: s.endMs,
    })),
    model: transcript.model,
    language: transcript.language,
    confirmed: transcript.confirmed,
    failureReason: transcript.failureReason,
    createdAt: transcript.createdAt.toISOString(),
    updatedAt: transcript.updatedAt.toISOString(),
    version: transcript.version,
  };
}
