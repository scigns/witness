import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toSessionParticipantId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  assertAttributionCompatibility,
  canEditEvidence,
  canSubmitEvidence,
  canWithdrawEvidence,
  captureEvidence,
  requiredConsentCategoryForCapture,
  submitEvidence,
  updateEvidenceDraft,
  withdrawEvidence,
  type Evidence,
} from './evidence.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const PARTICIPANT = toSessionParticipantId('55555555-5555-4555-8555-555555555555');
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
    capturedBy: HUMAN,
    at: NOW,
  };
}

function draftEvidence(): Evidence {
  return captureEvidence('open', baseInput()).evidence;
}

describe('captureEvidence', () => {
  it('creates a draft by default', () => {
    const { evidence, event } = captureEvidence('open', baseInput());
    expect(evidence.reviewStatus).toBe('draft');
    expect(evidence.verificationStatus).toBe('unverified');
    expect(evidence.version).toBe(1);
    expect(event.action).toBe('evidence.captured');
  });

  it('quick-capture submits immediately', () => {
    const { evidence, event } = captureEvidence('open', {
      ...baseInput(),
      submitImmediately: true,
    });
    expect(evidence.reviewStatus).toBe('submitted');
    expect(event.action).toBe('evidence.quick_captured');
  });

  it('ATTACK — rejects capture while the session is not open', () => {
    for (const status of ['draft', 'scheduled', 'closed', 'archived'] as const) {
      expect(() => captureEvidence(status, baseInput())).toThrow(/session is open/i);
    }
  });

  it('rejects an empty title or content', () => {
    expect(() => captureEvidence('open', { ...baseInput(), title: '   ' })).toThrow(/title/i);
    expect(() => captureEvidence('open', { ...baseInput(), content: '' })).toThrow(/content/i);
  });

  it('accepts a free-form evidence type outside the suggested list', () => {
    const { evidence } = captureEvidence('open', {
      ...baseInput(),
      evidenceType: 'site-specific-custom-type',
    });
    expect(evidence.evidenceType).toBe('site-specific-custom-type');
  });

  it('deduplicates and trims tags', () => {
    const { evidence } = captureEvidence('open', {
      ...baseInput(),
      tags: [' access ', 'access', 'shade'],
    });
    expect(evidence.tags).toEqual(['access', 'shade']);
  });

  it('rejects a negative session offset', () => {
    expect(() => captureEvidence('open', { ...baseInput(), sessionOffsetSeconds: -5 })).toThrow(
      /negative/i,
    );
  });
});

describe('assertAttributionCompatibility', () => {
  it('allows a sourceless mode with no participant', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'facilitator_observation',
        evidenceType: 'observation',
        sourceParticipantId: null,
        participantIdentityMode: null,
      }),
    ).not.toThrow();
  });

  it('ATTACK — rejects a sourceless mode carrying a participant', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'facilitator_observation',
        evidenceType: 'observation',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'named',
      }),
    ).toThrow(/cannot name a source participant/i);
  });

  it('ATTACK — rejects a participant-backed mode with no participant', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'attributed',
        evidenceType: 'quote',
        sourceParticipantId: null,
        participantIdentityMode: null,
      }),
    ).toThrow(/requires a source participant/i);
  });

  it('ATTACK — rejects a facilitator_note attributed to a participant', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'attributed',
        evidenceType: 'facilitator_note',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'named',
      }),
    ).toThrow(/facilitator note cannot be attributed/i);
  });

  it('requires the identity mode when a participant is named', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'attributed',
        evidenceType: 'quote',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: null,
      }),
    ).toThrow(/identity mode was not supplied/i);
  });

  it('ATTACK — rejects attributing an anonymous participant', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'attributed',
        evidenceType: 'quote',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'anonymous',
      }),
    ).toThrow(/anonymous participant/i);
  });

  it('allows an anonymous participant recorded anonymously', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'anonymous',
        evidenceType: 'quote',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'anonymous',
      }),
    ).not.toThrow();
  });

  it('ATTACK — rejects attributing a pseudonymous participant to their real identity', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'attributed',
        evidenceType: 'quote',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'pseudonymous',
      }),
    ).toThrow(/pseudonymous participant/i);
  });

  it('allows a pseudonymous participant recorded pseudonymously', () => {
    expect(() =>
      assertAttributionCompatibility({
        attributionMode: 'pseudonymous',
        evidenceType: 'quote',
        sourceParticipantId: PARTICIPANT,
        participantIdentityMode: 'pseudonymous',
      }),
    ).not.toThrow();
  });

  it('allows a named participant to be recorded any of the three participant-backed modes', () => {
    for (const attributionMode of ['attributed', 'pseudonymous', 'anonymous'] as const) {
      expect(() =>
        assertAttributionCompatibility({
          attributionMode,
          evidenceType: 'quote',
          sourceParticipantId: PARTICIPANT,
          participantIdentityMode: 'named',
        }),
      ).not.toThrow();
    }
  });
});

describe('requiredConsentCategoryForCapture', () => {
  it('is null for sourceless modes', () => {
    expect(
      requiredConsentCategoryForCapture({
        attributionMode: 'facilitator_observation',
        evidenceType: 'quote',
      }),
    ).toBeNull();
  });

  it('is null for non-quotation evidence types', () => {
    expect(
      requiredConsentCategoryForCapture({ attributionMode: 'attributed', evidenceType: 'idea' }),
    ).toBeNull();
  });

  it('requires attributed_quotation consent for attributed quotes', () => {
    expect(
      requiredConsentCategoryForCapture({ attributionMode: 'attributed', evidenceType: 'quote' }),
    ).toBe('attributed_quotation');
  });

  it('requires anonymous_quotation consent for anonymous quotes', () => {
    expect(
      requiredConsentCategoryForCapture({ attributionMode: 'anonymous', evidenceType: 'quote' }),
    ).toBe('anonymous_quotation');
  });
});

