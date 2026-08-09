/**
 * Milestone 8 domain tests — the report lifecycle, what a report may draw on,
 * and what it is allowed to say.
 *
 * The composition tests carry the most weight. They are the only place the
 * redaction rule is exercised directly, and every export format goes through
 * it, so a hole here is a hole in HTML, Markdown, JSON and CSV at once.
 */

import { describe, expect, it } from 'vitest';

import {
  approveReport,
  canEditReport,
  canExportReport,
  consentCategoryForAudience,
  createReport,
  excludeReportSource,
  hasSourceDrifted,
  includeReportSource,
  isApprovedReport,
  isFacilitatorVoice,
  projectEvidenceForReport,
  publishReportInternally,
  recordReportExport,
  requestReportChanges,
  reviseApprovedReport,
  submitReportForReview,
  summariseParticipants,
  updateReport,
  assertSourceAdmissible,
  toActorId,
  toCoDesignSessionId,
  toOrganisationId,
  toReportId,
  toReportSourceId,
  toWorkspaceId,
  type Actor,
  type CandidateSource,
  type EvidenceForReport,
  type Report,
  type ReportSourceType,
  type SourceConsentAnswers,
} from './index.js';

const ORG = toOrganisationId('00000000-0000-4000-8000-000000000000');
const OTHER_ORG = toOrganisationId('00000000-0000-4000-8000-0000000000ff');
const WORKSPACE = toWorkspaceId('11111111-1111-4111-8111-111111111111');
const OTHER_WORKSPACE = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const SESSION = toCoDesignSessionId('33333333-3333-4333-8333-333333333333');
const OTHER_SESSION = toCoDesignSessionId('34444444-4444-4444-8444-444444444444');
const REPORT_ID = toReportId('44444444-4444-4444-8444-444444444444');
const REPORT_ID_2 = toReportId('45555555-5555-4555-8555-555555555555');
const SOURCE_ID = toReportSourceId('46666666-6666-4666-8666-666666666666');

const NOW = new Date('2026-03-01T10:00:00.000Z');
const LATER = new Date('2026-03-01T11:00:00.000Z');

const AUTHOR: Actor = {
  id: toActorId('55555555-5555-4555-8555-555555555555'),
  kind: 'human',
  displayName: 'A Facilitator',
};

const APPROVER: Actor = {
  id: toActorId('56666666-6666-4666-8666-666666666666'),
  kind: 'human',
  displayName: 'An Approver',
};

const SCOPE = { organisationId: ORG, workspaceId: WORKSPACE, sessionId: SESSION };

function draftReport(): Report {
  return createReport('closed', {
    id: REPORT_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Eastern footpath co-design session',
    createdBy: AUTHOR,
    at: NOW,
  }).report;
}

function approvedReport(): Report {
  const submitted = submitReportForReview(draftReport(), 'closed', AUTHOR, LATER).report;
  return approveReport(submitted, 'closed', APPROVER, LATER).report;
}

function candidate(overrides: Partial<CandidateSource> = {}): CandidateSource {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    type: 'evidence' as ReportSourceType,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    version: 4,
    status: 'validated',
    ...overrides,
  };
}

