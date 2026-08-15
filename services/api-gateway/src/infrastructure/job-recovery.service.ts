/**
 * Recovers transcripts and session summaries stuck in `processing` because
 * the process that was running them exited (deploy, crash, `docker compose
 * up --force-recreate`) before `runTranscription`/`runSummary` reached its
 * own `catch` block — the known limitation both files' doc comments already
 * name for a single-process job runner (ADR-0013: no second instance to
 * lose a job between, but also nothing to hand a job to if this one dies
 * mid-run). Runs once at boot, before the app accepts any request, so a
 * stuck row does not sit unusable indefinitely; each is moved to `failed`
 * with a clear reason, using the exact same domain transition a real
 * inference failure takes, so a facilitator sees an ordinary retryable
 * failure and not a row that is silently neither.
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { failSummary, failTranscription, toActorId, type Actor } from '@witness/domain';

import { PrismaService } from './prisma.service.js';
import { appendAuditEvent } from './audit.helper.js';
import {
  toDomain as transcriptToDomain,
  toUpdateRow as transcriptToUpdateRow,
} from '../evidence/transcript.service.js';
import {
  toDomain as summaryToDomain,
  toUpdateRow as summaryToUpdateRow,
} from '../summarization/session-summary.service.js';

const INTERRUPTED_REASON =
  'This job was still running when the server restarted and could not finish. Retry it.';

@Injectable()
export class JobRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(JobRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const [transcripts, summaries] = await Promise.all([
      this.recoverTranscripts(),
      this.recoverSummaries(),
    ]);

    if (transcripts + summaries > 0) {
      this.logger.warn(
        `Recovered ${transcripts} stuck transcript(s) and ${summaries} stuck summary(ies) ` +
          "from 'processing' to 'failed' at startup — retry each from the UI.",
      );
    }
  }

  private async systemActor(): Promise<Actor> {
    const displayName = 'Local job recovery';
    const existing = await this.prisma.actor.findFirst({
      where: { displayName, kind: 'system' },
    });
    if (existing !== null) {
      return { id: toActorId(existing.id), kind: 'system', displayName };
    }
    const created = await this.prisma.actor.create({
      data: { id: randomUUID(), kind: 'system', displayName },
    });
    return { id: toActorId(created.id), kind: 'system', displayName };
  }

  private async recoverTranscripts(): Promise<number> {
    const stuck = await this.prisma.transcript.findMany({ where: { status: 'processing' } });
    if (stuck.length === 0) return 0;

    const actor = await this.systemActor();
    const now = new Date();

    for (const row of stuck) {
      const outcome = failTranscription(transcriptToDomain(row), INTERRUPTED_REASON, actor, now);
      await this.prisma.$transaction(async (tx) => {
        await tx.transcript.update({
          where: { id: row.id },
          data: transcriptToUpdateRow(outcome.transcript),
        });
        await appendAuditEvent(tx, 'transcript', row.id, outcome.event, now);
      });
    }

    return stuck.length;
  }

  private async recoverSummaries(): Promise<number> {
    const stuck = await this.prisma.sessionSummary.findMany({ where: { status: 'processing' } });
    if (stuck.length === 0) return 0;

    const actor = await this.systemActor();
    const now = new Date();

    for (const row of stuck) {
      const outcome = failSummary(summaryToDomain(row), INTERRUPTED_REASON, actor, now);
      await this.prisma.$transaction(async (tx) => {
        await tx.sessionSummary.update({
          where: { id: row.id },
          data: summaryToUpdateRow(outcome.summary),
        });
        await appendAuditEvent(tx, 'session_summary', row.id, outcome.event, now);
      });
    }

    return stuck.length;
  }
}
