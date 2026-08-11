/**
 * SessionSummary — an AI-drafted summary of one co-design session's
 * confirmed content (submitted evidence and completed transcripts).
 *
 * Same state machine and same generated/edited-text split as `transcript.ts`
 * — see that file's header for the reasoning, which applies unchanged here.
 * The one addition: `sourceEvidenceIds`, the provenance list of which
 * evidence actually fed the summary (`EvidenceService`/`SessionSummaryService`
 * assembles the source text; this aggregate only records which pieces it
 * came from, for later citation).
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { CoDesignSessionId, EvidenceId, SessionSummaryId } from './ids.js';

export const SUMMARY_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

const TEXT_MAX = 50_000;

export interface SessionSummary {
  readonly id: SessionSummaryId;
  readonly sessionId: CoDesignSessionId;
  readonly status: SummaryStatus;
  readonly sourceEvidenceIds: readonly EvidenceId[];
  readonly generatedText: string | null;
  readonly editedText: string | null;
  readonly model: string | null;
  readonly confirmed: boolean;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface SessionSummaryOutcome {
  readonly summary: SessionSummary;
  readonly event: PendingAuditEvent;
}

function assertStatus(summary: SessionSummary, expected: SummaryStatus): void {
  if (summary.status !== expected) {
    throw new InvariantViolation(
      `SessionSummary '${summary.id}' is '${summary.status}', not '${expected}'.`,
      'INVALID_SUMMARY_STATUS',
    );
  }
}

export function requestSummary(input: {
  id: SessionSummaryId;
  sessionId: CoDesignSessionId;
  sourceEvidenceIds: readonly EvidenceId[];
  requestedBy: Actor;
  at: Date;
}): SessionSummaryOutcome {
  const summary: SessionSummary = {
    id: input.id,
    sessionId: input.sessionId,
    status: 'pending',
    sourceEvidenceIds: input.sourceEvidenceIds,
    generatedText: null,
    editedText: null,
    model: null,
    confirmed: false,
    failureReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    summary,
    event: {
      action: 'session_summary.requested',
      actor: input.requestedBy,
      metadata: {
        sessionId: summary.sessionId,
        sourceCount: String(summary.sourceEvidenceIds.length),
      },
    },
  };
}

export function beginSummaryProcessing(
  summary: SessionSummary,
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  assertStatus(summary, 'pending');

  return {
    summary: { ...summary, status: 'processing', updatedAt: at, version: summary.version + 1 },
    event: {
      action: 'session_summary.processing_started',
      actor,
      metadata: { sessionId: summary.sessionId },
    },
  };
}

export function completeSummary(
  summary: SessionSummary,
  result: { text: string; model: string },
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  assertStatus(summary, 'processing');

  const text = result.text.trim();
  if (text.length === 0) {
    throw new InvariantViolation('A summary must not be empty.', 'EMPTY_SUMMARY');
  }
  if (text.length > TEXT_MAX) {
    throw new InvariantViolation(
      `A summary must be ${TEXT_MAX} characters or fewer, received ${text.length}.`,
      'SUMMARY_TOO_LONG',
    );
  }

  return {
    summary: {
      ...summary,
      status: 'completed',
      generatedText: text,
      model: result.model,
      failureReason: null,
      updatedAt: at,
      version: summary.version + 1,
    },
    event: {
      action: 'session_summary.completed',
      actor,
      metadata: {
        sessionId: summary.sessionId,
        model: result.model,
        characters: String(text.length),
      },
    },
  };
}

export function failSummary(
  summary: SessionSummary,
  reason: string,
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  assertStatus(summary, 'processing');

  return {
    summary: {
      ...summary,
      status: 'failed',
      failureReason: reason,
      updatedAt: at,
      version: summary.version + 1,
    },
    event: {
      action: 'session_summary.failed',
      actor,
      metadata: { sessionId: summary.sessionId, reason },
    },
  };
}

export function retrySummary(
  summary: SessionSummary,
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  assertStatus(summary, 'failed');

  return {
    summary: {
      ...summary,
      status: 'pending',
      failureReason: null,
      updatedAt: at,
      version: summary.version + 1,
    },
    event: {
      action: 'session_summary.retried',
      actor,
      metadata: { sessionId: summary.sessionId },
    },
  };
}

export function editSummary(
  summary: SessionSummary,
  editedText: string,
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  if (summary.status !== 'completed') {
    throw new InvariantViolation(
      `SessionSummary '${summary.id}' cannot be edited from status '${summary.status}'.`,
      'INVALID_SUMMARY_STATUS',
    );
  }
  if (summary.confirmed) {
    throw new InvariantViolation(
      `SessionSummary '${summary.id}' is confirmed and can no longer be edited.`,
      'SUMMARY_CONFIRMED',
    );
  }

  const trimmed = editedText.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('Edited summary text must not be empty.', 'EMPTY_SUMMARY');
  }
  if (trimmed.length > TEXT_MAX) {
    throw new InvariantViolation(
      `A summary must be ${TEXT_MAX} characters or fewer, received ${trimmed.length}.`,
      'SUMMARY_TOO_LONG',
    );
  }

  return {
    summary: { ...summary, editedText: trimmed, updatedAt: at, version: summary.version + 1 },
    event: {
      action: 'session_summary.edited',
      actor,
      metadata: { sessionId: summary.sessionId },
    },
  };
}

export function confirmSummary(
  summary: SessionSummary,
  actor: Actor,
  at: Date,
): SessionSummaryOutcome {
  if (summary.status !== 'completed') {
    throw new InvariantViolation(
      `SessionSummary '${summary.id}' cannot be confirmed from status '${summary.status}'.`,
      'INVALID_SUMMARY_STATUS',
    );
  }
  if (summary.confirmed) {
    throw new InvariantViolation(
      `SessionSummary '${summary.id}' is already confirmed.`,
      'SUMMARY_CONFIRMED',
    );
  }

  return {
    summary: { ...summary, confirmed: true, updatedAt: at, version: summary.version + 1 },
    event: {
      action: 'session_summary.confirmed',
      actor,
      metadata: { sessionId: summary.sessionId },
    },
  };
}

/** What a reader should treat as "the summary" — the human correction if one exists. */
export function effectiveSummaryText(summary: SessionSummary): string | null {
  return summary.editedText ?? summary.generatedText;
}
