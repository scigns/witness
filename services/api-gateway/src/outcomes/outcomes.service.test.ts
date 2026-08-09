/**
 * Service-level tests for `OutcomesService` and `OutcomeSupportService`,
 * against an in-memory Prisma double — see
 * `evidence-review.service.test.ts`/`evidence.service.test.ts` for why this
 * pattern exists.
 *
 * The centre of gravity here is the support rule, because it is the rule the
 * milestone exists to enforce and the one an attacker would go at: evidence
 * that was never validated, evidence from a neighbouring workspace, evidence
 * that was corrected after the link was made, and confirmations raced against
 * the removal of the very thing they rest on.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OutcomesService } from './outcomes.service.js';
import { OutcomeSupportService } from './outcome-support.service.js';

const ORG_1 = '00000000-0000-4000-8000-000000000000';
const ORG_2 = '00000000-0000-4000-8000-0000000000ff';
const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_2 = '22222222-2222-4222-8222-222222222222';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const SESSION_2 = '34444444-4444-4444-8444-444444444444';
const OWNER_USER = '55555555-5555-4555-8555-555555555555';
const OUTSIDE_USER = '56666666-6666-4666-8666-666666666666';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const REVIEWER: Principal = {
  subject: 'dev:reviewer',
  displayName: 'A Reviewer',
  kind: 'human',
  roles: ['reviewer'],
};

interface Row extends Record<string, unknown> {
  id: string;
}

/**
 * Nest's HTTP exceptions carry the structured body rather than the message,
 * so asserting on `error.message` would only ever see 'Not Found Exception'.
 */
function errorCode(error: unknown): string | undefined {
  const body = (error as { getResponse?: () => unknown }).getResponse?.();
  return (body as { error?: { code?: string } } | undefined)?.error?.code;
}