describe('updateEvidenceDraft', () => {
  it('edits a draft and bumps its version', () => {
    const { evidence, event } = updateEvidenceDraft(
      draftEvidence(),
      'open',
      HUMAN,
      { title: 'Updated title' },
      LATER,
    );
    expect(evidence.title).toBe('Updated title');
    expect(evidence.version).toBe(2);
    expect(event.action).toBe('evidence.updated');
  });

  it('ATTACK — rejects editing evidence that has already been submitted', () => {
    const submitted = submitEvidence(draftEvidence(), 'open', HUMAN, LATER).evidence;
    expect(() => updateEvidenceDraft(submitted, 'open', HUMAN, { title: 'x' }, LATER)).toThrow(
      /only a draft can be edited/i,
    );
  });

  it('rejects a no-op update', () => {
    expect(() => updateEvidenceDraft(draftEvidence(), 'open', HUMAN, {}, LATER)).toThrow(
      /change at least one field/i,
    );
  });

  it('ATTACK — re-validates attribution compatibility against the new combination', () => {
    expect(() =>
      updateEvidenceDraft(
        draftEvidence(),
        'open',
        HUMAN,
        { attributionMode: 'attributed', sourceParticipantId: null },
        LATER,
      ),
    ).toThrow(/requires a source participant/i);
  });
});

describe('submitEvidence', () => {
  it('transitions draft to submitted', () => {
    const { evidence, event } = submitEvidence(draftEvidence(), 'open', HUMAN, LATER);
    expect(evidence.reviewStatus).toBe('submitted');
    expect(event.action).toBe('evidence.submitted');
  });

  it('permits submitting while the session is closed', () => {
    const { evidence } = submitEvidence(draftEvidence(), 'closed', HUMAN, LATER);
    expect(evidence.reviewStatus).toBe('submitted');
  });

  it('ATTACK — rejects submitting while the session is archived', () => {
    expect(() => submitEvidence(draftEvidence(), 'archived', HUMAN, LATER)).toThrow(/read-only/i);
  });

  it('ATTACK — rejects submitting non-draft evidence', () => {
    const submitted = submitEvidence(draftEvidence(), 'open', HUMAN, LATER).evidence;
    expect(() => submitEvidence(submitted, 'open', HUMAN, LATER)).toThrow(
      /only a draft can be submitted/i,
    );
  });
});

describe('withdrawEvidence', () => {
  it('withdraws evidence with a reason', () => {
    const { evidence, event } = withdrawEvidence(
      draftEvidence(),
      'open',
      HUMAN,
      'Captured in error.',
      LATER,
    );
    expect(evidence.reviewStatus).toBe('withdrawn');
    expect(evidence.withdrawnAt).toEqual(LATER);
    expect(event.metadata['reason']).toBe('Captured in error.');
  });

  it('permits withdrawal while the session is closed', () => {
    const { evidence } = withdrawEvidence(draftEvidence(), 'closed', HUMAN, null, LATER);
    expect(evidence.reviewStatus).toBe('withdrawn');
  });

  it('ATTACK — rejects withdrawal while the session is archived', () => {
    expect(() => withdrawEvidence(draftEvidence(), 'archived', HUMAN, null, LATER)).toThrow(
      /read-only/i,
    );
  });

  it('ATTACK — rejects withdrawing already-withdrawn evidence', () => {
    const withdrawn = withdrawEvidence(draftEvidence(), 'open', HUMAN, null, LATER).evidence;
    expect(() => withdrawEvidence(withdrawn, 'open', HUMAN, null, LATER)).toThrow(
      /already been withdrawn/i,
    );
  });

  it('there is no restore function — a fresh capture is required, not an undo', () => {
    const withdrawn = withdrawEvidence(draftEvidence(), 'open', HUMAN, null, LATER).evidence;
    expect(withdrawn.reviewStatus).toBe('withdrawn');
    expect(Object.keys(withdrawn)).not.toContain('restore');
  });
});

describe('derived capability checks', () => {
  it('canEditEvidence is true only for an open session and a draft', () => {
    expect(canEditEvidence(draftEvidence(), 'open')).toBe(true);
    expect(canEditEvidence(draftEvidence(), 'closed')).toBe(false);
    const submitted = submitEvidence(draftEvidence(), 'open', HUMAN, LATER).evidence;
    expect(canEditEvidence(submitted, 'open')).toBe(false);
  });

  it('canSubmitEvidence is true for open or closed sessions with a draft', () => {
    expect(canSubmitEvidence(draftEvidence(), 'open')).toBe(true);
    expect(canSubmitEvidence(draftEvidence(), 'closed')).toBe(true);
    expect(canSubmitEvidence(draftEvidence(), 'archived')).toBe(false);
  });

  it('canWithdrawEvidence is true unless archived or already withdrawn', () => {
    expect(canWithdrawEvidence(draftEvidence(), 'open')).toBe(true);
    expect(canWithdrawEvidence(draftEvidence(), 'archived')).toBe(false);
    const withdrawn = withdrawEvidence(draftEvidence(), 'open', HUMAN, null, LATER).evidence;
    expect(canWithdrawEvidence(withdrawn, 'open')).toBe(false);
  });
});
