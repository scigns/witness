/**
 * InstitutionalRecord — the aggregate root of the Developer Preview.
 *
 * A record is a piece of institutional memory: something said, decided or
 * committed to, captured from a source, traceable to whoever captured it, and
 * carrying a review state that says whether a human has accepted it.
 *
 * Design notes worth keeping:
 *
 * 1. **Immutable.** Every operation returns a new record. Mutation in place makes
 *    the audit trail a matter of developer diligence; returning a new value makes
 *    the previous state impossible to lose by accident.
 *
 * 2. **Operations return an intent, not an audit event.** Creating an audit event
 *    needs an identifier, a clock and a hash function — all infrastructure. The
 *    domain returns what happened and lets the application layer record it
 *    (ADR-0003). The application layer cannot forget: the return type makes the
 *    event impossible to discard silently.
 *
 * 3. **No consent enforcement yet.** P2 requires no processing without a consent
 *    grant. The consent service is Phase 3. `provenance.consentGrantId` is
 *    threaded through so the shape exists, but this preview does not claim to
 *    enforce consent, and says so rather than implying otherwise.
 */

import { HumanConfirmationRequired, InvariantViolation } from './errors.js';
import { assertTransition, isAccepted, type ReviewState } from './review.js';
import { isHuman, type Actor } from './actor.js';
import type { AuditAction } from './audit.js';
import type { Provenance } from './provenance.js';
import type { RecordId } from './ids.js';

/** The maximum length of a record title. Long enough for a real agenda item. */
const TITLE_MAX = 200;

export interface InstitutionalRecord {
  readonly id: RecordId;
  readonly title: string;
  readonly body: string;
  readonly provenance: Provenance;
  readonly reviewState: ReviewState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * What the domain decided happened. The application layer turns this into a
 * persisted, hash-chained audit event.
 */
export interface PendingAuditEvent {
  readonly action: AuditAction;
  readonly actor: Actor;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface RecordOutcome {
  readonly record: InstitutionalRecord;
  readonly event: PendingAuditEvent;
}

function assertTitle(title: string): string {
  const trimmed = title.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A record must have a title. Untitled records are unfindable, and an unfindable record is not memory.',
      'TITLE_REQUIRED',
    );
  }

  if (trimmed.length > TITLE_MAX) {
    throw new InvariantViolation(
      `A record title must be ${TITLE_MAX} characters or fewer, received ${trimmed.length}.`,
      'TITLE_TOO_LONG',
    );
  }

  return trimmed;
}

function assertBody(body: string): string {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation('A record must have content.', 'BODY_REQUIRED');
  }

  return trimmed;
}

/** Capture a new record. It always starts as a draft — never as accepted. */
export function captureRecord(input: {
  id: RecordId;
  title: string;
  body: string;
  provenance: Provenance;
  capturedAt: Date;
}): RecordOutcome {
  const record: InstitutionalRecord = {
    id: input.id,
    title: assertTitle(input.title),
    body: assertBody(input.body),
    provenance: input.provenance,
    reviewState: 'draft',
    createdAt: input.capturedAt,
    updatedAt: input.capturedAt,
  };

  return {
    record,
    event: {
      action: 'record.captured',
      actor: input.provenance.capturedBy,
      metadata: {
        sourceKind: input.provenance.source.kind,
        sourceLabel: input.provenance.source.label,
      },
    },
  };
}

function transition(
  record: InstitutionalRecord,
  to: ReviewState,
  actor: Actor,
  action: AuditAction,
  at: Date,
  extraMetadata: Record<string, string> = {},
  body?: string,
): RecordOutcome {
  assertTransition(record.reviewState, to);

  const next: InstitutionalRecord = {
    ...record,
    reviewState: to,
    updatedAt: at,
    ...(body !== undefined ? { body: assertBody(body) } : {}),
  };

  return {
    record: next,
    event: {
      action,
      actor,
      metadata: { from: record.reviewState, to, ...extraMetadata },
    },
  };
}

export function submitForReview(
  record: InstitutionalRecord,
  actor: Actor,
  at: Date,
): RecordOutcome {
  return transition(record, 'in_review', actor, 'record.submitted_for_review', at);
}

/**
 * Accept the record into institutional memory.
 *
 * Principle P4 is enforced here: a model or system actor cannot confirm. This
 * check lives in the domain and not in a controller because a controller is one
 * of several ways to reach this code, and the guarantee has to hold for all of
 * them.
 */
export function confirmRecord(record: InstitutionalRecord, actor: Actor, at: Date): RecordOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  return transition(record, 'confirmed', actor, 'record.confirmed', at);
}

/**
 * Accept the record after changing its content.
 *
 * Tracked separately from confirmation because the correction rate is how we
 * learn whether extraction is trustworthy (VISION.md).
 */
export function correctRecord(
  record: InstitutionalRecord,
  actor: Actor,
  correctedBody: string,
  at: Date,
): RecordOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  const trimmed = assertBody(correctedBody);

  if (trimmed === record.body) {
    throw new InvariantViolation(
      'A correction must change the content. Use confirm when the content is already right — ' +
        'recording an unchanged correction would corrupt the correction-rate signal.',
      'CORRECTION_WITHOUT_CHANGE',
    );
  }

  return transition(
    record,
    'corrected',
    actor,
    'record.corrected',
    at,
    { previousLength: String(record.body.length), correctedLength: String(trimmed.length) },
    trimmed,
  );
}

export function rejectRecord(
  record: InstitutionalRecord,
  actor: Actor,
  reason: string,
  at: Date,
): RecordOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  const trimmed = reason.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A rejection must state a reason. "No" without a reason is not reviewable and teaches nobody anything.',
      'REJECTION_REASON_REQUIRED',
    );
  }

  return transition(record, 'rejected', actor, 'record.rejected', at, { reason: trimmed });
}

/** Reopen an accepted or rejected record for further review. */
export function reopenRecord(
  record: InstitutionalRecord,
  actor: Actor,
  reason: string,
  at: Date,
): RecordOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  const trimmed = reason.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'Reopening an accepted record must state a reason — this reverses an institutional decision.',
      'REOPEN_REASON_REQUIRED',
    );
  }

  return transition(record, 'in_review', actor, 'record.reopened', at, { reason: trimmed });
}

/** Whether this record may be presented as institutional memory rather than a candidate. */
export function isInstitutionalRecord(record: InstitutionalRecord): boolean {
  return isAccepted(record.reviewState);
}
