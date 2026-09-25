/**
 * Agreement — the commercial term an organisation's paid access is
 * authorised under (Phase 5, Workstream 2.4).
 *
 * Deliberately minimal: a reference to an agreement that exists outside
 * Witness (a signed contract, a purchase order, a documented pilot
 * arrangement — Witness does not adjudicate which), its term, and a
 * renewal chain. This is not a contract-management suite: no documents,
 * signatories, or procurement workflow are modelled here (see
 * docs/commercial/COMMERCIAL_ARCHITECTURE_ASSESSMENT.md for the fuller
 * vision this deliberately does not build yet). It exists so "when does
 * this organisation need to be renewed, and under what authority is their
 * paid access justified" has a first-class, auditable answer instead of
 * living only in an operator's memory or an external spreadsheet.
 *
 * `EXPIRED` is deliberately not a stored status: whether a term has lapsed
 * is a function of `termEnd` and the current time, not a fact that needs
 * its own background job to keep in sync. `effectiveAgreementStatus`
 * computes it at read time; the persisted `status` only ever changes
 * through an explicit renewal or termination.
 */

import { IllegalTransition, InvariantViolation } from './errors.js';
import type { AgreementId, OrganisationId } from './ids.js';

export const AGREEMENT_STATUSES = ['ACTIVE', 'TERMINATED', 'SUPERSEDED'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const EFFECTIVE_AGREEMENT_STATUSES = [...AGREEMENT_STATUSES, 'EXPIRED'] as const;
export type EffectiveAgreementStatus = (typeof EFFECTIVE_AGREEMENT_STATUSES)[number];

export interface Agreement {
  readonly id: AgreementId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly reference: string;
  readonly status: AgreementStatus;
  readonly termStart: Date;
  readonly termEnd: Date | null;
  readonly notes: string | null;
  readonly previousAgreementId: AgreementId | null;
  readonly statusChangedAt: Date;
  readonly statusReason: string | null;
}

function assertNonEmpty(value: string, field: string, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvariantViolation(`${field} is required.`, code);
  return trimmed;
}

function assertSafeReference(value: string, field: string, code: string): string {
  const reference = assertNonEmpty(value, field, code);
  const hasControlCharacter = Array.from(reference).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (reference.length > 200 || hasControlCharacter) {
    throw new InvariantViolation(
      `${field} must be at most 200 characters and contain no control characters.`,
      code,
    );
  }
  return reference;
}

function assertSafeNotes(value: string): string {
  const trimmed = value.trim();
  const hasControlCharacter = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint < 32 && codePoint !== 10) || codePoint === 127;
  });
  if (trimmed.length > 2000 || hasControlCharacter) {
    throw new InvariantViolation(
      'Agreement notes must be at most 2000 characters and contain no control characters other than newlines.',
      'AGREEMENT_NOTES_INVALID',
    );
  }
  return trimmed;
}

function cloneDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new InvariantViolation('Commercial timestamp must be valid.', 'INVALID_TIMESTAMP');
  }
  return new Date(value.getTime());
}

function cloneNotes(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const notes = assertSafeNotes(value);
  return notes.length === 0 ? null : notes;
}

function assertTerm(termStart: Date, termEnd: Date | null): void {
  if (termEnd !== null && termEnd <= termStart) {
    throw new InvariantViolation(
      'An agreement term must end after it starts.',
      'INVALID_AGREEMENT_TERM',
    );
  }
}

export function createAgreement(input: {
  readonly id: AgreementId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly reference: string;
  readonly termStart: Date;
  readonly termEnd?: Date | null;
  readonly notes?: string | null;
  readonly at: Date;
}): Agreement {
  const termStart = cloneDate(input.termStart);
  const termEnd =
    input.termEnd === null || input.termEnd === undefined ? null : cloneDate(input.termEnd);
  assertTerm(termStart, termEnd);

  return Object.freeze({
    id: input.id,
    organisationId: input.organisationId,
    billingAccountId: assertNonEmpty(
      input.billingAccountId,
      'Billing account ID',
      'BILLING_ACCOUNT_REQUIRED',
    ),
    reference: assertSafeReference(
      input.reference,
      'Agreement reference',
      'AGREEMENT_REFERENCE_REQUIRED',
    ),
    status: 'ACTIVE',
    termStart,
    termEnd,
    notes: cloneNotes(input.notes),
    previousAgreementId: null,
    statusChangedAt: cloneDate(input.at),
    statusReason: null,
  });
}

/**
 * Renews an agreement: the previous agreement is marked `SUPERSEDED` and a
 * new one is created in its place, chained via `previousAgreementId`. The
 * new term must not start before the previous one did — renewing
 * "backwards" would make the term history impossible to read as a
 * timeline. A `TERMINATED` agreement cannot be renewed; record a fresh
 * agreement instead, since termination is a deliberate end, not a lapse.
 */
export function renewAgreement(
  previous: Agreement,
  input: {
    readonly id: AgreementId;
    readonly reference: string;
    readonly termStart: Date;
    readonly termEnd?: Date | null;
    readonly notes?: string | null;
    readonly at: Date;
  },
): { readonly superseded: Agreement; readonly renewed: Agreement } {
  if (previous.status !== 'ACTIVE') {
    throw new IllegalTransition(previous.status, 'SUPERSEDED');
  }

  const termStart = cloneDate(input.termStart);
  const termEnd =
    input.termEnd === null || input.termEnd === undefined ? null : cloneDate(input.termEnd);
  assertTerm(termStart, termEnd);
  if (termStart < previous.termStart) {
    throw new InvariantViolation(
      'A renewal cannot start before the agreement it renews.',
      'RENEWAL_PRECEDES_PREVIOUS_TERM',
    );
  }

  const at = cloneDate(input.at);
  const superseded: Agreement = Object.freeze({
    ...previous,
    status: 'SUPERSEDED',
    statusChangedAt: at,
    statusReason: 'Superseded by renewal.',
  });

  const renewed: Agreement = Object.freeze({
    id: input.id,
    organisationId: previous.organisationId,
    billingAccountId: previous.billingAccountId,
    reference: assertSafeReference(
      input.reference,
      'Agreement reference',
      'AGREEMENT_REFERENCE_REQUIRED',
    ),
    status: 'ACTIVE',
    termStart,
    termEnd,
    notes: cloneNotes(input.notes),
    previousAgreementId: previous.id,
    statusChangedAt: at,
    statusReason: null,
  });

  return { superseded, renewed };
}

export function terminateAgreement(agreement: Agreement, at: Date, reason: string): Agreement {
  if (agreement.status !== 'ACTIVE') {
    throw new IllegalTransition(agreement.status, 'TERMINATED');
  }
  return Object.freeze({
    ...agreement,
    status: 'TERMINATED',
    statusChangedAt: cloneDate(at),
    statusReason: assertNonEmpty(reason, 'Termination reason', 'AGREEMENT_REASON_REQUIRED'),
  });
}

/** The status as of `at`, folding in a lapsed term without needing a stored transition. */
export function effectiveAgreementStatus(agreement: Agreement, at: Date): EffectiveAgreementStatus {
  if (agreement.status === 'ACTIVE' && agreement.termEnd !== null && agreement.termEnd <= at) {
    return 'EXPIRED';
  }
  return agreement.status;
}
