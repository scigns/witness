import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import { toActorId, toEvidenceAttachmentId, toEvidenceId, toTranscriptId } from './ids.js';
import {
  beginTranscriptionProcessing,
  completeTranscription,
  confirmTranscript,
  editTranscript,
  effectiveTranscriptText,
  failTranscription,
  requestTranscription,
  retryTranscription,
  type Transcript,
} from './transcript.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};
const SYSTEM: Actor = {
  id: toActorId('12121212-1212-4212-8212-121212121212'),
  kind: 'system',
  displayName: 'Local transcription',
};
const EVIDENCE_ID = toEvidenceId('22222222-2222-4222-8222-222222222222');
const ATTACHMENT_ID = toEvidenceAttachmentId('33333333-3333-4333-8333-333333333333');
const TRANSCRIPT_ID = toTranscriptId('44444444-4444-4444-8444-444444444444');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function pending(): Transcript {
  return requestTranscription({
    id: TRANSCRIPT_ID,
    evidenceId: EVIDENCE_ID,
    attachmentId: ATTACHMENT_ID,
    requestedBy: ACTOR,
    at: NOW,
  }).transcript;
}

function processing(): Transcript {
  return beginTranscriptionProcessing(pending(), SYSTEM, NOW).transcript;
}

function completed(): Transcript {
  return completeTranscription(
    processing(),
    {
      text: 'hello world',
      segments: [{ text: 'hello world', startMs: 0, endMs: 1000 }],
      model: 'whisper.cpp:base',
      language: 'en',
    },
    SYSTEM,
    NOW,
  ).transcript;
}

describe('Transcript lifecycle', () => {
  it('starts pending', () => {
    expect(pending().status).toBe('pending');
  });

  it('moves pending -> processing -> completed', () => {
    const transcript = completed();
    expect(transcript.status).toBe('completed');
    expect(transcript.generatedText).toBe('hello world');
    expect(transcript.model).toBe('whisper.cpp:base');
  });

  it('refuses to begin processing twice', () => {
    expect(() => beginTranscriptionProcessing(processing(), SYSTEM, NOW)).toThrow(
      InvariantViolation,
    );
  });

  it('moves processing -> failed, and failed -> pending on retry', () => {
    const failed = failTranscription(
      processing(),
      'ffmpeg exited with code 1',
      SYSTEM,
      NOW,
    ).transcript;
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('ffmpeg exited with code 1');

    const retried = retryTranscription(failed, ACTOR, NOW).transcript;
    expect(retried.status).toBe('pending');
    expect(retried.failureReason).toBeNull();
  });

  it('refuses to retry a transcript that has not failed', () => {
    expect(() => retryTranscription(pending(), ACTOR, NOW)).toThrow(InvariantViolation);
  });

  it('allows editing a completed, unconfirmed transcript', () => {
    const edited = editTranscript(completed(), 'hello, world.', ACTOR, NOW).transcript;
    expect(edited.editedText).toBe('hello, world.');
    expect(edited.generatedText).toBe('hello world');
    expect(effectiveTranscriptText(edited)).toBe('hello, world.');
  });

  it('refuses to edit before completion', () => {
    expect(() => editTranscript(pending(), 'x', ACTOR, NOW)).toThrow(InvariantViolation);
  });

  it('confirms a completed transcript, then refuses further edits or a second confirm', () => {
    const confirmed = confirmTranscript(completed(), ACTOR, NOW).transcript;
    expect(confirmed.confirmed).toBe(true);

    expect(() => editTranscript(confirmed, 'x', ACTOR, NOW)).toThrow(InvariantViolation);
    expect(() => confirmTranscript(confirmed, ACTOR, NOW)).toThrow(InvariantViolation);
  });

  it('effectiveTranscriptText falls back to the generated text before any edit', () => {
    expect(effectiveTranscriptText(completed())).toBe('hello world');
  });
});