describe('Report lifecycle', () => {
  it('starts as a draft at revision 1', () => {
    const report = draftReport();

    expect(report.status).toBe('draft');
    expect(report.revision).toBe(1);
    expect(report.supersedesReportId).toBeNull();
    expect(report.approvedAt).toBeNull();
  });

  it('refuses to report on a session that has not opened', () => {
    expect(() =>
      createReport('scheduled', {
        id: REPORT_ID,
        organisationId: ORG,
        workspaceId: WORKSPACE,
        sessionId: SESSION,
        title: 'Premature',
        createdBy: AUTHOR,
        at: NOW,
      }),
    ).toThrow(/cannot be reported on before it has opened/);
  });

  it('refuses to report on an archived session', () => {
    expect(() =>
      createReport('archived', {
        id: REPORT_ID,
        organisationId: ORG,
        workspaceId: WORKSPACE,
        sessionId: SESSION,
        title: 'Too late',
        createdBy: AUTHOR,
        at: NOW,
      }),
    ).toThrow(/archived session is read-only/);
  });

  it('runs draft → under review → approved → published → exported', () => {
    const submitted = submitReportForReview(draftReport(), 'closed', AUTHOR, LATER).report;
    expect(submitted.status).toBe('under_review');
    expect(submitted.submittedBy).toEqual(AUTHOR);

    const approved = approveReport(submitted, 'closed', APPROVER, LATER).report;
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toEqual(APPROVER);

    const published = publishReportInternally(approved, 'closed', APPROVER, LATER).report;
    expect(published.status).toBe('published_internally');
    expect(published.publishedAt).toEqual(LATER);

    const exported = recordReportExport(published, 'closed', AUTHOR, 'markdown', LATER).report;
    expect(exported.status).toBe('exported');
    expect(exported.firstExportedAt).toEqual(LATER);
  });

  it('sends a report back with a stated reason, and clears it on resubmission', () => {
    const submitted = submitReportForReview(draftReport(), 'closed', AUTHOR, LATER).report;

    const returned = requestReportChanges(
      submitted,
      'closed',
      APPROVER,
      'The recommendations do not follow from the evidence cited.',
      LATER,
    ).report;
    expect(returned.status).toBe('draft');
    expect(returned.changesRequestedReason).toMatch(/do not follow/);

    const resubmitted = submitReportForReview(returned, 'closed', AUTHOR, LATER).report;
    expect(resubmitted.changesRequestedReason).toBeNull();
  });

  it('refuses to send a report back without saying why', () => {
    const submitted = submitReportForReview(draftReport(), 'closed', AUTHOR, LATER).report;

    expect(() => requestReportChanges(submitted, 'closed', APPROVER, '   ', LATER)).toThrow(
      /must have a reason for requesting changes/,
    );
  });

  it('refuses to edit anything but a draft', () => {
    const submitted = submitReportForReview(draftReport(), 'closed', AUTHOR, LATER).report;

    expect(() =>
      updateReport(submitted, 'closed', AUTHOR, { recommendations: 'Late addition' }, LATER),
    ).toThrow(/Only a draft report can be edited/);

    expect(() =>
      updateReport(approvedReport(), 'closed', AUTHOR, { recommendations: 'Later still' }, LATER),
    ).toThrow(/Only a draft report can be edited/);
  });

  it('refuses to approve a report nobody submitted', () => {
    expect(() => approveReport(draftReport(), 'closed', APPROVER, LATER)).toThrow(
      /Only a report under review can be approved/,
    );
  });

  it('refuses to export a report that was approved but never published', () => {
    expect(() => recordReportExport(approvedReport(), 'closed', AUTHOR, 'html', LATER)).toThrow(
      /Only a published report can be exported/,
    );
    expect(canExportReport(approvedReport())).toBe(false);
  });

  it('keeps the first export date across later exports', () => {
    const published = publishReportInternally(approvedReport(), 'closed', APPROVER, NOW).report;
    const first = recordReportExport(published, 'closed', AUTHOR, 'markdown', NOW).report;
    const second = recordReportExport(first, 'closed', AUTHOR, 'csv', LATER).report;

    expect(second.firstExportedAt).toEqual(NOW);
    expect(second.status).toBe('exported');
  });

  it('revises an approved report into a fresh draft that supersedes it', () => {
    const approved = approvedReport();

    const revised = reviseApprovedReport(approved, 'closed', {
      id: REPORT_ID_2,
      reason: 'The evidence behind recommendation 3 was corrected after approval.',
      revisedBy: AUTHOR,
      at: LATER,
    }).report;

    expect(revised.id).toBe(REPORT_ID_2);
    expect(revised.status).toBe('draft');
    expect(revised.revision).toBe(2);
    expect(revised.supersedesReportId).toBe(approved.id);
    expect(revised.approvedBy).toBeNull();
    expect(revised.approvedAt).toBeNull();
    expect(revised.version).toBe(1);

    // The approved revision is untouched by the revision of it.
    expect(approved.status).toBe('approved');
    expect(approved.revision).toBe(1);
  });

  it('refuses to revise a draft, which can simply be edited', () => {
    expect(() =>
      reviseApprovedReport(draftReport(), 'closed', {
        id: REPORT_ID_2,
        reason: 'Unnecessary',
        revisedBy: AUTHOR,
        at: LATER,
      }),
    ).toThrow(/can be edited directly/);
  });

  it('refuses a revision that does not say why', () => {
    expect(() =>
      reviseApprovedReport(approvedReport(), 'closed', {
        id: REPORT_ID_2,
        reason: '',
        revisedBy: AUTHOR,
        at: LATER,
      }),
    ).toThrow(/must have a revision reason/);
  });

  it('reports its own editability and approval state', () => {
    expect(canEditReport(draftReport(), 'closed')).toBe(true);
    expect(canEditReport(draftReport(), 'archived')).toBe(false);
    expect(canEditReport(approvedReport(), 'closed')).toBe(false);
    expect(isApprovedReport(approvedReport())).toBe(true);
    expect(isApprovedReport(draftReport())).toBe(false);
  });
});