function fakePrisma(sessionStatus = 'open') {
  const sessions: Row[] = [
    { id: SESSION_1, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: sessionStatus },
    // A second session in a *different* workspace and organisation, so the
    // cross-boundary refusals are exercised against real neighbours rather
    // than against ids that simply do not exist.
    { id: SESSION_2, organisationId: ORG_2, workspaceId: WORKSPACE_2, status: 'open' },
  ];
  const memberships: Row[] = [
    { id: `${ORG_1}:${OWNER_USER}`, organisationId: ORG_1, userId: OWNER_USER, state: 'active' },
    {
      id: `${ORG_2}:${OUTSIDE_USER}`,
      organisationId: ORG_2,
      userId: OUTSIDE_USER,
      state: 'active',
    },
  ];
  const evidenceRows: Row[] = [];
  const decisions: Row[] = [];
  const commitments: Row[] = [];
  const actionItems: Row[] = [];
  const supports: Row[] = [];
  const actors: Row[] = [];
  const auditEvents: Row[] = [];

  function actorFor(row: Row, key: string) {
    const id = row[key] as string | null | undefined;
    return id == null ? null : (actors.find((a) => a.id === id) ?? null);
  }

  /**
   * `nullable` matters more than it looks. Postgres returns `null` for a
   * column a write never set, and Prisma passes that through; a naive double
   * that just stores the `data` object leaves those keys *absent* instead.
   * Code written against `x === null` then silently takes the wrong branch in
   * tests and the right one in production, which is the worst possible
   * combination. Listing the nullable columns per table keeps the double
   * honest.
   */
  function table(rows: Row[], relations: Record<string, string> = {}, nullable: string[] = []) {
    const blanks = Object.fromEntries(nullable.map((column) => [column, null]));

    const hydrate = (row: Row, include?: Record<string, boolean>) => {
      if (include === undefined) return { ...row };
      const hydrated: Row = { ...row };
      for (const [relation, foreignKey] of Object.entries(relations)) {
        if (include[relation] === true) hydrated[relation] = actorFor(row, foreignKey);
      }
      return hydrated;
    };

    return {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Record<string, boolean>;
      }) => {
        const row = rows.find((r) => r.id === where.id);
        return row === undefined ? null : hydrate(row, include);
      },
      findUniqueOrThrow: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Record<string, boolean>;
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row === undefined) throw new Error(`no row ${where.id}`);
        return hydrate(row, include);
      },
      findMany: async (args?: {
        where?: Record<string, unknown>;
        include?: Record<string, boolean>;
      }) =>
        rows
          .filter((r) =>
            Object.entries(args?.where ?? {}).every(([key, value]) => r[key] === value),
          )
          .map((r) => hydrate(r, args?.include)),
      count: async (args?: { where?: Record<string, unknown> }) =>
        rows.filter((r) =>
          Object.entries(args?.where ?? {}).every(([key, value]) => r[key] === value),
        ).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...blanks, ...data } as Row;
        rows.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = rows.findIndex((r) => r.id === where.id);
        if (index === -1) throw new Error(`no row ${where.id}`);
        return rows.splice(index, 1)[0]!;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find((r) => r.id === where.id && r['version'] === where.version);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    };
  }

  const prisma = {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s.id === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        const { organisationId, userId } = where.organisationId_userId;
        const row = memberships.find(
          (m) => m['organisationId'] === organisationId && m['userId'] === userId,
        );
        return row === undefined ? null : { ...row };
      },
    },
    evidence: table(evidenceRows),
    decision: table(decisions, { proposedBy: 'proposedById', confirmedBy: 'confirmedById' }, [
      'confirmedById',
      'confirmedAt',
      'supersededByDecisionId',
      'supersededAt',
      'reversedAt',
      'closeReason',
    ]),
    commitment: table(commitments, { proposedBy: 'proposedById', activatedBy: 'activatedById' }, [
      'ownerUserId',
      'dueDate',
      'activatedById',
      'activatedAt',
      'fulfilledAt',
      'fulfilmentNote',
      'supersededByCommitmentId',
      'closedAt',
      'closeReason',
    ]),
    actionItem: table(actionItems, { createdBy: 'createdById' }, [
      'ownerUserId',
      'dueDate',
      'progressNote',
      'blockedReason',
      'startedAt',
      'completedAt',
      'closedAt',
      'closeReason',
    ]),
    outcomeSupport: {
      ...table(supports, { recordedBy: 'recordedById' }, [
        'evidenceId',
        'evidenceVersion',
        'evidenceVerificationStatus',
        'rationale',
        'note',
      ]),
      findMany: async (args?: {
        where?: Record<string, unknown>;
        include?: Record<string, boolean>;
      }) =>
        supports
          .filter((r) =>
            Object.entries(args?.where ?? {}).every(([key, value]) => r[key] === value),
          )
          .map((r) => ({
            ...r,
            ...(args?.include?.['evidence'] === true
              ? { evidence: evidenceRows.find((e) => e.id === r['evidenceId']) ?? null }
              : {}),
            ...(args?.include?.['recordedBy'] === true
              ? { recordedBy: actorFor(r, 'recordedById') }
              : {}),
          })),
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const row = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data } as Row;
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
        auditEvents.push({ ...data } as Row);
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        evidenceRows: evidenceRows.map((r) => ({ ...r })),
        decisions: decisions.map((r) => ({ ...r })),
        commitments: commitments.map((r) => ({ ...r })),
        actionItems: actionItems.map((r) => ({ ...r })),
        supports: supports.map((r) => ({ ...r })),
        actors: actors.map((r) => ({ ...r })),
        auditEvents: auditEvents.map((r) => ({ ...r })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        evidenceRows.splice(0, evidenceRows.length, ...snapshot.evidenceRows);
        decisions.splice(0, decisions.length, ...snapshot.decisions);
        commitments.splice(0, commitments.length, ...snapshot.commitments);
        actionItems.splice(0, actionItems.length, ...snapshot.actionItems);
        supports.splice(0, supports.length, ...snapshot.supports);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    evidenceRows,
    decisions,
    commitments,
    actionItems,
    supports,
    auditEvents,
  };
}

let evidenceCounter = 0;

/** A row shaped like `Evidence`, defaulting to something an outcome may rest on. */
function seedEvidence(
  fixture: ReturnType<typeof fakePrisma>,
  overrides: Record<string, unknown> = {},
) {
  evidenceCounter += 1;
  const id = `9${evidenceCounter.toString().padStart(7, '0')}-0000-4000-8000-000000000000`;
  const row = {
    id,
    organisationId: ORG_1,
    workspaceId: WORKSPACE_1,
    sessionId: SESSION_1,
    title: `Evidence ${evidenceCounter}`,
    reviewStatus: 'validated',
    verificationStatus: 'verified',
    version: 3,
    ...overrides,
  };
  fixture.evidenceRows.push(row as Row);
  return row;
}

