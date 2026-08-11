import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import { toActorId, toCoDesignSessionId, toEvidenceId, toSessionSummaryId } from './ids.js';
import {
  beginSummaryProcessing,
  completeSummary,
  confirmSummary,
  editSummary,
  effectiveSummaryText,
  failSummary,
  requestSummary,
  retrySummary,
  type SessionSummary,
} from './session-summary.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};
const SYSTEM: Actor = {
  id: toActorId('12121212-1212-4212-8212-121212121212'),
  kind: 'system',
  displayName: 'Local summarisation',
};
const SESSION_ID = toCoDesignSessionId('22222222-2222-4222-8222-222222222222');
const SUMMARY_ID = toSessionSummaryId('44444444-4444-4444-8444-444444444444');
const EVIDENCE_ID = toEvidenceId('55555555-5555-4555-8555-555555555555');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function pending(): SessionSummary {
  return requestSummary({
    id: SUMMARY_ID,
    sessionId: SESSION_ID,
    sourceEvidenceIds: [EVIDENCE_ID],
    requestedBy: ACTOR,
    at: NOW,
  }).summary;
}

function processing(): SessionSummary {
  return beginSummaryProcessing(pending(), SYSTEM, NOW).summary;
}

function completed(): SessionSummary {
  return completeSummary(
    processing(),
    { text: 'The session covered X and Y.', model: 'ollama:qwen2.5:1.5b' },
    SYSTEM,
    NOW,
  ).summary;
}

describe('SessionSummary lifecycle', () => {
  it('starts pending with its source evidence recorded', () => {
    const summary = pending();
    expect(summary.status).toBe('pending');
    expect(summary.sourceEvidenceIds).toEqual([EVIDENCE_ID]);
  });

  it('moves pending -> processing -> completed', () => {
    const summary = completed();
    expect(summary.status).toBe('completed');
    expect(summary.generatedText).toBe('The session covered X and Y.');
  });

  it('moves processing -> failed, and failed -> pending on retry', () => {
    const failed = failSummary(processing(), 'local LLM unreachable', SYSTEM, NOW).summary;
    expect(failed.status).toBe('failed');

    const retried = retrySummary(failed, ACTOR, NOW).summary;
    expect(retried.status).toBe('pending');
    expect(retried.failureReason).toBeNull();
  });

  it('allows editing a completed, unconfirmed summary', () => {
    const edited = editSummary(completed(), 'A corrected summary.', ACTOR, NOW).summary;
    expect(edited.editedText).toBe('A corrected summary.');
    expect(effectiveSummaryText(edited)).toBe('A corrected summary.');
  });

  it('confirms a completed summary, then refuses further edits or a second confirm', () => {
    const confirmed = confirmSummary(completed(), ACTOR, NOW).summary;
    expect(confirmed.confirmed).toBe(true);
    expect(() => editSummary(confirmed, 'x', ACTOR, NOW)).toThrow(InvariantViolation);
    expect(() => confirmSummary(confirmed, ACTOR, NOW)).toThrow(InvariantViolation);
  });

  it('effectiveSummaryText falls back to the generated text before any edit', () => {
    expect(effectiveSummaryText(completed())).toBe('The session covered X and Y.');
  });
});
