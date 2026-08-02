/**
 * Human review — the state machine that separates a candidate from a record.
 *
 * This is the smallest complete expression of principle P4. Material enters as a
 * candidate. It becomes institutional record only when a human says so. The
 * transition table below is the enforcement point, and it is in the domain layer
 * so that no adapter, API version or migration can route around it.
 *
 * `confirmed` and `corrected` are deliberately distinct terminal states. Both
 * mean "a human accepted this", but only the second means "a human had to change
 * it first". VISION.md tracks correction rate as a measure of whether extraction
 * is trustworthy — collapsing the two would destroy that signal, and the
 * distinction is free to keep now and impossible to reconstruct later.
 */

import { IllegalTransition } from './errors.js';

export const REVIEW_STATES = ['draft', 'in_review', 'confirmed', 'corrected', 'rejected'] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

/**
 * Permitted transitions.
 *
 * Reopening a confirmed record is allowed. Institutions revisit decisions, and a
 * memory system that refuses to acknowledge a correction is worse than one that
 * records the correction with its reasoning. Every reopen emits an audit event,
 * so the previous state is never lost — see `record.ts`.
 */
const TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = Object.freeze({
  draft: ['in_review'],
  in_review: ['confirmed', 'corrected', 'rejected'],
  confirmed: ['in_review'],
  corrected: ['in_review'],
  rejected: ['in_review'],
});

/** States in which the record counts as institutional record. */
const ACCEPTED: readonly ReviewState[] = ['confirmed', 'corrected'];

export function canTransition(from: ReviewState, to: ReviewState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: ReviewState, to: ReviewState): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransition(from, to);
  }
}

export function permittedTransitions(from: ReviewState): readonly ReviewState[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * Whether the record may be treated as institutional memory.
 *
 * Anything not accepted is a candidate, and a candidate must never be presented
 * to a user as established fact.
 */
export function isAccepted(state: ReviewState): boolean {
  return ACCEPTED.includes(state);
}
