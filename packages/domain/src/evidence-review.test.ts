import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  beginReview,
  canBeginReview,
  canCorrectEvidence,
  canDecideEvidence,
  captureEvidence,
  correctEvidence,
  markNeedsClarification,
  rejectEvidence,
  resumeReviewAfterClarification,
  submitEvidence,
  validateEvidence,
  type Evidence,
} from './evidence.js';

const FACILITATOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const REVIEWER: Actor = {
  id: toActorId('12121212-1212-4212-8212-121212121212'),
  kind: 'human',
  displayName: 'Reviewer',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const EVIDENCE_ID = toEvidenceId('66666666-6666-4666-8666-666666666666');

function baseInput() {
  return {
    id: EVIDENCE_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    evidenceType: 'observation',
    title: 'People want more shade in the plaza',
    content: 'Several participants raised the lack of shade near the fountain.',
    attributionMode: 'facilitator_observation' as const,
    capturedBy: FACILITATOR,
    at: NOW,
  };
}

function draftEvidence(): Evidence {
  return captureEvidence('open', baseInput()).evidence;
}

function submittedEvidence(): Evidence {
  return submitEvidence(draftEvidence(), 'open', FACILITATOR, NOW).evidence;
}

function underReviewEvidence(): Evidence {
  return beginReview(submittedEvidence(), 'open', REVIEWER, NOW).evidence;
}

describe('beginReview', () => {
  it('moves submitted evidence into under_review', () => {
    const { evidence, event } = beginReview(submittedEvidence(), 'open', REVIEWER, NOW);
    expect(evidence.reviewStatus).toBe('under_review');
    expect(evidence.version).toBe(3);
    expect(event.action).toBe('evidence.review_started');
  });

  it('ATTACK — rejects beginning review on a draft', () => {
    expect(() => beginReview(draftEvidence(), 'open', REVIEWER, NOW)).toThrow(
      /INVALID_EVIDENCE_TRANSITION|submitted evidence can enter review/i,
    );
  });

  it('ATTACK — rejects beginning review on an archived session', () => {
    expect(() => beginReview(submittedEvidence(), 'archived', REVIEWER, NOW)).toThrow(/archived/i);
  });
});

describe('markNeedsClarification / resumeReviewAfterClarification', () => {
  it('moves under_review evidence to needs_clarification and back', () => {
    const { evidence: needsClarification } = markNeedsClarification(
      underReviewEvidence(),
      'open',
      REVIEWER,
      NOW,
    );
    expect(needsClarification.reviewStatus).toBe('needs_clarification');

    const { evidence: resumed, event } = resumeReviewAfterClarification(
      needsClarification,
      'open',
      REVIEWER,
      LATER,
    );
    expect(resumed.reviewStatus).toBe('under_review');
    expect(event.action).toBe('evidence.review_started');
  });

  it('ATTACK — rejects marking a draft as needing clarification', () => {
    expect(() => markNeedsClarification(draftEvidence(), 'open', REVIEWER, NOW)).toThrow(
      /under review/i,
    );
  });

  it('ATTACK — rejects resuming review on evidence not awaiting clarification', () => {
    expect(() =>
      resumeReviewAfterClarification(underReviewEvidence(), 'open', REVIEWER, NOW),
    ).toThrow(/awaiting clarification/i);
  });
});

describe('validateEvidence', () => {
  it('validates evidence under review and marks it verified', () => {
    const { evidence, event } = validateEvidence(
      underReviewEvidence(),
      'open',
      REVIEWER,
      'Matches facilitator notes.',
      NOW,
    );
    expect(evidence.reviewStatus).toBe('validated');
    expect(evidence.verificationStatus).toBe('verified');
    expect(evidence.reviewDecisionReason).toBe('Matches facilitator notes.');
    expect(event.action).toBe('evidence.validated');
  });

  it('allows validation without a reason', () => {
    const { evidence } = validateEvidence(underReviewEvidence(), 'open', REVIEWER, null, NOW);
    expect(evidence.reviewDecisionReason).toBeNull();
  });

  it('ATTACK — rejects validating a draft', () => {
    expect(() => validateEvidence(draftEvidence(), 'open', REVIEWER, null, NOW)).toThrow(
      /under review/i,
    );
  });

  it('ATTACK — rejects validating merely-submitted evidence', () => {
    expect(() => validateEvidence(submittedEvidence(), 'open', REVIEWER, null, NOW)).toThrow(
      /under review/i,
    );
  });

  it('ATTACK — rejects re-validating already-validated evidence', () => {
    const validated = validateEvidence(underReviewEvidence(), 'open', REVIEWER, null, NOW).evidence;
    expect(() => validateEvidence(validated, 'open', REVIEWER, null, LATER)).toThrow(
      /under review/i,
    );
  });

  it('ATTACK — rejects validating on an archived session', () => {
    expect(() => validateEvidence(underReviewEvidence(), 'archived', REVIEWER, null, NOW)).toThrow(
      /archived/i,
    );
  });
});

describe('rejectEvidence', () => {
  it('rejects evidence under review and marks it disputed', () => {
    const { evidence, event } = rejectEvidence(
      underReviewEvidence(),
      'open',
      REVIEWER,
      'Contradicted by two other accounts.',
      NOW,
    );
    expect(evidence.reviewStatus).toBe('rejected');
    expect(evidence.verificationStatus).toBe('disputed');
    expect(evidence.reviewDecisionReason).toBe('Contradicted by two other accounts.');
    expect(event.action).toBe('evidence.rejected');
  });

  it('ATTACK — requires a non-empty reason', () => {
    expect(() => rejectEvidence(underReviewEvidence(), 'open', REVIEWER, '   ', NOW)).toThrow(
      /reason/i,
    );
  });

  it('ATTACK — rejects rejecting a draft', () => {
    expect(() => rejectEvidence(draftEvidence(), 'open', REVIEWER, 'no', NOW)).toThrow(
      /under review/i,
    );
  });

  it('ATTACK — rejects rejecting already-rejected evidence', () => {
    const rejected = rejectEvidence(underReviewEvidence(), 'open', REVIEWER, 'no', NOW).evidence;
    expect(() => rejectEvidence(rejected, 'open', REVIEWER, 'no again', LATER)).toThrow(
      /under review/i,
    );
  });
});

describe('correctEvidence', () => {
  it('edits content on submitted evidence without touching reviewStatus', () => {
    const { evidence, event } = correctEvidence(
      submittedEvidence(),
      'open',
      FACILITATOR,
      { correctionType: 'clerical', reason: 'Fixed typo.', title: 'People want more shade' },
      LATER,
    );
    expect(evidence.title).toBe('People want more shade');
    expect(evidence.reviewStatus).toBe('submitted');
    expect(evidence.version).toBe(3);
    expect(event.action).toBe('evidence.corrected');
    expect(event.metadata['correctionType']).toBe('clerical');
  });

  it('edits content on under_review evidence without touching reviewStatus', () => {
    const { evidence } = correctEvidence(
      underReviewEvidence(),
      'open',
      REVIEWER,
      {
        correctionType: 'substantive',
        reason: 'Reworded per source.',
        content: 'Updated content.',
      },
      LATER,
    );
    expect(evidence.content).toBe('Updated content.');
    expect(evidence.reviewStatus).toBe('under_review');
  });

  it('edits content on needs_clarification evidence without touching reviewStatus', () => {
    const needsClarification = markNeedsClarification(
      underReviewEvidence(),
      'open',
      REVIEWER,
      NOW,
    ).evidence;
    const { evidence } = correctEvidence(
      needsClarification,
      'open',
      FACILITATOR,
      {
        correctionType: 'participant_clarification',
        reason: 'Incorporated response.',
        content: 'Clarified.',
      },
      LATER,
    );
    expect(evidence.content).toBe('Clarified.');
    expect(evidence.reviewStatus).toBe('needs_clarification');
  });

  it('ATTACK — cannot be used to change reviewStatus', () => {
    const { evidence } = correctEvidence(
      submittedEvidence(),
      'open',
      FACILITATOR,
      { correctionType: 'clerical', reason: 'fix', title: 'x' },
      LATER,
    );
    expect(evidence.reviewStatus).toBe('submitted');
    expect(evidence.verificationStatus).toBe('unverified');
    expect(evidence.reviewDecisionReason).toBeNull();
  });

  it('ATTACK — rejects correcting a draft (must use updateEvidenceDraft instead)', () => {
    expect(() =>
      correctEvidence(
        draftEvidence(),
        'open',
        FACILITATOR,
        { correctionType: 'clerical', reason: 'fix', title: 'x' },
        LATER,
      ),
    ).toThrow(/cannot be corrected/i);
  });

  it('ATTACK — rejects correcting validated evidence', () => {
    const validated = validateEvidence(underReviewEvidence(), 'open', REVIEWER, null, NOW).evidence;
    expect(() =>
      correctEvidence(
        validated,
        'open',
        FACILITATOR,
        { correctionType: 'clerical', reason: 'fix', title: 'x' },
        LATER,
      ),
    ).toThrow(/cannot be corrected/i);
  });

  it('ATTACK — rejects correcting rejected evidence', () => {
    const rejected = rejectEvidence(underReviewEvidence(), 'open', REVIEWER, 'no', NOW).evidence;
    expect(() =>
      correctEvidence(
        rejected,
        'open',
        FACILITATOR,
        { correctionType: 'clerical', reason: 'fix', title: 'x' },
        LATER,
      ),
    ).toThrow(/cannot be corrected/i);
  });

  it('ATTACK — requires a reason', () => {
    expect(() =>
      correctEvidence(
        submittedEvidence(),
        'open',
        FACILITATOR,
        { correctionType: 'clerical', reason: '   ', title: 'x' },
        LATER,
      ),
    ).toThrow(/reason/i);
  });

  it('ATTACK — rejects a no-op correction', () => {
    expect(() =>
      correctEvidence(
        submittedEvidence(),
        'open',
        FACILITATOR,
        { correctionType: 'clerical', reason: 'fix' },
        LATER,
      ),
    ).toThrow(/at least one field/i);
  });

  it('reruns attribution compatibility when attribution fields change', () => {
    expect(() =>
      correctEvidence(
        submittedEvidence(),
        'open',
        FACILITATOR,
        {
          correctionType: 'substantive',
          reason: 'Attribute properly.',
          attributionMode: 'attributed',
        },
        LATER,
      ),
    ).toThrow(/requires a source participant/i);
  });
});

describe('derived review capability checks', () => {
  it('canBeginReview is true only for submitted evidence in a non-archived session', () => {
    expect(canBeginReview(submittedEvidence(), 'open')).toBe(true);
    expect(canBeginReview(draftEvidence(), 'open')).toBe(false);
    expect(canBeginReview(submittedEvidence(), 'archived')).toBe(false);
  });

  it('canDecideEvidence is true only for under_review evidence in a non-archived session', () => {
    expect(canDecideEvidence(underReviewEvidence(), 'open')).toBe(true);
    expect(canDecideEvidence(submittedEvidence(), 'open')).toBe(false);
    expect(canDecideEvidence(underReviewEvidence(), 'archived')).toBe(false);
  });

  it('canCorrectEvidence covers submitted, under_review and needs_clarification only', () => {
    expect(canCorrectEvidence(submittedEvidence(), 'open')).toBe(true);
    expect(canCorrectEvidence(underReviewEvidence(), 'open')).toBe(true);
    expect(
      canCorrectEvidence(
        markNeedsClarification(underReviewEvidence(), 'open', REVIEWER, NOW).evidence,
        'open',
      ),
    ).toBe(true);
    expect(canCorrectEvidence(draftEvidence(), 'open')).toBe(false);
    expect(
      canCorrectEvidence(
        validateEvidence(underReviewEvidence(), 'open', REVIEWER, null, NOW).evidence,
        'open',
      ),
    ).toBe(false);
  });
});
