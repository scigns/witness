/**
 * Service-level tests for `SearchService`, against an in-memory Prisma
 * double — same approach as every other service in this module. Covers
 * case-insensitivity, workspace scoping, and the exclusions the file header
 * promises (withdrawn evidence, non-completed transcripts/summaries).
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { SearchService } from './search.service.js';

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_2 = '22222222-2222-4222-8222-222222222222';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';

function fakePrisma() {
  const sessions = [
    {
      id: SESSION_1,
      workspaceId: WORKSPACE_1,
      title: 'Intake redesign workshop',
      purpose: 'Redesign the intake process',
      status: 'open',
    },
    {
      id: 'session-2',
      workspaceId: WORKSPACE_2,
      title: 'Unrelated other-workspace session',
      purpose: 'Something else entirely',
      status: 'open',
    },
  ];
  const evidence = [
    {
      id: 'evidence-1',
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      session: { title: 'Intake redesign workshop' },
      title: 'Intake note',
      content: 'The new intake process should launch next month.',
      reviewStatus: 'submitted',
      withdrawnAt: null,
    },
    {
      id: 'evidence-withdrawn',
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      session: { title: 'Intake redesign workshop' },
      title: 'Withdrawn intake note',
      content: 'This mentions intake too but was withdrawn.',
      reviewStatus: 'withdrawn',
      withdrawnAt: new Date(),
    },
  ];
  const transcripts = [
    {
      evidenceId: 'evidence-1',
      confirmed: true,
      status: 'completed',
      generatedText: 'We discussed the intake process at length.',
      editedText: null,
      evidence: {
        sessionId: SESSION_1,
        workspaceId: WORKSPACE_1,
        title: 'Intake note',
        session: { title: 'Intake redesign workshop' },
      },
    },
    {
      evidenceId: 'evidence-pending',
      confirmed: false,
      status: 'processing',
      generatedText: 'intake mention that should not appear because still processing',
      editedText: null,
      evidence: {
        sessionId: SESSION_1,
        workspaceId: WORKSPACE_1,
        title: 'Pending note',
        session: { title: 'Intake redesign workshop' },
      },
    },
  ];
  const summaries = [
    {
      sessionId: SESSION_1,
      confirmed: false,
      status: 'completed',
      generatedText: 'This session covered the intake process.',
      editedText: null,
      session: { title: 'Intake redesign workshop', workspaceId: WORKSPACE_1 },
    },
  ];
  const decisions = [
    {
      id: 'decision-1',
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      session: { title: 'Intake redesign workshop' },
      title: 'Launch new intake process',
      statement: 'We will launch the new intake process next month.',
      status: 'proposed',
    },
  ];

  const prisma = {
    coDesignSession: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string; OR: Record<string, unknown>[] };
      }) => sessions.filter((s) => matches(s, where)),
    },
    evidence: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string; withdrawnAt: null; OR: Record<string, unknown>[] };
      }) =>
        evidence.filter(
          (e) =>
            e.workspaceId === where.workspaceId && e.withdrawnAt === null && matchesOr(e, where.OR),
        ),
    },
    transcript: {
      findMany: async ({
        where,
      }: {
        where: { status: string; OR: Record<string, unknown>[]; evidence: { workspaceId: string } };
      }) =>
        transcripts.filter(
          (t) =>
            t.status === where.status &&
            t.evidence.workspaceId === where.evidence.workspaceId &&
            matchesOr(t, where.OR),
        ),
    },
    sessionSummary: {
      findMany: async ({
        where,
      }: {
        where: { status: string; OR: Record<string, unknown>[]; session: { workspaceId: string } };
      }) =>
        summaries.filter(
          (s) =>
            s.status === where.status &&
            s.session.workspaceId === where.session.workspaceId &&
            matchesOr(s, where.OR),
        ),
    },
    decision: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string; OR: Record<string, unknown>[] };
      }) => decisions.filter((d) => matches(d, where)),
    },
    commitment: { findMany: async () => [] },
    actionItem: { findMany: async () => [] },
  };

  return prisma as unknown as PrismaService;

  function matchesOr(row: Record<string, unknown>, or: Record<string, unknown>[]): boolean {
    return or.some((clause) =>
      Object.entries(clause).some(([field, condition]) => {
        const value = row[field];
        if (typeof value !== 'string') return false;
        const contains = (condition as { contains: string }).contains;
        return value.toLowerCase().includes(contains.toLowerCase());
      }),
    );
  }

  function matches(
    row: Record<string, unknown>,
    where: { workspaceId: string; OR: Record<string, unknown>[] },
  ): boolean {
    return row['workspaceId'] === where.workspaceId && matchesOr(row, where.OR);
  }
}

describe('SearchService', () => {
  it('matches case-insensitively across sessions, evidence, decisions', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_1, 'INTAKE');

    const types = results.map((r) => r.type).sort();
    expect(types).toEqual(['decision', 'evidence', 'session', 'summary', 'transcript']);
  });

  it('excludes withdrawn evidence', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_1, 'withdrawn');

    expect(results.find((r) => r.type === 'evidence')).toBeUndefined();
  });

  it('excludes transcripts that are not completed', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_1, 'processing');

    expect(results).toEqual([]);
  });

  it('marks transcript and summary results as AI-generated with their confirmed state', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_1, 'intake');

    const transcriptResult = results.find((r) => r.type === 'transcript');
    expect(transcriptResult).toMatchObject({
      aiGenerated: true,
      confirmed: true,
      evidenceId: 'evidence-1',
    });

    const summaryResult = results.find((r) => r.type === 'summary');
    expect(summaryResult).toMatchObject({ aiGenerated: true, confirmed: false });

    const decisionResult = results.find((r) => r.type === 'decision');
    expect(decisionResult).toMatchObject({
      aiGenerated: false,
      confirmed: null,
      entityId: 'decision-1',
    });
  });

  it('never returns results from another workspace', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_2, 'intake');

    expect(results).toEqual([]);
  });

  it('produces a snippet centred on the match', async () => {
    const svc = new SearchService(fakePrisma());

    const results = await svc.search(WORKSPACE_1, 'launch');

    const evidenceResult = results.find((r) => r.type === 'evidence');
    expect(evidenceResult?.snippet.toLowerCase()).toContain('launch');
  });
});