function services(sessionStatus = 'open') {
  const fixture = fakePrisma(sessionStatus);
  const support = new OutcomeSupportService(fixture.prisma);
  const outcomes = new OutcomesService(fixture.prisma, support);
  return { ...fixture, support, outcomes };
}

function decisionRequest(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Widen the eastern footpath',
    statement:
      'The eastern footpath will be widened to 2.5 metres before the next planting season.',
    ...overrides,
  } as never;
}

function commitmentRequest(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Publish the shade study',
    description: 'The parks team will publish the shade study on the council website.',
    ownerDescription: 'Parks and Open Spaces team',
    ...overrides,
  } as never;
}

function actionRequest(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Book the surveyor',
    description: 'Arrange a site survey of the eastern footpath.',
    ownerDescription: 'Engagement officer',
    ...overrides,
  } as never;
}

async function supportedDecision(fixture: ReturnType<typeof services>) {
  const decision = await fixture.outcomes.proposeDecision(
    WORKSPACE_1,
    SESSION_1,
    decisionRequest(),
    FACILITATOR,
  );
  const evidence = seedEvidence(fixture);
  const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
    WORKSPACE_1,
    SESSION_1,
    'decision',
    decision.id,
  );
  await fixture.support.record(
    scope,
    'decision',
    decision.id,
    { basis: 'validated_evidence', evidenceId: evidence.id },
    FACILITATOR,
  );
  return { decision, evidence };
}

