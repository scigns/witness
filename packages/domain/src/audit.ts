/**
 * Audit events — append-only and tamper-evident (roadmap 3.7).
 *
 * Each event carries the hash of the one before it. Altering or deleting an event
 * breaks every subsequent hash, so tampering is detectable by recomputation
 * rather than by trusting the storage layer. That property matters because the
 * threat model includes an operator with database access — the institution
 * itself, under pressure, is a plausible adversary for a system whose job is
 * remembering what was decided.
 *
 * This is tamper-*evident*, not tamper-*proof*. An attacker who rewrites the
 * entire chain from the point of alteration produces a valid chain. Defeating
 * that needs external anchoring (published checkpoints), which is Phase 7 work
 * and is not claimed here.
 *
 * The hash function is injected. The domain must not import node:crypto — that
 * would put an infrastructure dependency in the pure layer and break ADR-0003.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { AuditEventId, RecordId } from './ids.js';

export const AUDIT_ACTIONS = [
  'record.captured',
  'record.submitted_for_review',
  'record.confirmed',
  'record.corrected',
  'record.rejected',
  'record.reopened',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly recordId: RecordId;
  readonly action: AuditAction;
  readonly actor: Actor;
  readonly occurredAt: Date;
  /** Hash of the preceding event; `null` only for the first event in the chain. */
  readonly previousHash: string | null;
  /** Hash over this event's content and `previousHash`. */
  readonly hash: string;
  /**
   * Non-sensitive context, e.g. `{ from: 'in_review', to: 'confirmed' }`.
   *
   * Never put record content here. The audit log answers "who did what, when",
   * not "what did it say" — and it is retained under a different policy from the
   * content, so content leaked into it would outlive its own retention rule.
   */
  readonly metadata: Readonly<Record<string, string>>;
}

/** Injected hash function. Implemented by an adapter (node:crypto in practice). */
export type HashFunction = (input: string) => string;

/** Canonical serialisation — field order is fixed so hashes are reproducible. */
export function canonicalise(event: {
  id: AuditEventId;
  recordId: RecordId;
  action: AuditAction;
  actorId: string;
  occurredAt: Date;
  previousHash: string | null;
  metadata: Record<string, string>;
}): string {
  const orderedMetadata = Object.keys(event.metadata)
    .sort()
    .map((key) => `${key}=${event.metadata[key] ?? ''}`)
    .join(',');

  return [
    event.id,
    event.recordId,
    event.action,
    event.actorId,
    event.occurredAt.toISOString(),
    event.previousHash ?? '',
    orderedMetadata,
  ].join('|');
}

export function createAuditEvent(
  input: {
    id: AuditEventId;
    recordId: RecordId;
    action: AuditAction;
    actor: Actor;
    occurredAt: Date;
    previousHash: string | null;
    metadata?: Record<string, string>;
  },
  hash: HashFunction,
): AuditEvent {
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new InvariantViolation('Audit event occurredAt is not a valid date.', 'INVALID_DATE');
  }

  const metadata = input.metadata ?? {};

  const computed = hash(
    canonicalise({
      id: input.id,
      recordId: input.recordId,
      action: input.action,
      actorId: input.actor.id,
      occurredAt: input.occurredAt,
      previousHash: input.previousHash,
      metadata,
    }),
  );

  return {
    id: input.id,
    recordId: input.recordId,
    action: input.action,
    actor: input.actor,
    occurredAt: input.occurredAt,
    previousHash: input.previousHash,
    hash: computed,
    metadata: Object.freeze({ ...metadata }),
  };
}

export interface ChainVerification {
  readonly valid: boolean;
  /** Index of the first event that fails verification, or `null` when valid. */
  readonly brokenAt: number | null;
  readonly reason: string | null;
}

/**
 * Recompute the chain and report the first break.
 *
 * Returns a result rather than throwing: a broken chain is a finding to be
 * reported and investigated, not an exception to be caught and swallowed.
 */
export function verifyChain(events: readonly AuditEvent[], hash: HashFunction): ChainVerification {
  let expectedPrevious: string | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) continue;

    if (event.previousHash !== expectedPrevious) {
      return {
        valid: false,
        brokenAt: index,
        reason:
          `Event ${index} expected previousHash '${expectedPrevious ?? 'null'}' ` +
          `but carries '${event.previousHash ?? 'null'}'. An event was inserted, removed or reordered.`,
      };
    }

    const recomputed = hash(
      canonicalise({
        id: event.id,
        recordId: event.recordId,
        action: event.action,
        actorId: event.actor.id,
        occurredAt: event.occurredAt,
        previousHash: event.previousHash,
        metadata: { ...event.metadata },
      }),
    );

    if (recomputed !== event.hash) {
      return {
        valid: false,
        brokenAt: index,
        reason: `Event ${index} hash does not match its content. The event was altered after it was written.`,
      };
    }

    expectedPrevious = event.hash;
  }

  return { valid: true, brokenAt: null, reason: null };
}
