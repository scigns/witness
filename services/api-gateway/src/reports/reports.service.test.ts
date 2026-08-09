/**
 * Service-level tests for `ReportsService`, against an in-memory Prisma
 * double — see `outcomes.service.test.ts` for why this pattern exists.
 *
 * The weight is on rendering and export, because that is where a privacy
 * failure would actually reach a reader. A report that merely *stores* the
 * wrong thing is a bug; a report that *exports* the wrong thing has already
 * left the building.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ReportsService } from './reports.service.js';
import { renderCsv, renderExport, renderHtml, renderMarkdown } from './report-export.js';

const ORG = '00000000-0000-4000-8000-000000000000';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const OTHER_SESSION = '34444444-4444-4444-8444-444444444444';

const AUTHOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const APPROVER: Principal = {
  subject: 'dev:reviewer',
  displayName: 'An Approver',
  kind: 'human',
  roles: ['reviewer'],
};

interface Row extends Record<string, unknown> {
  id: string;
}

/** Consent answers the fake policy service will give, per participant. */
interface ConsentFixture {
  category: boolean;
  attributed: boolean;
  anonymous: boolean;
}

function fakePrisma(sessionStatus = 'closed') {
  const sessions: Row[] = [
    {
      id: SESSION,
      organisationId: ORG,
      workspaceId: WORKSPACE,
      status: sessionStatus,
      title: 'Eastern footpath co-design',
      sessionType: 'workshop',
      purpose: 'Decide what to do about the eastern footpath.',
      startAt: new Date('2026-02-10T09:00:00.000Z'),
      location: 'Ward hall',
    },
    {
      id: OTHER_SESSION,
      organisationId: ORG,
      workspaceId: OTHER_WORKSPACE,
      status: 'open',
      title: 'Elsewhere',
      sessionType: 'workshop',
      purpose: 'Other',
      startAt: null,
      location: null,
    },
  ];
  const participants: Row[] = [];
  const evidenceRows: Row[] = [];
  const decisions: Row[] = [];
  const commitments: Row[] = [];
  const actionItems: Row[] = [];
  const reports: Row[] = [];
  const reportSources: Row[] = [];
  const actors: Row[] = [];
  const auditEvents: Row[] = [];

  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value !== null && typeof value === 'object' && 'in' in (value as object)) {
        return ((value as { in: unknown[] }).in ?? []).includes(row[key]);
      }
      return row[key] === value;
    });
  }

  function actorFor(row: Row, key: string) {
    const id = row[key] as string | null | undefined;
    return id == null ? null : (actors.find((a) => a.id === id) ?? null);
  }

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
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row === undefined) throw new Error(`no row ${where.id}`);
        return { ...row };
      },
      findMany: async (args?: {
        where?: Record<string, unknown>;
        include?: Record<string, boolean>;
      }) => rows.filter((r) => matches(r, args?.where ?? {})).map((r) => hydrate(r, args?.include)),
      count: async (args?: { where?: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, args?.where ?? {})).length,
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
    sessionParticipant: table(participants),
    evidence: table(evidenceRows),
    decision: table(decisions),
    commitment: table(commitments),
    actionItem: table(actionItems),
    report: table(
      reports,
      { createdBy: 'createdById', submittedBy: 'submittedById', approvedBy: 'approvedById' },
      [
        'purpose',
        'supersedesReportId',
        'facilitatorSynthesis',
        'unresolvedQuestions',
        'recommendations',
        'submittedById',
        'submittedAt',
        'approvedById',
        'approvedAt',
        'changesRequestedReason',
        'publishedAt',
        'firstExportedAt',
      ],
    ),
    reportSource: table(reportSources, { includedBy: 'includedById' }),
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
      const snapshot = [
        reports.map((r) => ({ ...r })),
        reportSources.map((r) => ({ ...r })),
        auditEvents.map((r) => ({ ...r })),
        actors.map((r) => ({ ...r })),
      ] as const;
      try {
        return await fn(prisma);
      } catch (error) {
        reports.splice(0, reports.length, ...snapshot[0]);
        reportSources.splice(0, reportSources.length, ...snapshot[1]);
        auditEvents.splice(0, auditEvents.length, ...snapshot[2]);
        actors.splice(0, actors.length, ...snapshot[3]);
        throw error;
      }
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    participants,
    evidenceRows,
    decisions,
    commitments,
    actionItems,
    reports,
    reportSources,
    auditEvents,
  };
}

