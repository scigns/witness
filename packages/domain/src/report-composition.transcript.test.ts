import { describe, expect, it } from 'vitest';

import {
  projectTranscriptForReport,
  type EvidenceForReport,
  type SourceConsentAnswers,
  type TranscriptForReport,
} from './report-composition.js';

const TRANSCRIPT: TranscriptForReport = {
  evidenceId: '11111111-1111-4111-8111-111111111111',
  evidenceTitle: 'Recording of the intake discussion',
  text: 'The group agreed the new intake process should launch next month.',
};

function evidence(overrides: Partial<EvidenceForReport> = {}): EvidenceForReport {
  return {
    id: TRANSCRIPT.evidenceId,
    title: TRANSCRIPT.evidenceTitle,
    content: 'placeholder — the transcript carries the real text',
    evidenceType: 'quote',
    attributionMode: 'attributed',
    hasParticipantSource: true,
    pseudonym: null,
    ...overrides,
  };
}

const GRANTED: SourceConsentAnswers = {
  withdrawn: false,
  mayUseForAudience: true,
  mayQuoteAttributed: true,
  mayQuoteAnonymously: true,
};

describe('projectTranscriptForReport', () => {
  it('carries the transcript text, not the evidence content, when quotable', () => {
    const result = projectTranscriptForReport(evidence(), TRANSCRIPT, GRANTED);

    expect(result?.content).toBe(TRANSCRIPT.text);
    expect(result?.attribution).toBe('named_participant');
    expect(result?.quotable).toBe(true);
  });

  it('withholds content when the evidence is not quotable, mirroring projectEvidenceForReport', () => {
    // Falling back from attributed to anonymous quotation needs its own
    // refusal too, or the redaction has nothing left to withhold.
    const noQuote: SourceConsentAnswers = {
      ...GRANTED,
      mayQuoteAttributed: false,
      mayQuoteAnonymously: false,
    };

    const result = projectTranscriptForReport(evidence(), TRANSCRIPT, noQuote);

    expect(result?.quotable).toBe(false);
    expect(result?.content).toBeUndefined();
  });

  it('refuses entirely when the participant withdrew', () => {
    const withdrawn: SourceConsentAnswers = { ...GRANTED, withdrawn: true };

    expect(projectTranscriptForReport(evidence(), TRANSCRIPT, withdrawn)).toBeNull();
  });

  it('is quotable with no consent needed for non-participant evidence', () => {
    const result = projectTranscriptForReport(
      evidence({ hasParticipantSource: false, attributionMode: 'facilitator_observation' }),
      TRANSCRIPT,
      null,
    );

    expect(result?.quotable).toBe(true);
    expect(result?.content).toBe(TRANSCRIPT.text);
    expect(result?.attribution).toBe('facilitator_observation');
  });
});
