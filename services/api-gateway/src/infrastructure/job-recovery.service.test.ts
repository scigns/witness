/**
 * Service-level tests for `JobRecoveryService` — same in-memory Prisma
 * double approach as `transcript.service.test.ts`. Covers the case that
 * file's own doc comment names as a known limitation this service closes:
 * a row left in `processing` by a process that exited mid-job.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from './prisma.service.js';
import { JobRecoveryService } from './job-recovery.service.js';

const TRANSCRIPT_STUCK = '11111111-1111-4111-8111-111111111111';
const TRANSCRIPT_PENDING = '12222222-2222-4222-8222-222222222222';
const SUMMARY_STUCK = '21111111-1111-4111-8111-111111111111';
const EVIDENCE_1 = '55555555-5555-4555-8555-555555555555';
const ATTACHMENT_1 = '66666666-6666-4666-8666-666666666666';
const SESSION_1 = '77777777-7777-4777-8777-777777777777';

function baseTranscript(id: string, status: string) {
  return {
    id,
    evidenceId: EVIDENCE_1,
    attachmentId: ATTACHMENT_1,
    status,
    generatedText: null,
    editedText: null,
    segments: [],
    model: null,
    language: null,
    confirmed: false,
    failureReason: null,
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    version: 2,
  };
}

function baseSummary(id: string, status: string) {
  return {
    id,
    sessionId: SESSION_1,
    status,
    sourceEvidenceIds: [],
    generatedText: null,
    editedText: null,
    model: null,
    confirmed: false,
    failureReason: null,
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    version: 2,
  };
}

function fakePrisma() {
  const transcripts = [
    baseTranscript(TRANSCRIPT_STUCK, 'processing'),
    baseTranscript(TRANSCRIPT_PENDING, 'pending'),
  ];
  const summaries = [baseSummary(SUMMARY_STUCK, 'processing')];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    transcript: {
      findMany: async ({ where }: { where: { status: string } }) =>
        transcripts.filter((t) => t.status === where.status).map((t) => ({ ...t })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = transcripts.find((t) => t.id === where.id);
        if (row === undefined) throw new Error('transcript not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
    sessionSummary: {
      findMany: async ({ where }: { where: { status: string } }) =>
        summaries.filter((s) => s.status === where.status).map((s) => ({ ...s })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = summaries.find((s) => s.id === where.id);
        if (row === undefined) throw new Error('summary not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const row = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        actors.push({ ...data });
        return { ...data };
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return { prisma: prisma as unknown as PrismaService, transcripts, summaries, auditEvents };
}

describe('JobRecoveryService', () => {
  it('moves a stuck-processing transcript to failed with an interrupted reason', async () => {
    const { prisma, transcripts } = fakePrisma();
    const service = new JobRecoveryService(prisma);

    await service.onModuleInit();

    const row = transcripts.find((t) => t.id === TRANSCRIPT_STUCK)!;
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain('restarted');
  });

  it('leaves a pending transcript untouched', async () => {
    const { prisma, transcripts } = fakePrisma();
    const service = new JobRecoveryService(prisma);

    await service.onModuleInit();

    const row = transcripts.find((t) => t.id === TRANSCRIPT_PENDING)!;
    expect(row.status).toBe('pending');
  });

  it('moves a stuck-processing session summary to failed', async () => {
    const { prisma, summaries } = fakePrisma();
    const service = new JobRecoveryService(prisma);

    await service.onModuleInit();

    const row = summaries.find((s) => s.id === SUMMARY_STUCK)!;
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain('restarted');
  });

  it('appends an audit event for each recovered row', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new JobRecoveryService(prisma);

    await service.onModuleInit();

    expect(auditEvents.some((e) => e['subjectId'] === TRANSCRIPT_STUCK)).toBe(true);
    expect(auditEvents.some((e) => e['subjectId'] === SUMMARY_STUCK)).toBe(true);
  });

  it('does nothing when no rows are stuck', async () => {
    const { prisma, transcripts, summaries } = fakePrisma();
    transcripts.length = 0;
    summaries.length = 0;
    const service = new JobRecoveryService(prisma);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
