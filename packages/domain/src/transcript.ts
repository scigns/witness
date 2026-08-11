/**
 * Transcript — the speech-to-text output for one piece of evidence's audio
 * attachment.
 *
 * A state machine, not a single write: `pending` (queued) → `processing`
 * (a local model is running) → `completed` | `failed`, with `failed` able to
 * retry back to `pending`. The application layer drives these transitions
 * because running the model is I/O this package must not perform
 * (ADR-0003) — see `services/api-gateway/src/transcription/`.
 *
 * `generatedText` is what the model produced and is never overwritten —
 * `editedText` is where a human correction lives, kept as a genuinely
 * separate field rather than replacing the original, so neither version is
 * ever lost. Editing is only possible once `completed`, and stops once
 * `confirmed` — the same "AI output does not become institutional record by
 * itself" boundary `outcomes.ts` draws around decisions and commitments.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EvidenceAttachmentId, EvidenceId, TranscriptId } from './ids.js';

export const TRANSCRIPT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

const TEXT_MAX = 200_000;

export interface TranscriptSegment {
  readonly text: string;
  /** Milliseconds from the start of the recording, when the model reports them. */
  readonly startMs: number | null;
  readonly endMs: number | null;
}

export interface Transcript {
  readonly id: TranscriptId;
  readonly evidenceId: EvidenceId;
  readonly attachmentId: EvidenceAttachmentId;
  readonly status: TranscriptStatus;
  readonly generatedText: string | null;
  readonly editedText: string | null;
  readonly segments: readonly TranscriptSegment[];
  /** Provenance — which model produced `generatedText`. Null until `completed`. */
  readonly model: string | null;
  readonly language: string | null;
  readonly confirmed: boolean;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface TranscriptOutcome {
  readonly transcript: Transcript;
  readonly event: PendingAuditEvent;
}

function assertStatus(transcript: Transcript, expected: TranscriptStatus): void {
  if (transcript.status !== expected) {
    throw new InvariantViolation(
      `Transcript '${transcript.id}' is '${transcript.status}', not '${expected}'.`,
      'INVALID_TRANSCRIPT_STATUS',
    );
  }
}

export function requestTranscription(input: {
  id: TranscriptId;
  evidenceId: EvidenceId;
  attachmentId: EvidenceAttachmentId;
  requestedBy: Actor;
  at: Date;
}): TranscriptOutcome {
  const transcript: Transcript = {
    id: input.id,
    evidenceId: input.evidenceId,
    attachmentId: input.attachmentId,
    status: 'pending',
    generatedText: null,
    editedText: null,
    segments: [],
    model: null,
    language: null,
    confirmed: false,
    failureReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    transcript,
    event: {
      action: 'transcript.requested',
      actor: input.requestedBy,
      metadata: { evidenceId: transcript.evidenceId, attachmentId: transcript.attachmentId },
    },
  };
}

export function beginTranscriptionProcessing(
  transcript: Transcript,
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  assertStatus(transcript, 'pending');

  return {
    transcript: {
      ...transcript,
      status: 'processing',
      updatedAt: at,
      version: transcript.version + 1,
    },
    event: {
      action: 'transcript.processing_started',
      actor,
      metadata: { evidenceId: transcript.evidenceId },
    },
  };
}

export function completeTranscription(
  transcript: Transcript,
  result: {
    text: string;
    segments: readonly TranscriptSegment[];
    model: string;
    language: string | null;
  },
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  assertStatus(transcript, 'processing');

  const text = result.text.trim();
  if (text.length > TEXT_MAX) {
    throw new InvariantViolation(
      `A transcript must be ${TEXT_MAX} characters or fewer, received ${text.length}.`,
      'TRANSCRIPT_TOO_LONG',
    );
  }

  return {
    transcript: {
      ...transcript,
      status: 'completed',
      generatedText: text,
      segments: result.segments,
      model: result.model,
      language: result.language,
      failureReason: null,
      updatedAt: at,
      version: transcript.version + 1,
    },
    event: {
      action: 'transcript.completed',
      actor,
      metadata: {
        evidenceId: transcript.evidenceId,
        model: result.model,
        language: result.language ?? '',
        characters: String(text.length),
      },
    },
  };
}

export function failTranscription(
  transcript: Transcript,
  reason: string,
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  assertStatus(transcript, 'processing');

  return {
    transcript: {
      ...transcript,
      status: 'failed',
      failureReason: reason,
      updatedAt: at,
      version: transcript.version + 1,
    },
    event: {
      action: 'transcript.failed',
      actor,
      metadata: { evidenceId: transcript.evidenceId, reason },
    },
  };
}

export function retryTranscription(
  transcript: Transcript,
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  assertStatus(transcript, 'failed');

  return {
    transcript: {
      ...transcript,
      status: 'pending',
      failureReason: null,
      updatedAt: at,
      version: transcript.version + 1,
    },
    event: {
      action: 'transcript.retried',
      actor,
      metadata: { evidenceId: transcript.evidenceId },
    },
  };
}

export function editTranscript(
  transcript: Transcript,
  editedText: string,
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  if (transcript.status !== 'completed') {
    throw new InvariantViolation(
      `Transcript '${transcript.id}' cannot be edited from status '${transcript.status}'.`,
      'INVALID_TRANSCRIPT_STATUS',
    );
  }
  if (transcript.confirmed) {
    throw new InvariantViolation(
      `Transcript '${transcript.id}' is confirmed and can no longer be edited.`,
      'TRANSCRIPT_CONFIRMED',
    );
  }

  const trimmed = editedText.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('Edited transcript text must not be empty.', 'EMPTY_TRANSCRIPT');
  }
  if (trimmed.length > TEXT_MAX) {
    throw new InvariantViolation(
      `A transcript must be ${TEXT_MAX} characters or fewer, received ${trimmed.length}.`,
      'TRANSCRIPT_TOO_LONG',
    );
  }

  return {
    transcript: {
      ...transcript,
      editedText: trimmed,
      updatedAt: at,
      version: transcript.version + 1,
    },
    event: {
      action: 'transcript.edited',
      actor,
      metadata: { evidenceId: transcript.evidenceId },
    },
  };
}

export function confirmTranscript(
  transcript: Transcript,
  actor: Actor,
  at: Date,
): TranscriptOutcome {
  if (transcript.status !== 'completed') {
    throw new InvariantViolation(
      `Transcript '${transcript.id}' cannot be confirmed from status '${transcript.status}'.`,
      'INVALID_TRANSCRIPT_STATUS',
    );
  }
  if (transcript.confirmed) {
    throw new InvariantViolation(
      `Transcript '${transcript.id}' is already confirmed.`,
      'TRANSCRIPT_CONFIRMED',
    );
  }

  return {
    transcript: { ...transcript, confirmed: true, updatedAt: at, version: transcript.version + 1 },
    event: {
      action: 'transcript.confirmed',
      actor,
      metadata: { evidenceId: transcript.evidenceId },
    },
  };
}

/** What a reader should actually treat as "the transcript" — the human correction if one exists. */
export function effectiveTranscriptText(transcript: Transcript): string | null {
  return transcript.editedText ?? transcript.generatedText;
}
