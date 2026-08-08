/**
 * Service-level tests for `EvidenceReviewService`, against an in-memory
 * Prisma double — see `evidence.service.test.ts`/`participants.service.test.ts`
 * for why this pattern exists.
 *
 * Principals with `subject: 'user:<uuid>'` exercise the "must be the
 * assigned reviewer" ownership check (`requireAssignedReviewer`); a
 * `subject: 'dev:...'` principal exercises the unverified-development-header
 * fallback, which skips that per-user check by design (see the service's
 * file header).
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Action, Principal } from '../authz/authorization.port.js';
import { EvidenceReviewService } from './evidence-review.service.js';
import { EvidenceService } from './evidence.service.js';

const ORG_1 = '00000000-0000-4000-8000-000000000000';
const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const REVIEWER_USER_1 = '55555555-5555-4555-8555-555555555555';
const REVIEWER_USER_2 = '56666666-6666-4666-8666-666666666666';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const REVIEWER_1: Principal = {
  subject: `user:${REVIEWER_USER_1}`,
  displayName: 'Reviewer One',
  kind: 'human',
  roles: ['reviewer'],
};

const REVIEWER_2: Principal = {
  subject: `user:${REVIEWER_USER_2}`,
  displayName: 'Reviewer Two',
  kind: 'human',
  roles: ['reviewer'],
};

const ADMIN: Principal = {
  subject: 'user:admin-1',
  displayName: 'An Admin',
  kind: 'human',
  roles: ['admin'],
};

function fakePolicyEnforcement(denied: ReadonlySet<Action> = new Set()): PolicyEnforcementService {
  return {
    decide: async (principal: Principal, action: Action) => {
      if (action === 'evidence_review:manage_restricted') {
        return { allowed: principal.roles.includes('admin'), reason: 'test' };
      }
      return { allowed: !denied.has(action), reason: 'test' };
    },
  } as unknown as PolicyEnforcementService;
}

function fakePrisma(sessionStatus = 'open') {
  const sessions: Record<string, unknown>[] = [
    { id: SESSION_1, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: sessionStatus },
  ];
  const participants: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [
    { id: REVIEWER_USER_1, email: 'r1@example.org' },
    { id: REVIEWER_USER_2, email: 'r2@example.org' },
  ];
  const evidenceRows: Record<string, unknown>[] = [];
  const assignments: Record<string, unknown>[] = [];
  const clarifications: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  function withActor<T extends Record<string, unknown>>(row: T, key: string) {
    const id = row[key] as string | null;
    return id === null ? null : (actors.find((a) => a['id'] === id) ?? null);
  }

  const prisma = {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    sessionParticipant: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = participants.find((p) => p['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = users.find((u) => u['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    evidence: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceRows.find((e) => e['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = evidenceRows.find(
          (e) => e['id'] === where.id && e['version'] === where.version,
        );
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        evidenceRows.push({ ...data });
        return { ...data };
      },
    },
    reviewAssignment: {
      findFirst: async ({
        where,
        include,
      }: {
        where: { evidenceId: string; status: { in: string[] } };
        include?: { assignedBy?: boolean };
      }) => {
        const row = assignments.find(
          (a) =>
            a['evidenceId'] === where.evidenceId && where.status.in.includes(a['status'] as string),
        );
        if (row === undefined) return null;
        return include?.assignedBy === true
          ? { ...row, assignedBy: withActor(row, 'assignedById') }
          : { ...row };
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { assignedBy?: boolean };
      }) => {
        const row = assignments.find((a) => a['id'] === where.id);
        if (row === undefined) return null;
        return include?.assignedBy === true
          ? { ...row, assignedBy: withActor(row, 'assignedById') }
          : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assignments.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = assignments.find((a) => a['id'] === where.id && a['version'] === where.version);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    clarification: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { requestedBy?: boolean; respondedBy?: boolean };
      }) => {
        const row = clarifications.find((c) => c['id'] === where.id);
        if (row === undefined) return null;
        if (include === undefined) return { ...row };
        return {
          ...row,
          requestedBy: withActor(row, 'requestedById'),
          respondedBy: withActor(row, 'respondedById'),
        };
      },
      findMany: async ({ where }: { where: { evidenceId: string } }) =>
        clarifications
          .filter((c) => c['evidenceId'] === where.evidenceId)
          .map((c) => ({
            ...c,
            requestedBy: withActor(c, 'requestedById'),
            respondedBy: withActor(c, 'respondedById'),
          })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        clarifications.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = clarifications.find(
          (c) => c['id'] === where.id && c['version'] === where.version,
        );
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
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
        const row = { ...data };
        actors.push(row);
        return row;
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      findMany: async ({ where }: { where: { subjectType: string; subjectId: string } }) =>
        auditEvents
          .filter(
            (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
          )
          .map((e) => ({ ...e })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        evidenceRows: evidenceRows.map((e) => ({ ...e })),
        assignments: assignments.map((a) => ({ ...a })),
        clarifications: clarifications.map((c) => ({ ...c })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        evidenceRows.splice(0, evidenceRows.length, ...snapshot.evidenceRows);
        assignments.splice(0, assignments.length, ...snapshot.assignments);
        clarifications.splice(0, clarifications.length, ...snapshot.clarifications);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, evidenceRows, assignments, clarifications };
}

function captureRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evidenceType: 'observation',
    title: 'People want more shade',
    content: 'Several participants raised the lack of shade near the fountain.',
    attributionMode: 'facilitator_observation',
    submitImmediately: true,
    ...overrides,
  } as never;
}

function services(sessionStatus = 'open', denied: ReadonlySet<Action> = new Set()) {
  const fixture = fakePrisma(sessionStatus);
  const policy = fakePolicyEnforcement(denied);
  const evidenceService = new EvidenceService(fixture.prisma, policy, {
    mayParticipate: async () => ({ allowed: true, reason: 'test' }),
    mayAttributeQuotation: async () => ({ allowed: true, reason: 'test' }),
    mayQuoteAnonymously: async () => ({ allowed: true, reason: 'test' }),
  } as never);
  const reviewService = new EvidenceReviewService(fixture.prisma, policy);
  return { ...fixture, evidenceService, reviewService };
}

async function submittedEvidence(evidenceService: EvidenceService) {
  return evidenceService.capture(WORKSPACE_1, SESSION_1, captureRequest(), FACILITATOR);
}

describe('EvidenceReviewService.assign', () => {
  it('assigns a reviewer to submitted evidence', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);

    const assignment = await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    expect(assignment.reviewerUserId).toBe(REVIEWER_USER_1);
    expect(assignment.status).toBe('assigned');
  });

  it('ATTACK — rejects assigning a second active reviewer to the same evidence', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    await expect(
      reviewService.assign(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { reviewerUserId: REVIEWER_USER_2 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — rejects assigning a reviewer user that does not exist', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);

    await expect(
      reviewService.assign(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { reviewerUserId: '99999999-9999-4999-8999-999999999999' },
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — evidence from another workspace is not found (IDOR)', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);

    await expect(
      reviewService.assign(
        '99999999-9999-4999-8999-999999999999',
        SESSION_1,
        evidence.id,
        { reviewerUserId: REVIEWER_USER_1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('EvidenceReviewService.reassign', () => {
  it('closes the old assignment and creates a linked replacement', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    const original = await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    const replacement = await reviewService.reassign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      original.id,
      { reviewerUserId: REVIEWER_USER_2, reason: 'Conflict of interest.' },
      FACILITATOR,
    );

    expect(replacement.reviewerUserId).toBe(REVIEWER_USER_2);
    expect(replacement.reassignedFromId).toBe(original.id);

    const current = await reviewService.getActiveAssignment(WORKSPACE_1, SESSION_1, evidence.id);
    expect(current?.id).toBe(replacement.id);
  });
});

describe('EvidenceReviewService.reviewAction', () => {
  it('begins review, validates evidence, and completes the assignment', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    const underReview = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );
    expect(underReview.reviewStatus).toBe('under_review');

    const validated = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      {
        action: 'validate',
        reason: 'Confirmed with two attendees.',
        expectedVersion: underReview.version,
      },
      REVIEWER_1,
    );

    expect(validated.reviewStatus).toBe('validated');
    expect(validated.verificationStatus).toBe('verified');

    const active = await reviewService.getActiveAssignment(WORKSPACE_1, SESSION_1, evidence.id);
    expect(active).toBeNull();
  });

  it('rejects evidence with a required reason', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    const underReview = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );

    const rejected = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      {
        action: 'reject',
        reason: 'Contradicted by other accounts.',
        expectedVersion: underReview.version,
      },
      REVIEWER_1,
    );

    expect(rejected.reviewStatus).toBe('rejected');
    expect(rejected.verificationStatus).toBe('disputed');
  });

  it('ATTACK — rejects a reviewer who is not the assigned reviewer for this evidence', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    await expect(
      reviewService.reviewAction(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { action: 'begin_review', expectedVersion: evidence.version },
        REVIEWER_2,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ATTACK — rejects beginning review with no active assignment at all', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);

    await expect(
      reviewService.reviewAction(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { action: 'begin_review', expectedVersion: evidence.version },
        REVIEWER_1,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('an admin (evidence_review:manage_restricted) may act without being the assigned reviewer', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    const underReview = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      ADMIN,
    );
    expect(underReview.reviewStatus).toBe('under_review');
  });

  it('ATTACK — rejects validating evidence that only reached submitted, not under_review', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    await expect(
      reviewService.reviewAction(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { action: 'validate', expectedVersion: evidence.version },
        REVIEWER_1,
      ),
    ).rejects.toThrow(/under review/i);
  });

  it('ATTACK — rejects a stale expectedVersion', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );

    await expect(
      reviewService.reviewAction(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { action: 'begin_review', expectedVersion: evidence.version + 1 },
        REVIEWER_1,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — a role without evidence_review:validate is denied even while holding the assignment', async () => {
    const { evidenceService, reviewService } = services(
      'open',
      new Set(['evidence_review:validate']),
    );
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    const underReview = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );

    await expect(
      reviewService.reviewAction(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        { action: 'validate', expectedVersion: underReview.version },
        REVIEWER_1,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('EvidenceReviewService.correct', () => {
  it('corrects content without changing reviewStatus', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);

    const corrected = await reviewService.correct(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      {
        correctionType: 'clerical',
        reason: 'Fixed a typo.',
        title: 'People want more shade (corrected)',
        expectedVersion: evidence.version,
      },
      FACILITATOR,
    );

    expect(corrected.title).toBe('People want more shade (corrected)');
    expect(corrected.reviewStatus).toBe('submitted');
  });

  it('ATTACK — rejects correcting validated evidence', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    const underReview = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );
    const validated = await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'validate', expectedVersion: underReview.version },
      REVIEWER_1,
    );

    await expect(
      reviewService.correct(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        {
          correctionType: 'clerical',
          reason: 'fix',
          title: 'x',
          expectedVersion: validated.version,
        },
        FACILITATOR,
      ),
    ).rejects.toThrow(/cannot be corrected/i);
  });
});

describe('EvidenceReviewService clarifications', () => {
  it('requests a clarification and moves evidence to needs_clarification', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );

    const clarification = await reviewService.requestClarification(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { question: 'Which participant raised this?' },
      REVIEWER_1,
    );
    expect(clarification.status).toBe('open');

    const detail = await evidenceService.get(WORKSPACE_1, SESSION_1, evidence.id, FACILITATOR);
    expect(detail.reviewStatus).toBe('needs_clarification');
  });

  it('responding then closing a clarification resumes review', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );
    const clarification = await reviewService.requestClarification(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { question: 'Which participant raised this?' },
      REVIEWER_1,
    );

    const answered = await reviewService.respondToClarification(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      clarification.id,
      { response: 'It was raised by two attendees.' },
      FACILITATOR,
    );
    expect(answered.status).toBe('answered');

    const closed = await reviewService.closeClarification(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      clarification.id,
      REVIEWER_1,
    );
    expect(closed.status).toBe('closed');

    const detail = await evidenceService.get(WORKSPACE_1, SESSION_1, evidence.id, FACILITATOR);
    expect(detail.reviewStatus).toBe('under_review');
  });

  it('ATTACK — rejects closing an unanswered clarification', async () => {
    const { evidenceService, reviewService } = services();
    const evidence = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { action: 'begin_review', expectedVersion: evidence.version },
      REVIEWER_1,
    );
    const clarification = await reviewService.requestClarification(
      WORKSPACE_1,
      SESSION_1,
      evidence.id,
      { question: 'Which participant raised this?' },
      REVIEWER_1,
    );

    await expect(
      reviewService.closeClarification(
        WORKSPACE_1,
        SESSION_1,
        evidence.id,
        clarification.id,
        REVIEWER_1,
      ),
    ).rejects.toThrow(/answered clarification can be closed/i);
  });

  it('ATTACK — clarification from another evidence is not found (IDOR)', async () => {
    const { evidenceService, reviewService } = services();
    const evidenceA = await submittedEvidence(evidenceService);
    const evidenceB = await submittedEvidence(evidenceService);
    await reviewService.assign(
      WORKSPACE_1,
      SESSION_1,
      evidenceA.id,
      { reviewerUserId: REVIEWER_USER_1 },
      FACILITATOR,
    );
    await reviewService.reviewAction(
      WORKSPACE_1,
      SESSION_1,
      evidenceA.id,
      { action: 'begin_review', expectedVersion: evidenceA.version },
      REVIEWER_1,
    );
    const clarification = await reviewService.requestClarification(
      WORKSPACE_1,
      SESSION_1,
      evidenceA.id,
      { question: 'Which participant raised this?' },
      REVIEWER_1,
    );

    await expect(
      reviewService.respondToClarification(
        WORKSPACE_1,
        SESSION_1,
        evidenceB.id,
        clarification.id,
        { response: 'x' },
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
