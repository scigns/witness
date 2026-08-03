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
import type { AuditEventId } from './ids.js';

export const AUDIT_ACTIONS = [
  'record.captured',
  'record.submitted_for_review',
  'record.confirmed',
  'record.corrected',
  'record.rejected',
  'record.reopened',
  'organisation.created',
  'workspace.created',
  'user.created',
  'organisation_membership.created',
  'organisation_membership.state_changed',
  'workspace_membership.created',
  'workspace_membership.state_changed',
  'role_assignment.created',
  'role_assignment.changed',
  'role_assignment.removed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * What the audit event is about. The chain is scoped per (subjectType, subjectId)
 * pair — verifying "the audit trail for record X" and "the audit trail for
 * organisation Y" are two independent chains, not one global one, so that adding
 * a new subject type never requires renumbering or re-hashing an existing one.
 */
export const AUDIT_SUBJECT_TYPES = [
  'record',
  'organisation',
  'workspace',
  'user',
  'organisation_membership',
  'workspace_membership',
  'role_assignment',
] as const;
export type AuditSubjectType = (typeof AUDIT_SUBJECT_TYPES)[number];

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly subjectType: AuditSubjectType;
  /**
   * The branded ID of the subject, widened to `string`. A single field cannot be
   * typed as `RecordId | OrganisationId | ...` and still let this module stay
   * ignorant of every subject type that will ever exist — the branding is
   * re-applied by the caller, which already knows which subject type it has.
   */
  readonly subjectId: string;
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

/**
 * What the domain decided happened. The application layer turns this into a
 * persisted, hash-chained audit event (ADR-0003) — the domain itself never
 * touches an identifier, a clock or a hash function.
 */
export interface PendingAuditEvent {
  readonly action: AuditAction;
  readonly actor: Actor;
  readonly metadata: Readonly<Record<string, string>>;
}

/** Canonical serialisation — field order is fixed so hashes are reproducible. */
export function canonicalise(event: {
  id: AuditEventId;
  subjectType: AuditSubjectType;
  subjectId: string;
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
    event.subjectType,
    event.subjectId,
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
    subjectType: AuditSubjectType;
    subjectId: string;
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
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      action: input.action,
      actorId: input.actor.id,
      occurredAt: input.occurredAt,
      previousHash: input.previousHash,
      metadata,
    }),
  );

  return {
    id: input.id,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
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
        subjectType: event.subjectType,
        subjectId: event.subjectId,
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
