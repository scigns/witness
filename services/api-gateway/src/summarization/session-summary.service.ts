/**
 * Application layer for session summaries.
 *
 * Same "return once pending, run the job unawaited" shape as
 * `TranscriptService` — see that file's header for why that is safe on this
 * single-node deployment (ADR-0013).
 *
 * Source-text assembly is this service's own job (ADR-0003: the domain
 * layer never reads the database) — `assembleSource` gathers every
 * not-withdrawn evidence item in the session, together with its confirmed
 * transcript if one exists, and excludes any participant-linked item where
 * `ConsentPolicyService.mayProcessWithAi` refuses. That is an exclusion, not
 * a hard failure: one participant withholding AI-processing consent must
 * not block a summary of everyone else's contributions.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  beginSummaryProcessing,
  completeSummary,
  confirmSummary,
  editSummary,
  effectiveSummaryText,
  failSummary,
  requestSummary,
  retrySummary,
  toCoDesignSessionId,
  toEvidenceId,
  toSessionSummaryId,
  type SessionSummary,
} from '@witness/domain';
import type { EditSummaryRequest, SessionSummaryView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { LlmPort } from './llm.port.js';
import type { Principal } from '../authz/authorization.port.js';

const SYSTEM_PRINCIPAL: Principal = {
  subject: 'system:local-summarisation',
  displayName: 'Local summarisation',
  kind: 'system',
  roles: [],
};

const SOURCE_TEXT_MAX = 12_000;

type SummaryRow = {
  id: string;
  sessionId: string;
  status: string;
  sourceEvidenceIds: string[];
  generatedText: string | null;
  editedText: string | null;
  model: string | null;
  confirmed: boolean;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

@Injectable()
export class SessionSummaryService {
  private readonly logger = new Logger(SessionSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
    private readonly llm: LlmPort,
  ) {}

  async request(
    workspaceId: string,
    sessionId: string,
    principal: Principal,
  ): Promise<SessionSummaryView> {
    await this.requireSessionRow(workspaceId, sessionId);

    const existing = await this.prisma.sessionSummary.findUnique({ where: { sessionId } });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'SUMMARY_EXISTS',
          message: `Session '${sessionId}' already has a summary. Retry it instead of requesting a new one.`,
        },
      });
    }

    const now = new Date();
    const { sourceText, sourceEvidenceIds } = await this.assembleSource(sessionId, now);

    if (sourceText.trim() === '') {
      throw new BadRequestException({
        error: {
          code: 'NO_SOURCE_CONTENT',
          message:
            'There is no consented, non-withdrawn evidence in this session yet to summarise.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const outcome = requestSummary({
      id: toSessionSummaryId(randomUUID()),
      sessionId: toCoDesignSessionId(sessionId),
      sourceEvidenceIds: sourceEvidenceIds.map((id) => toEvidenceId(id)),
      requestedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionSummary.create({ data: toCreateRow(outcome.summary) });
      await appendAuditEvent(tx, 'session_summary', outcome.summary.id, outcome.event, now);
    });

    this.runSummary(outcome.summary.id, sourceText).catch((error: unknown) => {
      this.logger.error(
        `Unhandled error running summary '${outcome.summary.id}': ` +
          (error instanceof Error ? error.message : String(error)),
      );
    });

    return toView(outcome.summary);
  }

  async retry(
    workspaceId: string,
    sessionId: string,
    principal: Principal,
  ): Promise<SessionSummaryView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireSummaryRow(sessionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = retrySummary(toDomain(row), actor, now);
    await this.persist(row.id, outcome.summary, outcome.event, now);

    const { sourceText } = await this.assembleSource(sessionId, now);
    this.runSummary(row.id, sourceText).catch((error: unknown) => {
      this.logger.error(
        `Unhandled error running summary '${row.id}': ` +
          (error instanceof Error ? error.message : String(error)),
      );
    });

    return toView(outcome.summary);
  }

  async get(workspaceId: string, sessionId: string): Promise<SessionSummaryView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireSummaryRow(sessionId);
    return toView(toDomain(row));
  }

  async edit(
    workspaceId: string,
    sessionId: string,
    request: EditSummaryRequest,
    principal: Principal,
  ): Promise<SessionSummaryView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireSummaryRow(sessionId);
    this.assertVersion(row, request.expectedVersion);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = editSummary(toDomain(row), request.editedText, actor, now);
    await this.persist(row.id, outcome.summary, outcome.event, now);

    return toView(outcome.summary);
  }

  async confirm(
    workspaceId: string,
    sessionId: string,
    expectedVersion: number,
    principal: Principal,
  ): Promise<SessionSummaryView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireSummaryRow(sessionId);
    this.assertVersion(row, expectedVersion);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = confirmSummary(toDomain(row), actor, now);
    await this.persist(row.id, outcome.summary, outcome.event, now);

    return toView(outcome.summary);
  }

  /**
   * Gathers not-withdrawn evidence content (title + content, plus a
   * completed transcript's effective text when one exists), excluding any
   * participant-linked item consent refuses AI processing for. Truncated to
   * `SOURCE_TEXT_MAX` characters — a CPU-bound local model has a real
   * context-length and latency ceiling, and a multi-hour session's raw
   * transcript would exceed both.
   */
  private async assembleSource(
    sessionId: string,
    now: Date,
  ): Promise<{ sourceText: string; sourceEvidenceIds: string[] }> {
    const rows = await this.prisma.evidence.findMany({
      where: { sessionId, withdrawnAt: null },
      include: { transcript: true },
      orderBy: { capturedAt: 'asc' },
    });

    const parts: string[] = [];
    const includedIds: string[] = [];

    for (const row of rows) {
      if (row.sourceParticipantId !== null) {
        const consent = await this.consentPolicy.mayProcessWithAi(
          sessionId,
          row.sourceParticipantId,
          now,
        );
        if (!consent.allowed) continue;
      }

      parts.push(`[${row.evidenceType}] ${row.title}: ${row.content}`);
      if (row.transcript !== null && row.transcript.status === 'completed') {
        const text = row.transcript.editedText ?? row.transcript.generatedText;
        if (text !== null && text.trim() !== '') {
          parts.push(`[transcript] ${text}`);
        }
      }
      includedIds.push(row.id);
    }

    return {
      sourceText: parts.join('\n\n').slice(0, SOURCE_TEXT_MAX),
      sourceEvidenceIds: includedIds,
    };
  }

  private async runSummary(summaryId: string, sourceText: string): Promise<void> {
    const row = await this.prisma.sessionSummary.findUnique({ where: { id: summaryId } });
    if (row === null) return;

    const systemActor = await resolveActor(this.prisma, SYSTEM_PRINCIPAL);
    const startedAt = new Date();
    const processing = beginSummaryProcessing(toDomain(row), systemActor, startedAt);
    await this.persist(summaryId, processing.summary, processing.event, startedAt);

    try {
      const prompt =
        'Summarise the following co-design workshop session content in 3-6 concise, factual ' +
        'sentences. Describe what was discussed, proposed, and decided. Do not invent ' +
        'information that is not present in the text, and do not add commentary about the ' +
        'summary itself.\n\n' +
        sourceText;
      const result = await this.llm.complete(prompt);
      const now = new Date();
      const outcome = completeSummary(processing.summary, result, systemActor, now);
      await this.persist(summaryId, outcome.summary, outcome.event, now);
    } catch (error) {
      const now = new Date();
      const reason = error instanceof Error ? error.message : String(error);
      const outcome = failSummary(processing.summary, reason.slice(0, 2000), systemActor, now);
      await this.persist(summaryId, outcome.summary, outcome.event, now);
    }
  }

  private async persist(
    id: string,
    summary: SessionSummary,
    event: ReturnType<typeof requestSummary>['event'],
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sessionSummary.update({ where: { id }, data: toUpdateRow(summary) });
      await appendAuditEvent(tx, 'session_summary', id, event, at);
    });
  }

  private assertVersion(row: SummaryRow, expectedVersion: number): void {
    if (row.version !== expectedVersion) {
      throw new ConflictException({
        error: {
          code: 'STALE_VERSION',
          message: 'This summary was changed since you last loaded it. Reload and try again.',
        },
      });
    }
  }

  private async requireSessionRow(workspaceId: string, sessionId: string): Promise<{ id: string }> {
    const row = await this.prisma.coDesignSession.findUnique({
      where: { id: sessionId },
      select: { id: true, workspaceId: true },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `No co-design session '${sessionId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    return row;
  }

  private async requireSummaryRow(sessionId: string): Promise<SummaryRow> {
    const row = await this.prisma.sessionSummary.findUnique({ where: { sessionId } });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'SUMMARY_NOT_FOUND',
          message: `Session '${sessionId}' has no summary.`,
        },
      });
    }
    return row;
  }
}

export function toDomain(row: SummaryRow): SessionSummary {
  return {
    id: toSessionSummaryId(row.id),
    sessionId: toCoDesignSessionId(row.sessionId),
    status: row.status as SessionSummary['status'],
    sourceEvidenceIds: row.sourceEvidenceIds.map((id) => toEvidenceId(id)),
    generatedText: row.generatedText,
    editedText: row.editedText,
    model: row.model,
    confirmed: row.confirmed,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCreateRow(summary: SessionSummary) {
  return {
    id: summary.id,
    sessionId: summary.sessionId,
    ...toUpdateRow(summary),
    createdAt: summary.createdAt,
  };
}

function toUpdateRow(summary: SessionSummary) {
  return {
    status: summary.status,
    sourceEvidenceIds: [...summary.sourceEvidenceIds],
    generatedText: summary.generatedText,
    editedText: summary.editedText,
    model: summary.model,
    confirmed: summary.confirmed,
    failureReason: summary.failureReason,
    updatedAt: summary.updatedAt,
    version: summary.version,
  };
}

export function toView(summary: SessionSummary): SessionSummaryView {
  return {
    id: summary.id,
    sessionId: summary.sessionId,
    status: summary.status,
    sourceEvidenceIds: [...summary.sourceEvidenceIds],
    generatedText: summary.generatedText,
    editedText: summary.editedText,
    effectiveText: effectiveSummaryText(summary),
    model: summary.model,
    confirmed: summary.confirmed,
    failureReason: summary.failureReason,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString(),
    version: summary.version,
  };
}
