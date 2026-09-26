/**
 * Pure state-transition rules for the live workshop participant companion
 * (Phase 6, Track E). Factored out of `app/capture/[sessionId]/page.tsx` so
 * the product invariants that page exists to enforce — a receipt is never
 * shown before the backend confirms it, the next-action choice is never
 * skipped, a survey never interrupts an active round — can be tested
 * directly, the same way `survey-suppression.ts` already is.
 */

import type { ParticipantResponseType } from '@witness/contracts';

export type SubmitPhase = 'idle' | 'sending' | 'received' | 'saved_offline' | 'failed';
export type PostSubmitChoice = 'waiting' | 'done' | null;

/**
 * True once the backend (or, for an offline save, this device's own durable
 * queue) has actually accepted the contribution — never merely because the
 * recorder finished encoding a blob. This is the "Received" moment.
 */
export function isReceived(phase: SubmitPhase): phase is 'received' | 'saved_offline' {
  return phase === 'received' || phase === 'saved_offline';
}

/**
 * The deliberate three-way choice ("Add another thought" / "Wait for the
 * next question" / "I'm done for now") only appears once a contribution has
 * actually landed, and only until the participant has made that choice —
 * never re-offered underneath the "waiting" or "done" states it produces.
 */
export function shouldShowNextActionChoices(phase: SubmitPhase, choice: PostSubmitChoice): boolean {
  return isReceived(phase) && choice === null;
}

/**
 * The session-end experience appears either because the session itself
 * closed, or because the participant explicitly chose to stop for now —
 * these are the only two doors into it. A survey/testimonial ask is only
 * ever appropriate behind this same gate (Track E invariant J).
 */
export function shouldShowSessionEndState(
  sessionStatus: string,
  choice: PostSubmitChoice,
): boolean {
  return sessionStatus === 'closed' || choice === 'done';
}

/**
 * "Wait for the next question" should resolve itself the moment a new
 * prompt actually becomes current — the participant asked to be told, not
 * to keep checking. `previousPromptId`/`nextPromptId` are `null` for "no
 * current prompt", so two consecutive `null`s (still no prompt) never
 * triggers a return.
 */
export function shouldReturnToPromptAfterWaiting(
  choice: PostSubmitChoice,
  previousPromptId: string | null,
  nextPromptId: string | null,
): boolean {
  return choice === 'waiting' && nextPromptId !== null && nextPromptId !== previousPromptId;
}

const RESPONSE_TYPES: readonly ParticipantResponseType[] = [
  'reflects',
  'needs_nuance',
  'missing_context',
  'sees_differently',
];

/** The room's total response count for one featured insight — tally values only, never a participant list. */
export function sumResponseTally(tally: Record<ParticipantResponseType, number>): number {
  return RESPONSE_TYPES.reduce((total, type) => total + tally[type], 0);
}