describe('What a report may draw on', () => {
  it('accepts validated evidence and freezes its version', () => {
    const outcome = includeReportSource({
      id: SOURCE_ID,
      reportId: REPORT_ID,
      scope: SCOPE,
      candidate: candidate({ version: 4 }),
      includedBy: AUTHOR,
      at: NOW,
    });

    expect(outcome.source.sourceVersion).toBe(4);
    expect(outcome.source.sourceStatus).toBe('validated');
    expect(outcome.event.action).toBe('report_source.included');
  });

  const inadmissibleEvidence = [
    'draft',
    'submitted',
    'under_review',
    'needs_clarification',
    'rejected',
    'withdrawn',
  ] as const;

  for (const status of inadmissibleEvidence) {
    it(`refuses evidence that is '${status}'`, () => {
      expect(() => assertSourceAdmissible(candidate({ status }), SCOPE)).toThrow(
        /Only validated evidence can appear in a report/,
      );
    });
  }

  it('refuses a decision that is only proposed, or one that was reversed', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'decision', status: 'proposed' }), SCOPE),
    ).toThrow(/Only a confirmed decision can appear/);

    expect(() =>
      assertSourceAdmissible(candidate({ type: 'decision', status: 'reversed' }), SCOPE),
    ).toThrow(/Only a confirmed decision can appear/);
  });

  it('accepts a superseded decision, which is still part of the account', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'decision', status: 'superseded' }), SCOPE),
    ).not.toThrow();
  });

  it('refuses a proposed or withdrawn commitment', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'commitment', status: 'proposed' }), SCOPE),
    ).toThrow(/Only an active or fulfilled commitment/);

    expect(() =>
      assertSourceAdmissible(candidate({ type: 'commitment', status: 'withdrawn' }), SCOPE),
    ).toThrow(/Only an active or fulfilled commitment/);
  });

  it('accepts an action in any state, including cancelled', () => {
    for (const status of ['open', 'in_progress', 'blocked', 'completed', 'cancelled']) {
      expect(() =>
        assertSourceAdmissible(candidate({ type: 'action_item', status }), SCOPE),
      ).not.toThrow();
    }
  });

  it('refuses records from another session, workspace or organisation', () => {
    expect(() => assertSourceAdmissible(candidate({ sessionId: OTHER_SESSION }), SCOPE)).toThrow(
      /only draw on records from its own session/,
    );
    expect(() =>
      assertSourceAdmissible(candidate({ workspaceId: OTHER_WORKSPACE }), SCOPE),
    ).toThrow(/another workspace/);
    expect(() => assertSourceAdmissible(candidate({ organisationId: OTHER_ORG }), SCOPE)).toThrow(
      /another organisation/,
    );
  });

  it('notices when a record has moved since it was included', () => {
    const source = includeReportSource({
      id: SOURCE_ID,
      reportId: REPORT_ID,
      scope: SCOPE,
      candidate: candidate({ version: 4 }),
      includedBy: AUTHOR,
      at: NOW,
    }).source;

    expect(hasSourceDrifted(source, 4)).toBe(false);
    expect(hasSourceDrifted(source, 5)).toBe(true);
  });

  it('records an exclusion in the audit trail', () => {
    const source = includeReportSource({
      id: SOURCE_ID,
      reportId: REPORT_ID,
      scope: SCOPE,
      candidate: candidate(),
      includedBy: AUTHOR,
      at: NOW,
    }).source;

    expect(excludeReportSource(source, AUTHOR).action).toBe('report_source.excluded');
  });
});