function fakeConsent(answers: Map<string, ConsentFixture>): ConsentPolicyService {
  const answer = (participantId: string, pick: keyof ConsentFixture) => {
    const fixture = answers.get(participantId);
    return {
      allowed: fixture === undefined ? false : fixture[pick],
      reason: 'test',
    };
  };
  return {
    mayUseCategory: async (_s: string, participantId: string) => answer(participantId, 'category'),
    mayAttributeQuotation: async (_s: string, participantId: string) =>
      answer(participantId, 'attributed'),
    mayQuoteAnonymously: async (_s: string, participantId: string) =>
      answer(participantId, 'anonymous'),
  } as unknown as ConsentPolicyService;
}

let counter = 0;
function uuid(): string {
  counter += 1;
  return `9${counter.toString().padStart(7, '0')}-0000-4000-8000-000000000000`;
}

interface Fixture extends ReturnType<typeof fakePrisma> {
  reportsService: ReportsService;
  consent: Map<string, ConsentFixture>;
}

function services(sessionStatus = 'closed'): Fixture {
  const fixture = fakePrisma(sessionStatus);
  const consent = new Map<string, ConsentFixture>();
  const reportsService = new ReportsService(fixture.prisma, fakeConsent(consent));
  return { ...fixture, reportsService, consent };
}

function seedParticipant(
  fixture: Fixture,
  overrides: Record<string, unknown> = {},
  consent: ConsentFixture = { category: true, attributed: true, anonymous: true },
): string {
  const id = uuid();
  fixture.participants.push({
    id,
    sessionId: SESSION,
    workspaceId: WORKSPACE,
    displayName: 'Blue Heron',
    identityMode: 'named',
    participationMode: 'in_person',
    attendanceStatus: 'attended',
    withdrawnAt: null,
    ...overrides,
  } as Row);
  fixture.consent.set(id, consent);
  return id;
}

function seedEvidence(fixture: Fixture, overrides: Record<string, unknown> = {}): string {
  const id = uuid();
  fixture.evidenceRows.push({
    id,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Shade near the fountain',
    content: 'There is nowhere to sit out of the sun.',
    evidenceType: 'participant_statement',
    attributionMode: 'facilitator_observation',
    sourceParticipantId: null,
    reviewStatus: 'validated',
    verificationStatus: 'verified',
    version: 3,
    ...overrides,
  } as Row);
  return id;
}

function seedDecision(fixture: Fixture, overrides: Record<string, unknown> = {}): string {
  const id = uuid();
  fixture.decisions.push({
    id,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Widen the footpath',
    statement: 'The eastern footpath will be widened to 2.5 metres.',
    status: 'confirmed',
    version: 2,
    ...overrides,
  } as Row);
  return id;
}

async function draft(fixture: Fixture, includeEligibleSources = true) {
  return fixture.reportsService.create(
    WORKSPACE,
    SESSION,
    { title: 'What the session decided', includeEligibleSources } as never,
    AUTHOR,
  );
}

async function published(fixture: Fixture) {
  let report = await draft(fixture);
  report = await fixture.reportsService.transition(
    WORKSPACE,
    SESSION,
    report.id,
    { action: 'submit', expectedVersion: report.version },
    AUTHOR,
  );
  report = await fixture.reportsService.transition(
    WORKSPACE,
    SESSION,
    report.id,
    { action: 'approve', expectedVersion: report.version },
    APPROVER,
  );
  return fixture.reportsService.transition(
    WORKSPACE,
    SESSION,
    report.id,
    { action: 'publish', expectedVersion: report.version },
    APPROVER,
  );
}