describe('OutcomesService — decisions', () => {
  it('proposes a decision as proposed, never confirmed', async () => {
    const fixture = services();

    const decision = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest(),
      FACILITATOR,
    );

    expect(decision.status).toBe('proposed');
    expect(decision.confirmedAt).toBeNull();
    expect(decision.supportCount).toBe(0);
    expect(decision.permittedActions).toEqual(['confirm']);
  });

  it('refuses to confirm a decision with nothing behind it', async () => {
    const fixture = services();
    const decision = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest(),
      FACILITATOR,
    );

    await expect(
      fixture.outcomes.transitionDecision(
        WORKSPACE_1,
        SESSION_1,
        decision.id,
        { action: 'confirm', expectedVersion: decision.version },
        REVIEWER,
      ),
    ).rejects.toThrow(/rest on validated evidence or a stated institutional synthesis/);

    const stored = fixture.decisions.find((d) => d.id === decision.id)!;
    expect(stored['status']).toBe('proposed');
  });

  it('confirms a decision once validated evidence supports it', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    const confirmed = await fixture.outcomes.transitionDecision(
      WORKSPACE_1,
      SESSION_1,
      decision.id,
      { action: 'confirm', expectedVersion: decision.version },
      REVIEWER,
    );

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedAt).not.toBeNull();
    expect(confirmed.supportCount).toBe(1);
    expect(confirmed.permittedActions).toEqual(['supersede', 'reverse']);
  });

  it('refuses a stale expectedVersion and writes nothing', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    await expect(
      fixture.outcomes.transitionDecision(
        WORKSPACE_1,
        SESSION_1,
        decision.id,
        { action: 'confirm', expectedVersion: decision.version + 5 },
        REVIEWER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const stored = fixture.decisions.find((d) => d.id === decision.id)!;
    expect(stored['status']).toBe('proposed');
    expect(stored['version']).toBe(decision.version);
  });

  it('records the whole lifecycle in the audit trail', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);
    const confirmed = await fixture.outcomes.transitionDecision(
      WORKSPACE_1,
      SESSION_1,
      decision.id,
      { action: 'confirm', expectedVersion: decision.version },
      REVIEWER,
    );
    await fixture.outcomes.transitionDecision(
      WORKSPACE_1,
      SESSION_1,
      decision.id,
      { action: 'reverse', reason: 'Ward budget withdrawn.', expectedVersion: confirmed.version },
      REVIEWER,
    );

    const history = await fixture.outcomes.decisionHistory(WORKSPACE_1, SESSION_1, decision.id);
    expect(history.map((event) => event.action)).toEqual([
      'decision.proposed',
      'decision.confirmed',
      'decision.reversed',
    ]);
  });

  it('refuses to supersede a decision with one from another session', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);
    const confirmed = await fixture.outcomes.transitionDecision(
      WORKSPACE_1,
      SESSION_1,
      decision.id,
      { action: 'confirm', expectedVersion: decision.version },
      REVIEWER,
    );

    await expect(
      fixture.outcomes.transitionDecision(
        WORKSPACE_1,
        SESSION_1,
        decision.id,
        {
          action: 'supersede',
          supersededByDecisionId: '99999999-9999-4999-8999-999999999999',
          expectedVersion: confirmed.version,
        },
        REVIEWER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to read a decision through the wrong workspace', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    await expect(
      fixture.outcomes.getDecision(WORKSPACE_2, SESSION_1, decision.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OutcomesService — commitments', () => {
  it('records a plain-language owner without a user account', async () => {
    const fixture = services();

    const commitment = await fixture.outcomes.proposeCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitmentRequest(),
      FACILITATOR,
    );

    expect(commitment.ownerDescription).toBe('Parks and Open Spaces team');
    expect(commitment.ownerUserId).toBeNull();
    expect(commitment.status).toBe('proposed');
  });

  it('refuses an owner who is not a member of the outcome’s organisation', async () => {
    const fixture = services();

    // OUTSIDE_USER is a real, active member — of the *other* organisation.
    await expect(
      fixture.outcomes.proposeCommitment(
        WORKSPACE_1,
        SESSION_1,
        commitmentRequest({ ownerUserId: OUTSIDE_USER }),
        FACILITATOR,
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof NotFoundException && errorCode(error) === 'OWNER_NOT_ELIGIBLE',
    );

    expect(fixture.commitments).toHaveLength(0);
  });

  it('accepts an owner who is a member in good standing', async () => {
    const fixture = services();

    const commitment = await fixture.outcomes.proposeCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitmentRequest({ ownerUserId: OWNER_USER }),
      FACILITATOR,
    );

    expect(commitment.ownerUserId).toBe(OWNER_USER);
  });

  it('refuses to activate a commitment with nothing behind it', async () => {
    const fixture = services();
    const commitment = await fixture.outcomes.proposeCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitmentRequest(),
      FACILITATOR,
    );

    await expect(
      fixture.outcomes.transitionCommitment(
        WORKSPACE_1,
        SESSION_1,
        commitment.id,
        { action: 'activate', expectedVersion: commitment.version },
        REVIEWER,
      ),
    ).rejects.toThrow(/rest on validated evidence or a stated institutional synthesis/);
  });

  it('activates on institutional synthesis and runs through to fulfilment', async () => {
    const fixture = services();
    const commitment = await fixture.outcomes.proposeCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitmentRequest(),
      FACILITATOR,
    );
    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'commitment',
      commitment.id,
    );
    await fixture.support.record(
      scope,
      'commitment',
      commitment.id,
      {
        basis: 'institutional_synthesis',
        rationale: 'Repeated across three sessions; no single quotation carries it.',
      },
      REVIEWER,
    );

    const active = await fixture.outcomes.transitionCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitment.id,
      { action: 'activate', expectedVersion: commitment.version },
      REVIEWER,
    );
    expect(active.status).toBe('active');

    const fulfilled = await fixture.outcomes.transitionCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitment.id,
      { action: 'fulfil', note: 'Published 4 March.', expectedVersion: active.version },
      FACILITATOR,
    );
    expect(fulfilled.status).toBe('fulfilled');
    expect(fulfilled.fulfilmentNote).toBe('Published 4 March.');
  });

  it('flags an active commitment past its due date as overdue, but not a proposed one', async () => {
    const fixture = services();
    const commitment = await fixture.outcomes.proposeCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitmentRequest({ dueDate: '2020-01-01T00:00:00.000Z' }),
      FACILITATOR,
    );

    // A proposal nobody has activated is not late — nobody has undertaken
    // anything yet.
    expect(commitment.overdue).toBe(false);

    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'commitment',
      commitment.id,
    );
    await fixture.support.record(
      scope,
      'commitment',
      commitment.id,
      { basis: 'institutional_synthesis', rationale: 'Standing council policy.' },
      REVIEWER,
    );

    const active = await fixture.outcomes.transitionCommitment(
      WORKSPACE_1,
      SESSION_1,
      commitment.id,
      { action: 'activate', expectedVersion: commitment.version },
      REVIEWER,
    );

    expect(active.overdue).toBe(true);
  });
});

