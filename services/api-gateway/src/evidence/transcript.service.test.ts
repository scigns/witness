/**
 * Service-level tests for `TranscriptService`, against an in-memory Prisma
 * double and a fake `TranscriptionPort` — same approach as
 * `evidence-attachment.service.test.ts`. `LocalWhisperAdapter` itself is not
 * unit-testable without a real whisper.cpp binary and model; it is verified
 * by actually running it (build + live browser walkthrough), not here.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { ConcurrencyLimiter } from '../infrastructure/concurrency-limiter.js';
import type { Principal } from '../authz/authorization.port.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type {
  TranscriptionPort,
  TranscriptionResult,
} from '../transcription/transcription.port.js';
import { TranscriptService } from './transcript.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_UNATTRIBUTED = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_ATTRIBUTED = '56666666-6666-4666-8666-666666666666';
const EVIDENCE_NO_ATTACHMENT = '57777777-7777-4777-8777-777777777777';
const PARTICIPANT_1 = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT_UNATTRIBUTED = '61111111-1111-4111-8111-111111111111';
const ATTACHMENT_ATTRIBUTED = '62222222-2222-4222-8222-222222222222';

function fakeConsent(allowed: boolean): ConsentPolicyService {
  return {
    mayTranscribe: vi.fn().mockResolvedValue({ allowed, reason: 'test' }),
  } as unknown as ConsentPolicyService;
}

function fakeTranscription(
  result: TranscriptionResult | (() => Promise<TranscriptionResult>) = {
    text: 'hello world',
    segments: [{ text: 'hello world', startMs: 0, endMs: 1000 }],
    model: 'whisper.cpp:base',
    language: 'en',
  },
): TranscriptionPort {
  return {
    transcribe: vi.fn(async () => (typeof result === 'function' ? result() : result)),
  } as unknown as TranscriptionPort;
}

function fakePrisma() {
  const evidenceRows: Record<string, unknown>[] = [
    {
      id: EVIDENCE_UNATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      sourceParticipantId: null,
    },
    {
      id: EVIDENCE_ATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      sourceParticipantId: PARTICIPANT_1,
    },
    {
      id: EVIDENCE_NO_ATTACHMENT,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      sourceParticipantId: null,
    },
  ];
  const attachments: Record<string, unknown>[] = [
    {
      id: ATTACHMENT_UNATTRIBUTED,
      evidenceId: EVIDENCE_UNATTRIBUTED,
      content: Buffer.from('x'),
      storageKey: null,
      contentType: 'audio/wav',
    },
    {
      id: ATTACHMENT_ATTRIBUTED,
      evidenceId: EVIDENCE_ATTRIBUTED,
      content: Buffer.from('x'),
      storageKey: null,
      contentType: 'audio/wav',
    },
  ];
  const transcripts: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    evidence: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceRows.find((e) => e['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    evidenceAttachment: {
      findUnique: async ({ where }: { where: { evidenceId: string } }) => {
        const row = attachments.find((a) => a['evidenceId'] === where.evidenceId);
        return row === undefined ? null : { ...row };
      },
    },
    transcript: {
      findUnique: async ({ where }: { where: { id?: string; evidenceId?: string } }) => {
        const row =
          where.id !== undefined
            ? transcripts.find((t) => t['id'] === where.id)
            : transcripts.find((t) => t['evidenceId'] === where.evidenceId);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        transcripts.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = transcripts.find((t) => t['id'] === where.id);
        if (row === undefined) throw new Error('transcript not found');
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

  return { prisma: prisma as unknown as PrismaService, transcripts, auditEvents };
}

function service(options: { allowed?: boolean; transcription?: TranscriptionPort } = {}) {
  const { prisma, transcripts, auditEvents } = fakePrisma();
  const svc = new TranscriptService(
    prisma,
    fakeConsent(options.allowed ?? true),
    options.transcription ?? fakeTranscription(),
    null,
    new ConcurrencyLimiter(2),
  );
  return { svc, transcripts, auditEvents };
}

/** The background job is fire-and-forget; give it a tick to actually run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('TranscriptService', () => {
  it('requests a transcript, then completes it in the background', async () => {
    const { svc, transcripts } = service();

    const requested = await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    expect(requested.status).toBe('pending');

    await flush();

    const completed = await svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    expect(completed.status).toBe('completed');
    expect(completed.generatedText).toBe('hello world');
    expect(completed.effectiveText).toBe('hello world');
    expect(completed.model).toBe('whisper.cpp:base');
    expect(transcripts).toHaveLength(1);
  });

  it('checks mayTranscribe for evidence with a source participant, and refuses when denied', async () => {
    const { svc } = service({ allowed: false });

    await expect(
      svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, FACILITATOR),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires an attachment before transcription can be requested', async () => {
    const { svc } = service();

    await expect(
      svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_NO_ATTACHMENT, FACILITATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a second transcript request for the same evidence', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    await expect(
      svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR),
    ).rejects.toThrow(ConflictException);
  });

  it('moves to failed when the transcription port throws, and retry moves it back to pending then completed', async () => {
    let shouldFail = true;
    const transcription = fakeTranscription(async () => {
      if (shouldFail) throw new Error('ffmpeg exited with code 1');
      return { text: 'recovered', segments: [], model: 'whisper.cpp:base', language: 'en' };
    });
    const { svc } = service({ transcription });

    await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    const failed = await svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toContain('ffmpeg');

    shouldFail = false;
    await svc.retry(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    const retried = await svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    expect(retried.status).toBe('completed');
    expect(retried.generatedText).toBe('recovered');
  });

  it('allows editing a completed transcript and reflects it in effectiveText', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    const before = await svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    const edited = await svc.edit(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_UNATTRIBUTED,
      { editedText: 'Hello, world.', expectedVersion: before.version },
      FACILITATOR,
    );
    expect(edited.editedText).toBe('Hello, world.');
    expect(edited.effectiveText).toBe('Hello, world.');
  });

  it('rejects an edit with a stale version', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    await expect(
      svc.edit(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_UNATTRIBUTED,
        { editedText: 'x', expectedVersion: 999 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('confirms a completed transcript, after which further edits are refused', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, FACILITATOR);
    await flush();

    const before = await svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    const confirmed = await svc.confirm(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_UNATTRIBUTED,
      before.version,
      FACILITATOR,
    );
    expect(confirmed.confirmed).toBe(true);

    await expect(
      svc.edit(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_UNATTRIBUTED,
        { editedText: 'x', expectedVersion: confirmed.version },
        FACILITATOR,
      ),
    ).rejects.toThrow();
  });

  it('404s reading a transcript that was never requested', async () => {
    const { svc } = service();

    await expect(svc.get(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED)).rejects.toThrow(
      NotFoundException,
    );
  });
});
