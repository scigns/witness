import { describe, expect, it } from 'vitest';

import { InvariantViolation } from './errors.js';
import { assertSourceAdmissible, type CandidateSource, type ReportScope } from './report-source.js';
import { toCoDesignSessionId, toOrganisationId, toWorkspaceId } from './ids.js';

const SCOPE: ReportScope = {
  organisationId: toOrganisationId('11111111-1111-4111-8111-111111111111'),
  workspaceId: toWorkspaceId('22222222-2222-4222-8222-222222222222'),
  sessionId: toCoDesignSessionId('33333333-3333-4333-8333-333333333333'),
};

function candidate(overrides: Partial<CandidateSource>): CandidateSource {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    type: 'transcript',
    organisationId: SCOPE.organisationId,
    workspaceId: SCOPE.workspaceId,
    sessionId: SCOPE.sessionId,
    version: 1,
    status: 'confirmed',
    ...overrides,
  };
}

describe('assertSourceAdmissible — transcript and session_summary', () => {
  it('admits a confirmed transcript', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'transcript', status: 'confirmed' }), SCOPE),
    ).not.toThrow();
  });

  it('refuses a completed-but-unconfirmed transcript', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'transcript', status: 'completed' }), SCOPE),
    ).toThrow(InvariantViolation);
  });

  it('admits a confirmed session summary', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'session_summary', status: 'confirmed' }), SCOPE),
    ).not.toThrow();
  });

  it('refuses an unconfirmed session summary', () => {
    expect(() =>
      assertSourceAdmissible(candidate({ type: 'session_summary', status: 'pending' }), SCOPE),
    ).toThrow(InvariantViolation);
  });

  it('still refuses a cross-session transcript', () => {
    expect(() =>
      assertSourceAdmissible(
        candidate({
          type: 'transcript',
          status: 'confirmed',
          sessionId: toCoDesignSessionId('55555555-5555-4555-8555-555555555555'),
        }),
        SCOPE,
      ),
    ).toThrow(InvariantViolation);
  });
});
