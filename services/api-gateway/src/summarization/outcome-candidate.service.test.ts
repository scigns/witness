/**
 * Service-level tests for `OutcomeCandidateService` — a stateless read, so
 * these focus on prompt-response parsing robustness (malformed JSON, an
 * out-of-range source index, an unrecognised type) rather than persistence.
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

function fakeLlm(text: string): LlmPort {
  return {
    complete: async (): Promise<LlmCompletionResult> => ({ text, model: 'ollama:qwen2.5:1.5b' }),
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

function service(llmText: string) {
  return new OutcomeCandidateService(fakePrisma(), fakeConsent(), fakeLlm(llmText));
}

describe('OutcomeCandidateService', () => {
  it('parses a well-formed JSON array and maps sourceIndex to the evidence id', async () => {
    const svc = service(
      'Here you go:\n' +
        '[{"type":"decision","title":"Launch intake process","description":"Launch next month.","ownerDescription":null,"sourceIndex":0}]',
    );

    const candidates = await svc.suggest(WORKSPACE_1, SESSION_1);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      type: 'decision',
      title: 'Launch intake process',
      sourceEvidenceId: EVIDENCE_1,
      model: 'ollama:qwen2.5:1.5b',
    });
  });

  it('returns no candidates for an empty array response', async () => {
    const svc = service('[]');

    expect(await svc.suggest(WORKSPACE_1, SESSION_1)).toEqual([]);
  });

  it('returns no candidates when the model output has no parseable JSON', async () => {
    const svc = service('I could not find any candidates in this text.');

    expect(await svc.suggest(WORKSPACE_1, SESSION_1)).toEqual([]);
  });

  it('drops entries with an unrecognised type or missing required fields', async () => {
    const svc = service(
      '[{"type":"not-a-real-type","title":"x","description":"y"},' +
        '{"type":"action_item","title":"","description":"y"},' +
        '{"type":"commitment","title":"Ship it","description":"Ship the feature."}]',
    );

    const candidates = await svc.suggest(WORKSPACE_1, SESSION_1);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.type).toBe('commitment');
  });

  it('treats an out-of-range sourceIndex as no citation rather than throwing', async () => {
    const svc = service('[{"type":"decision","title":"x","description":"y","sourceIndex":99}]');

    const candidates = await svc.suggest(WORKSPACE_1, SESSION_1);

    expect(candidates[0]?.sourceEvidenceId).toBeNull();
  });

  it('returns no candidates when the session has no source content, without calling the LLM', async () => {
    const svc = service('should never be read');

    expect(await svc.suggest(WORKSPACE_1, SESSION_EMPTY)).toEqual([]);
  });

  it('404s for a session outside the given workspace', async () => {
    const svc = service('[]');

    await expect(svc.suggest('does-not-exist', SESSION_1)).rejects.toThrow(NotFoundException);
  });
});