describe('What a report is allowed to say', () => {
  function evidence(overrides: Partial<EvidenceForReport> = {}): EvidenceForReport {
    return {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Shade near the fountain',
      content: 'There is nowhere to sit out of the sun between the fountain and the gate.',
      evidenceType: 'participant_statement',
      attributionMode: 'attributed',
      hasParticipantSource: true,
      pseudonym: null,
      ...overrides,
    };
  }

  function consent(overrides: Partial<SourceConsentAnswers> = {}): SourceConsentAnswers {
    return {
      withdrawn: false,
      mayUseForAudience: true,
      mayQuoteAttributed: true,
      mayQuoteAnonymously: true,
      ...overrides,
    };
  }

  it('maps each audience to the consent category it implicates', () => {
    expect(consentCategoryForAudience('internal')).toBe('internal_use');
    expect(consentCategoryForAudience('external')).toBe('external_reporting');
    expect(consentCategoryForAudience('public')).toBe('publication');
  });

  it('includes and quotes attributed evidence when the participant agreed', () => {
    const projected = projectEvidenceForReport(evidence(), consent());

    expect(projected).not.toBeNull();
    expect(projected!.attribution).toBe('named_participant');
    expect(projected!.quotable).toBe(true);
    expect(projected!.content).toMatch(/nowhere to sit/);
  });

  it('removes evidence entirely when the participant has withdrawn', () => {
    expect(projectEvidenceForReport(evidence(), consent({ withdrawn: true }))).toBeNull();
  });

  it('removes evidence the participant did not agree to this audience for', () => {
    expect(projectEvidenceForReport(evidence(), consent({ mayUseForAudience: false }))).toBeNull();
  });

  it('fails closed when a participant-sourced record has no consent answer', () => {
    expect(projectEvidenceForReport(evidence(), null)).toBeNull();
  });

  it('demotes attributed evidence to anonymous when attributed quotation was refused', () => {
    const projected = projectEvidenceForReport(evidence(), consent({ mayQuoteAttributed: false }));

    expect(projected!.attribution).toBe('anonymous_participant');
    // Still quotable — anonymously — so the finding survives without the name.
    expect(projected!.quotable).toBe(true);
    expect(projected!.content).toMatch(/nowhere to sit/);
  });

  it('withholds the content, structurally, when no quotation was agreed to', () => {
    const projected = projectEvidenceForReport(
      evidence(),
      consent({ mayQuoteAttributed: false, mayQuoteAnonymously: false }),
    );

    expect(projected).not.toBeNull();
    expect(projected!.quotable).toBe(false);
    expect(projected!.content).toBeUndefined();
    expect('content' in projected!).toBe(false);
    // The finding is still listed — the reader knows it exists.
    expect(projected!.title).toBe('Shade near the fountain');
  });

  it('never carries a real name for a pseudonymous participant', () => {
    const projected = projectEvidenceForReport(
      evidence({ attributionMode: 'pseudonymous', pseudonym: 'Blue Heron' }),
      consent(),
    );

    expect(projected!.attribution).toBe('pseudonymous_participant');
    expect(projected!.pseudonym).toBe('Blue Heron');
    expect(JSON.stringify(projected)).not.toContain('A Facilitator');
  });

  it('never names an anonymous participant, whatever the consent record says', () => {
    const projected = projectEvidenceForReport(
      evidence({ attributionMode: 'anonymous' }),
      consent({ mayQuoteAttributed: true }),
    );

    expect(projected!.attribution).toBe('anonymous_participant');
    expect(projected!.pseudonym).toBeUndefined();
  });

  it('treats evidence with no participant behind it as quotable', () => {
    const projected = projectEvidenceForReport(
      evidence({ attributionMode: 'facilitator_observation', hasParticipantSource: false }),
      null,
    );

    expect(projected!.attribution).toBe('facilitator_observation');
    expect(projected!.quotable).toBe(true);
  });

  it('summarises participation by count, never by name', () => {
    const summary = summariseParticipants([
      { identityMode: 'named', participationMode: 'in_person', withdrawn: false, attended: true },
      { identityMode: 'named', participationMode: 'online', withdrawn: false, attended: true },
      {
        identityMode: 'pseudonymous',
        participationMode: 'in_person',
        withdrawn: false,
        attended: true,
      },
      {
        identityMode: 'anonymous',
        participationMode: 'in_person',
        withdrawn: true,
        attended: false,
      },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.counts).toEqual({ named: 2, pseudonymous: 1, anonymous: 1 });
    expect(summary.withdrawn).toBe(1);
    expect(summary.attendedInPerson).toBe(2);
    expect(summary.attendedOnline).toBe(1);
  });

  it('keeps a withdrawn participant in the total so the count does not identify them', () => {
    const before = summariseParticipants([
      { identityMode: 'named', participationMode: 'in_person', withdrawn: false, attended: true },
      { identityMode: 'named', participationMode: 'in_person', withdrawn: false, attended: true },
    ]);
    const after = summariseParticipants([
      { identityMode: 'named', participationMode: 'in_person', withdrawn: false, attended: true },
      { identityMode: 'named', participationMode: 'in_person', withdrawn: true, attended: true },
    ]);

    expect(after.total).toBe(before.total);
    expect(after.withdrawn).toBe(1);
  });

  it('knows which sections are the facilitator speaking', () => {
    expect(isFacilitatorVoice('facilitatorSynthesis')).toBe(true);
    expect(isFacilitatorVoice('unresolvedQuestions')).toBe(true);
    expect(isFacilitatorVoice('recommendations')).toBe(true);
    expect(isFacilitatorVoice('evidence')).toBe(false);
  });
});
