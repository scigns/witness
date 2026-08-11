/**
 * Service-level tests for `SessionSummaryService`, against an in-memory
 * Prisma double and a fake `LlmPort` — same approach as
 * `transcript.service.test.ts`.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { LlmCompletionResult, LlmPort } from './llm.port.js';
import { SessionSummaryService } from './session-summary.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const SESSION_EMPTY = '39999999-9999-4999-8999-999999999999';
const PARTICIPANT_1 = '44444444-4444-4444-8444-444444444444';
const EVIDENCE_1 = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_WITHDRAWN = '56666666-6666-4666-8666-666666666666';
const EVIDENCE_NO_CONSENT = '57777777-7777-4777-8777-777777777777';

function fakeConsent(allowed = true): ConsentPolicyService {
  return {
    mayProcessWithAi: vi.fn(async (_sessionId: string, participantId: string) => ({
      allowed: participantId === PARTICIPANT_1 ? allowed : false,
      reason: 'test',
    })),
  } as unknown as ConsentPolicyService;
}

function fakeLlm(
  result: LlmCompletionResult | (() => Promise<LlmCompletionResult>) = {
    text: 'The session discussed the new intake process.',
    model: 'ollama:qwen2.5:1.5b',
  },
): LlmPort {
  return {
    complete: vi.fn(async () => (typeof result === 'function' ? result() : result)),
  } as unknown as LlmPort;
}

function fakePrisma() {
  const sessions: Record<string, unknown>[] = [
    { id: SESSION_1, workspaceId: WORKSPACE_1 },
    { id: SESSION_EMPTY, workspaceId: WORKSPACE_1 },
  ];
  const evidenceRows: Record<string, unknown>[] = [
    {
      id: EVIDENCE_1,
      sessionId: SESSION_1,
      evidenceType: 'observation',
      title: 'Intake process',
      content: 'Participants agreed the new intake process should launch next month.',
      sourceParticipantId: PARTICIPANT_1,
      withdrawnAt: null,
      capturedAt: new Date('2026-08-01T00:00:00Z'),
      transcript: null,
    },
    {
      id: EVIDENCE_WITHDRAWN,
      sessionId: SESSION_1,
      evidenceType: 'observation',
      title: 'Withdrawn item',
      content: 'This should never appear in a summary.',
      sourceParticipantId: null,
      withdrawnAt: new Date('2026-08-02T00:00:00Z'),
      capturedAt: new Date('2026-08-01T01:00:00Z'),
      transcript: null,
    },
    {
      id: EVIDENCE_NO_CONSENT,
      sessionId: SESSION_1,
      evidenceType: 'quote',
      title: 'No AI consent',
      content: 'This participant withheld AI-processing consent.',
      sourceParticipantId: 'no-consent-participant',
      withdrawnAt: null,
      capturedAt: new Date('2026-08-01T02:00:00Z'),
      transcript: null,
    },
  ];
  const summaries: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    evidence: {
      findMany: async ({ where }: { where: { sessionId: string; withdrawnAt: null } }) =>
        evidenceRows
          .filter((e) => e['sessionId'] === where.sessionId && e['withdrawnAt'] === null)
          .map((e) => ({ ...e })),
    },
    sessionSummary: {
      findUnique: async ({ where }: { where: { id?: string; sessionId?: string } }) => {
        const row =
          where.id !== undefined
            ? summaries.find((s) => s['id'] === where.id)
            : summaries.find((s) => s['sessionId'] === where.sessionId);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        summaries.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = summaries.find((s) => s['id'] === where.id);
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

  return { prisma: prisma as unknown as PrismaService, summaries, auditEvents };
}

function service(options: { allowed?: boolean; llm?: LlmPort } = {}) {
  const { prisma, summaries, auditEvents } = fakePrisma();
  const svc = new SessionSummaryService(
    prisma,
    fakeConsent(options.allowed ?? true),
    options.llm ?? fakeLlm(),
  );
  return { svc, summaries, auditEvents };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('SessionSummaryService', () => {
  it('excludes withdrawn evidence and consent-refused evidence, then completes with the rest', async () => {
    const { svc, summaries } = service();

    const requested = await svc.request(WORKSPACE_1, SESSION_1, FACILITATOR);
    expect(requested.status).toBe('pending');
    expect(requested.sourceEvidenceIds).toEqual([EVIDENCE_1]);

    await flush();

    const completed = await svc.get(WORKSPACE_1, SESSION_1);
    expect(completed.status).toBe('completed');
    expect(completed.generatedText).toBe('The session discussed the new intake process.');
    expect(completed.effectiveText).toBe('The session discussed the new intake process.');
    expect(summaries).toHaveLength(1);
  });

  it('refuses to request a summary when there is no usable source content', async () => {
    const { svc } = service();

    await expect(svc.request(WORKSPACE_1, SESSION_EMPTY, FACILITATOR)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a second summary request for the same session', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, FACILITATOR);
    await flush();

    await expect(svc.request(WORKSPACE_1, SESSION_1, FACILITATOR)).rejects.toThrow(
      ConflictException,
    );
  });

  it('moves to failed when the LLM port throws, and retry recovers', async () => {
    let shouldFail = true;
    const llm = fakeLlm(async () => {
      if (shouldFail) throw new Error('local LLM unreachable');
      return { text: 'Recovered summary.', model: 'ollama:qwen2.5:1.5b' };
    });
    const { svc } = service({ llm });

    await svc.request(WORKSPACE_1, SESSION_1, FACILITATOR);
    await flush();

    const failed = await svc.get(WORKSPACE_1, SESSION_1);
    expect(failed.status).toBe('failed');

    shouldFail = false;
    await svc.retry(WORKSPACE_1, SESSION_1, FACILITATOR);
    await flush();

    const retried = await svc.get(WORKSPACE_1, SESSION_1);
    expect(retried.status).toBe('completed');
    expect(retried.generatedText).toBe('Recovered summary.');
  });

  it('allows editing and confirming a completed summary', async () => {
    const { svc } = service();
    await svc.request(WORKSPACE_1, SESSION_1, FACILITATOR);
    await flush();

    const before = await svc.get(WORKSPACE_1, SESSION_1);
    const edited = await svc.edit(
      WORKSPACE_1,
      SESSION_1,
      { editedText: 'A human-corrected summary.', expectedVersion: before.version },
      FACILITATOR,
    );
    expect(edited.effectiveText).toBe('A human-corrected summary.');

    const confirmed = await svc.confirm(WORKSPACE_1, SESSION_1, edited.version, FACILITATOR);
    expect(confirmed.confirmed).toBe(true);
  });

  it('404s reading a summary that was never requested', async () => {
    const { svc } = service();

    await expect(svc.get(WORKSPACE_1, SESSION_1)).rejects.toThrow(NotFoundException);
  });
});