describe('OutcomesService — actions', () => {
  it('runs an action from open to completed without requiring support', async () => {
    const fixture = services();
    const created = await fixture.outcomes.createActionItem(
      WORKSPACE_1,
      SESSION_1,
      actionRequest(),
      FACILITATOR,
    );
    expect(created.status).toBe('open');
    expect(created.supportCount).toBe(0);

    const started = await fixture.outcomes.transitionActionItem(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'start', expectedVersion: created.version },
      FACILITATOR,
    );
    const blocked = await fixture.outcomes.transitionActionItem(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'block', reason: 'Surveyor unavailable.', expectedVersion: started.version },
      FACILITATOR,
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.permittedActions).toEqual(['record_progress', 'unblock', 'complete', 'cancel']);

    const unblocked = await fixture.outcomes.transitionActionItem(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'unblock', expectedVersion: blocked.version },
      FACILITATOR,
    );
    expect(unblocked.blockedReason).toBeNull();

    const completed = await fixture.outcomes.transitionActionItem(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'complete', expectedVersion: unblocked.version },
      FACILITATOR,
    );
    expect(completed.status).toBe('completed');
    expect(completed.percentComplete).toBe(100);
    expect(completed.permittedActions).toEqual([]);
  });

  it('refuses a transition on an action in another session', async () => {
    const fixture = services();
    const created = await fixture.outcomes.createActionItem(
      WORKSPACE_1,
      SESSION_1,
      actionRequest(),
      FACILITATOR,
    );

    await expect(
      fixture.outcomes.transitionActionItem(
        WORKSPACE_2,
        SESSION_2,
        created.id,
        { action: 'start', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OutcomeSupportService — what an outcome may rest on', () => {
  const inadmissible = [
    'draft',
    'submitted',
    'under_review',
    'needs_clarification',
    'rejected',
    'withdrawn',
  ] as const;

  for (const reviewStatus of inadmissible) {
    it(`refuses evidence that is '${reviewStatus}'`, async () => {
      const fixture = services();
      const decision = await fixture.outcomes.proposeDecision(
        WORKSPACE_1,
        SESSION_1,
        decisionRequest(),
        FACILITATOR,
      );
      const evidence = seedEvidence(fixture, { reviewStatus, verificationStatus: 'unverified' });
      const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
        WORKSPACE_1,
        SESSION_1,
        'decision',
        decision.id,
      );

      await expect(
        fixture.support.record(
          scope,
          'decision',
          decision.id,
          { basis: 'validated_evidence', evidenceId: evidence.id },
          FACILITATOR,
        ),
      ).rejects.toThrow(/Only validated evidence can support an institutional outcome/);

      expect(fixture.supports).toHaveLength(0);
    });
  }

  it('refuses validated evidence whose verification is disputed', async () => {
    const fixture = services();
    const decision = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest(),
      FACILITATOR,
    );
    const evidence = seedEvidence(fixture, { verificationStatus: 'disputed' });
    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      decision.id,
    );

    await expect(
      fixture.support.record(
        scope,
        'decision',
        decision.id,
        { basis: 'validated_evidence', evidenceId: evidence.id },
        FACILITATOR,
      ),
    ).rejects.toThrow(/disputed/);
  });

  it('refuses evidence from another session as not found, not as inadmissible', async () => {
    const fixture = services();
    const decision = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest(),
      FACILITATOR,
    );
    // Perfectly valid evidence — but in the neighbouring workspace. The
    // caller must not be able to tell it exists at all.
    const evidence = seedEvidence(fixture, {
      organisationId: ORG_2,
      workspaceId: WORKSPACE_2,
      sessionId: SESSION_2,
    });
    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      decision.id,
    );

    await expect(
      fixture.support.record(
        scope,
        'decision',
        decision.id,
        { basis: 'validated_evidence', evidenceId: evidence.id },
        FACILITATOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('freezes the evidence version and verification status at link time', async () => {
    const fixture = services();
    const { decision, evidence } = await supportedDecision(fixture);

    // The evidence is corrected afterwards, bumping its own version.
    const stored = fixture.evidenceRows.find((e) => e.id === evidence.id)!;
    stored['version'] = 9;
    stored['verificationStatus'] = 'disputed';

    const [support] = await fixture.support.listViews('decision', decision.id);
    expect(support!.evidenceVersion).toBe(3);
    expect(support!.evidenceVerificationStatus).toBe('verified');
  });

  it('requires a rationale for institutional synthesis', async () => {
    const fixture = services();
    const decision = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest(),
      FACILITATOR,
    );
    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      decision.id,
    );

    await expect(
      fixture.support.record(
        scope,
        'decision',
        decision.id,
        { basis: 'institutional_synthesis', rationale: '   ' },
        FACILITATOR,
      ),
    ).rejects.toThrow(/must state its rationale/);
  });

  it('refuses to remove the last basis from a confirmed decision', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);
    await fixture.outcomes.transitionDecision(
      WORKSPACE_1,
      SESSION_1,
      decision.id,
      { action: 'confirm', expectedVersion: decision.version },
      REVIEWER,
    );

    const [support] = await fixture.support.listViews('decision', decision.id);
    const { scope, isAuthoritative } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      decision.id,
    );
    expect(isAuthoritative).toBe(true);

    await expect(
      fixture.support.remove(
        scope,
        'decision',
        decision.id,
        support!.id,
        isAuthoritative,
        REVIEWER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.supports).toHaveLength(1);
  });

  it('allows removing a basis while the decision is still only proposed', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    const [support] = await fixture.support.listViews('decision', decision.id);
    const { scope, isAuthoritative } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      decision.id,
    );
    expect(isAuthoritative).toBe(false);

    await fixture.support.remove(
      scope,
      'decision',
      decision.id,
      support!.id,
      isAuthoritative,
      FACILITATOR,
    );

    expect(fixture.supports).toHaveLength(0);
  });

  it('refuses a support record belonging to a different outcome', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);
    const other = await fixture.outcomes.proposeDecision(
      WORKSPACE_1,
      SESSION_1,
      decisionRequest({ title: 'A different decision' }),
      FACILITATOR,
    );

    const [support] = await fixture.support.listViews('decision', decision.id);
    const { scope } = await fixture.outcomes.resolveOutcomeForSupport(
      WORKSPACE_1,
      SESSION_1,
      'decision',
      other.id,
    );

    await expect(
      fixture.support.remove(scope, 'decision', other.id, support!.id, false, FACILITATOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to confirm when the last basis was removed after it was loaded', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    // The support is detached between the client reading the decision and
    // the confirmation arriving. The confirmation must see the removal,
    // because it reads support inside its own transaction.
    fixture.supports.splice(0, fixture.supports.length);

    await expect(
      fixture.outcomes.transitionDecision(
        WORKSPACE_1,
        SESSION_1,
        decision.id,
        { action: 'confirm', expectedVersion: decision.version },
        REVIEWER,
      ),
    ).rejects.toThrow(/rest on validated evidence or a stated institutional synthesis/);
  });

  it('refuses every support operation on an outcome in another workspace', async () => {
    const fixture = services();
    const { decision } = await supportedDecision(fixture);

    await expect(
      fixture.outcomes.resolveOutcomeForSupport(WORKSPACE_2, SESSION_2, 'decision', decision.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OutcomesService — archived sessions are read-only', () => {
  it('refuses to propose a decision in an archived session', async () => {
    const fixture = services('archived');

    await expect(
      fixture.outcomes.proposeDecision(WORKSPACE_1, SESSION_1, decisionRequest(), FACILITATOR),
    ).rejects.toThrow(/archived session is read-only/);
  });

  it('refuses to record an outcome before the session has opened', async () => {
    const fixture = services('scheduled');

    await expect(
      fixture.outcomes.createActionItem(WORKSPACE_1, SESSION_1, actionRequest(), FACILITATOR),
    ).rejects.toThrow(/only be recorded once a session has opened/);
  });
});