describe('ReportsService — lifecycle', () => {
  it('creates a draft and draws in everything eligible', async () => {
    const fixture = services();
    seedEvidence(fixture);
    seedEvidence(fixture, { reviewStatus: 'rejected' });
    seedDecision(fixture);
    seedDecision(fixture, { status: 'proposed' });

    const report = await draft(fixture);

    expect(report.status).toBe('draft');
    expect(report.revision).toBe(1);
    // One validated piece of evidence and one confirmed decision. The
    // rejected evidence and the proposed decision are not eligible.
    expect(report.sources).toHaveLength(2);
    expect(report.sources.map((source) => source.sourceType).sort()).toEqual([
      'decision',
      'evidence',
    ]);
  });

  it('freezes the version of every record it cites', async () => {
    const fixture = services();
    const evidenceId = seedEvidence(fixture, { version: 3 });

    const report = await draft(fixture);
    const cited = report.sources.find((source) => source.sourceId === evidenceId)!;
    expect(cited.sourceVersion).toBe(3);
    expect(cited.drifted).toBe(false);

    // The evidence is corrected afterwards.
    fixture.evidenceRows.find((row) => row.id === evidenceId)!['version'] = 4;

    const reloaded = await fixture.reportsService.get(WORKSPACE, SESSION, report.id);
    const after = reloaded.sources.find((source) => source.sourceId === evidenceId)!;
    expect(after.sourceVersion).toBe(3);
    expect(after.drifted).toBe(true);
  });

  it('runs draft → under review → approved → published → exported', async () => {
    const fixture = services();
    seedEvidence(fixture);

    const report = await published(fixture);
    expect(report.status).toBe('published_internally');
    expect(report.canExport).toBe(true);

    await fixture.reportsService.export(WORKSPACE, SESSION, report.id, 'markdown', AUTHOR);
    const exported = await fixture.reportsService.get(WORKSPACE, SESSION, report.id);
    expect(exported.status).toBe('exported');
    expect(exported.firstExportedAt).not.toBeNull();
  });

  it('refuses to export a report that was never published', async () => {
    const fixture = services();
    const report = await draft(fixture);

    await expect(
      fixture.reportsService.export(WORKSPACE, SESSION, report.id, 'json', AUTHOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a stale expectedVersion and writes nothing', async () => {
    const fixture = services();
    const report = await draft(fixture);

    await expect(
      fixture.reportsService.transition(
        WORKSPACE,
        SESSION,
        report.id,
        { action: 'submit', expectedVersion: report.version + 5 },
        AUTHOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const stored = fixture.reports.find((row) => row.id === report.id)!;
    expect(stored['status']).toBe('draft');
  });

  it('refuses to change citations once a report has left draft', async () => {
    const fixture = services();
    const evidenceId = seedEvidence(fixture);
    const report = await draft(fixture, false);

    const submitted = await fixture.reportsService.transition(
      WORKSPACE,
      SESSION,
      report.id,
      { action: 'submit', expectedVersion: report.version },
      AUTHOR,
    );

    await expect(
      fixture.reportsService.includeSource(
        WORKSPACE,
        SESSION,
        submitted.id,
        { sourceType: 'evidence', sourceId: evidenceId },
        AUTHOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revises an approved report into a new draft carrying its citations', async () => {
    const fixture = services();
    seedEvidence(fixture);
    const report = await published(fixture);

    const revised = await fixture.reportsService.transition(
      WORKSPACE,
      SESSION,
      report.id,
      {
        action: 'revise',
        reason: 'The evidence behind the recommendation was corrected.',
        expectedVersion: report.version,
      },
      AUTHOR,
    );

    expect(revised.id).not.toBe(report.id);
    expect(revised.revision).toBe(2);
    expect(revised.status).toBe('draft');
    expect(revised.supersedesReportId).toBe(report.id);
    expect(revised.sources).toHaveLength(report.sources.length);

    // The published revision is untouched.
    const original = await fixture.reportsService.get(WORKSPACE, SESSION, report.id);
    expect(original.status).toBe('published_internally');
    expect(original.revision).toBe(1);
  });

  it('records the lifecycle in the audit trail', async () => {
    const fixture = services();
    seedEvidence(fixture);
    const report = await published(fixture);

    const history = await fixture.reportsService.history(WORKSPACE, SESSION, report.id);
    expect(history.map((event) => event.action)).toEqual([
      'report.created',
      'report.submitted',
      'report.approved',
      'report.published',
    ]);
  });

  it('refuses to read a report through the wrong workspace', async () => {
    const fixture = services();
    const report = await draft(fixture);

    await expect(
      fixture.reportsService.get(OTHER_WORKSPACE, SESSION, report.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to cite a record from another session', async () => {
    const fixture = services();
    const report = await draft(fixture, false);
    const foreign = uuid();
    fixture.evidenceRows.push({
      id: foreign,
      organisationId: ORG,
      workspaceId: OTHER_WORKSPACE,
      sessionId: OTHER_SESSION,
      title: 'Elsewhere',
      content: 'Not ours.',
      evidenceType: 'observation',
      attributionMode: 'facilitator_observation',
      sourceParticipantId: null,
      reviewStatus: 'validated',
      verificationStatus: 'verified',
      version: 1,
    } as Row);

    await expect(
      fixture.reportsService.includeSource(
        WORKSPACE,
        SESSION,
        report.id,
        { sourceType: 'evidence', sourceId: foreign },
        AUTHOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to cite evidence that was never validated', async () => {
    const fixture = services();
    const rejected = seedEvidence(fixture, { reviewStatus: 'rejected' });
    const report = await draft(fixture, false);

    await expect(
      fixture.reportsService.includeSource(
        WORKSPACE,
        SESSION,
        report.id,
        { sourceType: 'evidence', sourceId: rejected },
        AUTHOR,
      ),
    ).rejects.toThrow(/Only validated evidence can appear in a report/);
  });
});

describe('ReportsService — what a rendered report says', () => {
  it('quotes evidence the participant agreed to be quoted for', async () => {
    const fixture = services();
    const participant = seedParticipant(fixture);
    seedEvidence(fixture, { attributionMode: 'attributed', sourceParticipantId: participant });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.evidence).toHaveLength(1);
    expect(rendered.evidence[0]!.attribution).toBe('named_participant');
    expect(rendered.evidence[0]!.content).toMatch(/nowhere to sit/);
    expect(rendered.redactedCount).toBe(0);
  });

  it('removes evidence from a participant who has withdrawn', async () => {
    const fixture = services();
    const participant = seedParticipant(fixture, { withdrawnAt: new Date() });
    seedEvidence(fixture, { attributionMode: 'attributed', sourceParticipantId: participant });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.evidence).toHaveLength(0);
    expect(rendered.redactedCount).toBe(1);
  });

  it('removes evidence the participant did not agree to this audience for', async () => {
    const fixture = services();
    const participant = seedParticipant(
      fixture,
      {},
      { category: false, attributed: true, anonymous: true },
    );
    seedEvidence(fixture, { attributionMode: 'attributed', sourceParticipantId: participant });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);
    expect(rendered.evidence).toHaveLength(0);
    expect(rendered.redactedCount).toBe(1);
  });

  it('withholds the content when no quotation was agreed to, but keeps the finding', async () => {
    const fixture = services();
    const participant = seedParticipant(
      fixture,
      {},
      { category: true, attributed: false, anonymous: false },
    );
    seedEvidence(fixture, { attributionMode: 'attributed', sourceParticipantId: participant });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.evidence).toHaveLength(1);
    expect(rendered.evidence[0]!.quotable).toBe(false);
    expect(rendered.evidence[0]!.content).toBeUndefined();
    expect(rendered.evidence[0]!.title).toBe('Shade near the fountain');
  });

  it('never leaks a participant name through an anonymous record', async () => {
    const fixture = services();
    const participant = seedParticipant(fixture, {
      displayName: 'Alexandra Fitzgerald',
      identityMode: 'anonymous',
    });
    seedEvidence(fixture, { attributionMode: 'anonymous', sourceParticipantId: participant });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.evidence[0]!.attribution).toBe('anonymous_participant');
    expect(JSON.stringify(rendered)).not.toContain('Alexandra Fitzgerald');
    for (const format of ['html', 'markdown', 'json', 'csv'] as const) {
      expect(renderExport(rendered, format).body).not.toContain('Alexandra Fitzgerald');
    }
  });

  it('summarises participants by count and never lists them', async () => {
    const fixture = services();
    seedParticipant(fixture, { displayName: 'Named One', identityMode: 'named' });
    seedParticipant(fixture, { displayName: 'Pseudo One', identityMode: 'pseudonymous' });
    seedParticipant(fixture, {
      displayName: 'Anonymous One',
      identityMode: 'anonymous',
      participationMode: 'online',
    });
    const report = await draft(fixture);

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.participants).toEqual({
      total: 3,
      named: 1,
      pseudonymous: 1,
      anonymous: 1,
      withdrawn: 0,
      attendedInPerson: 2,
      attendedOnline: 1,
    });
    expect(JSON.stringify(rendered.participants)).not.toContain('Named One');
  });

  it('renders decisions, commitments and actions it cites', async () => {
    const fixture = services();
    seedDecision(fixture);
    fixture.commitments.push({
      id: uuid(),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      sessionId: SESSION,
      title: 'Publish the shade study',
      description: 'The parks team will publish it.',
      status: 'active',
      ownerDescription: 'Parks team',
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      version: 2,
    } as Row);
    fixture.actionItems.push({
      id: uuid(),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      sessionId: SESSION,
      title: 'Book the surveyor',
      description: 'Arrange a site survey.',
      status: 'open',
      ownerDescription: 'Engagement officer',
      dueDate: null,
      version: 1,
    } as Row);

    const report = await draft(fixture);
    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(rendered.decisions).toHaveLength(1);
    expect(rendered.commitments[0]!.owner).toBe('Parks team');
    expect(rendered.actions[0]!.title).toBe('Book the surveyor');
  });

  it('re-evaluates consent at render time, so a later withdrawal takes effect', async () => {
    const fixture = services();
    const participant = seedParticipant(fixture);
    seedEvidence(fixture, { attributionMode: 'attributed', sourceParticipantId: participant });
    const report = await published(fixture);

    const before = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);
    expect(before.evidence).toHaveLength(1);

    // The participant withdraws after the report was approved and published.
    fixture.participants.find((row) => row.id === participant)!['withdrawnAt'] = new Date();

    const after = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);
    expect(after.evidence).toHaveLength(0);
    expect(after.redactedCount).toBe(1);
  });
});

describe('Report exports', () => {
  async function renderedFixture() {
    const fixture = services();
    const participant = seedParticipant(
      fixture,
      { displayName: 'Blue Heron', identityMode: 'pseudonymous' },
      { category: true, attributed: false, anonymous: false },
    );
    seedEvidence(fixture, { attributionMode: 'pseudonymous', sourceParticipantId: participant });
    seedDecision(fixture);
    const report = await published(fixture);
    return fixture.reportsService.render(WORKSPACE, SESSION, report.id);
  }

  it('states that content was withheld rather than leaving a silent gap', async () => {
    const rendered = await renderedFixture();

    for (const format of ['html', 'markdown', 'csv'] as const) {
      expect(renderExport(rendered, format).body).toMatch(/withheld/i);
    }
  });

  it('escapes HTML rather than emitting caller-supplied markup', async () => {
    const fixture = services();
    seedEvidence(fixture, { title: '<script>alert(1)</script>' });
    const report = await published(fixture);
    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    const html = renderHtml(rendered);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises spreadsheet formulas in CSV', async () => {
    const fixture = services();
    seedEvidence(fixture, { title: '=HYPERLINK("http://evil","click")' });
    const report = await published(fixture);
    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    const csv = renderCsv(rendered);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).not.toMatch(/,"=HYPERLINK/);
  });

  it('labels facilitator narrative as interpretation, not testimony', async () => {
    const fixture = services();
    seedEvidence(fixture);
    let report = await draft(fixture);
    report = await fixture.reportsService.update(
      WORKSPACE,
      SESSION,
      report.id,
      {
        facilitatorSynthesis: 'The room converged on shade as the priority.',
        expectedVersion: report.version,
      } as never,
      AUTHOR,
    );
    report = await fixture.reportsService.transition(
      WORKSPACE,
      SESSION,
      report.id,
      { action: 'submit', expectedVersion: report.version },
      AUTHOR,
    );
    report = await fixture.reportsService.transition(
      WORKSPACE,
      SESSION,
      report.id,
      { action: 'approve', expectedVersion: report.version },
      APPROVER,
    );
    report = await fixture.reportsService.transition(
      WORKSPACE,
      SESSION,
      report.id,
      { action: 'publish', expectedVersion: report.version },
      APPROVER,
    );

    const rendered = await fixture.reportsService.render(WORKSPACE, SESSION, report.id);

    expect(renderHtml(rendered)).toMatch(/not participant testimony/);
    expect(renderMarkdown(rendered)).toMatch(/not participant testimony/);
  });

  it('serialises every declared format with a sensible filename', async () => {
    const rendered = await renderedFixture();

    expect(renderExport(rendered, 'html').filename).toMatch(/\.html$/);
    expect(renderExport(rendered, 'markdown').filename).toMatch(/\.md$/);
    expect(renderExport(rendered, 'csv').filename).toMatch(/\.csv$/);
    expect(renderExport(rendered, 'json').contentType).toMatch(/application\/json/);
    expect(JSON.parse(renderExport(rendered, 'json').body)).toHaveProperty('report');
  });
});
