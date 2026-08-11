/**
 * Service-level tests for `OutcomeCandidateService` — async (a job id, then
 * polled), so these also cover the job lifecycle itself, not just
 * prompt-response parsing robustness (malformed JSON, an out-of-range
 * source index, an unrecognised type).
 */

import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { LlmCompletionResult, LlmPort } from './llm.port.js';
import { OutcomeCandidateService } from './outcome-candidate.service.js';

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const SESSION_EMPTY = '39999999-9999-4999-8999-999999999999';
const EVIDENCE_1 = '55555555-5555-4555-8555-555555555555';

function fakeConsent(): ConsentPolicyService {
  return {
    mayProcessWithAi: async () => ({ allowed: true, reason: 'test' }),
  } as unknown as ConsentPolicyService;
}

function fakeLlm(text: string | (() => Promise<string>)): LlmPort {
  return {
    complete: async (): Promise<LlmCompletionResult> => ({
      text: typeof text === 'function' ? await text() : text,
      model: 'ollama:qwen2.5:1.5b',
    }),
  } as unknown as LlmPort;
}

function fakePrisma() {
  const sessions = [
    { id: SESSION_1, workspaceId: WORKSPACE_1 },
    { id: SESSION_EMPTY, workspaceId: WORKSPACE_1 },
  ];
  const evidenceRows = [
    {
      id: EVIDENCE_1,
      sessionId: SESSION_1,
      evidenceType: 'observation',
      title: 'Intake process',
      content: 'Participants agreed the new intake process should launch next month.',
      sourceParticipantId: null,
      withdrawnAt: null,
      capturedAt: new Date('2026-08-01T00:00:00Z'),
      transcript: null,
    },
  ];

  return {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s.id === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    evidence: {
      findMany: async ({ where }: { where: { sessionId: string } }) =>
        evidenceRows.filter((e) => e.sessionId === where.sessionId).map((e) => ({ ...e })),
    },
  } as unknown as PrismaService;
}

function service(llmText: string | (() => Promise<string>)) {
  return new OutcomeCandidateService(fakePrisma(), fakeConsent(), fakeLlm(llmText));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('OutcomeCandidateService', () => {
  it('starts pending, then completes with a well-formed response, mapping sourceIndex to the evidence id', async () => {
    const svc = service(
      'Here you go:\n' +
        '[{"type":"decision","title":"Launch intake process","description":"Launch next month.","ownerDescription":null,"sourceIndex":0}]',
    );

    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    expect(svc.getJob(jobId).status).toBe('pending');

    await flush();

    const job = svc.getJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.candidates).toHaveLength(1);
    expect(job.candidates?.[0]).toMatchObject({
      type: 'decision',
      title: 'Launch intake process',
      sourceEvidenceId: EVIDENCE_1,
      model: 'ollama:qwen2.5:1.5b',
    });
  });

  it('completes with no candidates for an empty array response', async () => {
    const svc = service('[]');
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    await flush();

    expect(svc.getJob(jobId)).toMatchObject({ status: 'completed', candidates: [] });
  });

  it('completes with no candidates when the model output has no parseable JSON', async () => {
    const svc = service('I could not find any candidates in this text.');
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    await flush();

    expect(svc.getJob(jobId)).toMatchObject({ status: 'completed', candidates: [] });
  });

  it('drops entries with an unrecognised type or missing required fields', async () => {
    const svc = service(
      '[{"type":"not-a-real-type","title":"x","description":"y"},' +
        '{"type":"action_item","title":"","description":"y"},' +
        '{"type":"commitment","title":"Ship it","description":"Ship the feature."}]',
    );
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    await flush();

    const job = svc.getJob(jobId);
    expect(job.candidates).toHaveLength(1);
    expect(job.candidates?.[0]?.type).toBe('commitment');
  });

  it('treats an out-of-range sourceIndex as no citation rather than throwing', async () => {
    const svc = service('[{"type":"decision","title":"x","description":"y","sourceIndex":99}]');
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    await flush();

    expect(svc.getJob(jobId).candidates?.[0]?.sourceEvidenceId).toBeNull();
  });

  it('completes with no candidates when the session has no source content, without calling the LLM', async () => {
    const svc = service(() => {
      throw new Error('the LLM should not have been called');
    });
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_EMPTY);
    await flush();

    expect(svc.getJob(jobId)).toMatchObject({ status: 'completed', candidates: [] });
  });

  it('moves to failed when the LLM port throws', async () => {
    const svc = service(() => {
      throw new Error('local LLM unreachable');
    });
    const { jobId } = await svc.request(WORKSPACE_1, SESSION_1);
    await flush();

    const job = svc.getJob(jobId);
    expect(job.status).toBe('failed');
    expect(job.failureReason).toContain('unreachable');
  });

  it('404s requesting a job for a session outside the given workspace', async () => {
    const svc = service('[]');

    await expect(svc.request('does-not-exist', SESSION_1)).rejects.toThrow(NotFoundException);
  });

  it('404s polling an unknown job id', () => {
    const svc = service('[]');

    expect(() => svc.getJob('does-not-exist')).toThrow(NotFoundException);
  });
});
