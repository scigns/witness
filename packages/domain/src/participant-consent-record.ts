/**
 * ParticipantConsentRecord (BUILD_ROADMAP.md Milestone 4, Consent
 * Management) — one participant's category-level consent decisions,
 * captured against a specific, immutable `ConsentTemplate` version.
 *
 * Consent decisions are never overwritten. `captureParticipantConsent`
 * always creates a brand new record; there is no "edit consent record"
 * function. Amending a participant's consent (they change their mind about
 * a category, short of withdrawing entirely) is two coordinated writes the
 * application layer performs together: `supersedeConsentRecord` marks the
 * OLD record superseded, and a fresh `captureParticipantConsent` call
 * creates the new one with `amendsRecordId` pointing back at it — the old
 * record's original decisions remain in the database exactly as captured,
 * permanently.
 *
 * `capturedBy` is a transient input, not a persisted field — same
 * convention `co-design-session.ts`'s `createdBy` established: it names
 * the audit event's actor and is never stored on the aggregate itself.
 * This milestone captures consent through a facilitator recording a
 * participant's in-person/verbal or written decision, not through the
 * participant signing into Witness themselves — there is no participant
 * self-service portal (the same limitation named in Milestone 3), so "the
 * participant provides their own consent" is realised as a facilitator (or
 * other authorised role) entering what the participant told them, which is
 * also the realistic capture mode for most co-design workshops.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  OrganisationId,
  ParticipantConsentRecordId,
  ConsentTemplateId,
  SessionParticipantId,
  WorkspaceId,
} from './ids.js';

const CAPTURE_METHOD_MAX = 100;
const LANGUAGE_MAX = 50;
const WITHDRAWAL_REASON_MAX = 2000;
const ACKNOWLEDGEMENT_REFERENCE_MAX = 300;

/**
 * Per-category decisions actually captured, once a record exists. Whether
 * a *participant* currently counts as `not_requested`/`pending` is a
 * question about the *absence* of a record and is answered one level up —
 * see `consent-decision.ts` — this type only describes a record that
 * exists.
 */
export const PARTICIPANT_CONSENT_RECORD_STATUSES = [
  'granted',
  'partially_granted',
  'refused',
  'withdrawn',
  'expired',
  'superseded',
] as const;
export type ParticipantConsentRecordStatus = (typeof PARTICIPANT_CONSENT_RECORD_STATUSES)[number];

export interface ConsentCategoryDecision {
  readonly category: string;
  readonly granted: boolean;
}

export interface ParticipantConsentRecord {
  readonly id: ParticipantConsentRecordId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly participantId: SessionParticipantId;
  readonly consentTemplateId: ConsentTemplateId;
  readonly templateVersion: number;
  readonly categoryDecisions: readonly ConsentCategoryDecision[];
  readonly captureMethod: string;
  readonly language: string | null;
  readonly capturedAt: Date;
  readonly expiresAt: Date | null;
  readonly amendsRecordId: ParticipantConsentRecordId | null;
  readonly supersededByRecordId: ParticipantConsentRecordId | null;
  readonly withdrawnAt: Date | null;
  /** Restricted — the API layer only includes this for a caller holding `participant_consent:manage_restricted`. */
  readonly withdrawalReason: string | null;
  readonly acknowledgementReference: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on withdrawal or superseding. */
  readonly version: number;
}

export interface ParticipantConsentRecordOutcome {
  readonly record: ParticipantConsentRecord;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`A consent record must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A consent record ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertOptional(
  value: string | null | undefined,
  max: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `Field exceeds the maximum of ${max} characters, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

/**
 * At least one decision, no duplicate categories, and every decision must
 * name a category actually required or offered by the session's consent
 * configuration — a decision about a category nobody asked for is not
 * meaningful consent, it is unvalidated input.
 */
function assertCategoryDecisions(
  decisions: readonly ConsentCategoryDecision[],
  requiredCategories: readonly string[],
  optionalCategories: readonly string[],
): readonly ConsentCategoryDecision[] {
  if (decisions.length === 0) {
    throw new InvariantViolation(
      'A consent record must capture at least one category decision.',
      'CATEGORY_DECISIONS_REQUIRED',
    );
  }

  const known = new Set([...requiredCategories, ...optionalCategories]);
  const seen = new Set<string>();
  const normalised: ConsentCategoryDecision[] = [];

  for (const decision of decisions) {
    const category = decision.category.trim();
    if (!known.has(category)) {
      throw new InvariantViolation(
        `Category '${category}' is not part of this session's consent configuration.`,
        'CATEGORY_NOT_CONFIGURED',
      );
    }
    if (seen.has(category)) {
      throw new InvariantViolation(
        `Category '${category}' is decided more than once in the same record.`,
        'DUPLICATE_CATEGORY_DECISION',
      );
    }
    seen.add(category);
    normalised.push({ category, granted: decision.granted });
  }

  return Object.freeze(normalised);
}

/**
 * A record's status given the category decisions it actually captured.
 * `refused` if any required category is refused or was never decided
 * (fail closed — an undecided required category is not consent);
 * `partially_granted` if every required category is granted but at least
 * one optional category is refused or undecided; `granted` only if every
 * required AND every optional category is granted. `withdrawn`/`expired`/
 * `superseded` are checked first and short-circuit the category
 * arithmetic entirely, because a withdrawn or superseded record's
 * original decisions no longer describe the participant's current
 * position regardless of what they were.
 */
export function participantConsentRecordStatus(
  record: ParticipantConsentRecord,
  requiredCategories: readonly string[],
  now: Date,
): ParticipantConsentRecordStatus {
  if (record.withdrawnAt !== null) return 'withdrawn';
  if (record.supersededByRecordId !== null) return 'superseded';
  if (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime()) return 'expired';

  const decided = new Map(record.categoryDecisions.map((d) => [d.category, d.granted]));

  const requiredGranted = requiredCategories.every((category) => decided.get(category) === true);
  if (!requiredGranted) return 'refused';

  const allGranted = [...decided.values()].every((granted) => granted);
  return allGranted ? 'granted' : 'partially_granted';
}

export interface CaptureParticipantConsentInput {
  id: ParticipantConsentRecordId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  participantId: SessionParticipantId;
  consentTemplateId: ConsentTemplateId;
  templateVersion: number;
  categoryDecisions: readonly ConsentCategoryDecision[];
  requiredCategories: readonly string[];
  optionalCategories: readonly string[];
  captureMethod: string;
  language?: string | null | undefined;
  expiresAt?: Date | null | undefined;
  amendsRecordId?: ParticipantConsentRecordId | null | undefined;
  acknowledgementReference?: string | null | undefined;
  capturedBy: Actor;
  at: Date;
}

/**
 * Capture a participant's consent decisions. Always creates a brand new
 * record — see the file header for why there is no "edit" function.
 */
export function captureParticipantConsent(
  input: CaptureParticipantConsentInput,
): ParticipantConsentRecordOutcome {
  if (
    input.expiresAt !== undefined &&
    input.expiresAt !== null &&
    Number.isNaN(input.expiresAt.getTime())
  ) {
    throw new InvariantViolation(
      'A consent record expiresAt is not a valid date.',
      'INVALID_EXPIRES_AT',
    );
  }

  const categoryDecisions = assertCategoryDecisions(
    input.categoryDecisions,
    input.requiredCategories,
    input.optionalCategories,
  );

  const record: ParticipantConsentRecord = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    participantId: input.participantId,
    consentTemplateId: input.consentTemplateId,
    templateVersion: input.templateVersion,
    categoryDecisions,
    captureMethod: assertNonEmpty(
      input.captureMethod,
      'capture method',
      CAPTURE_METHOD_MAX,
      'CAPTURE_METHOD_REQUIRED',
    ),
    language: assertOptional(input.language, LANGUAGE_MAX, 'LANGUAGE'),
    capturedAt: input.at,
    expiresAt: input.expiresAt ?? null,
    amendsRecordId: input.amendsRecordId ?? null,
    supersededByRecordId: null,
    withdrawnAt: null,
    withdrawalReason: null,
    acknowledgementReference: assertOptional(
      input.acknowledgementReference,
      ACKNOWLEDGEMENT_REFERENCE_MAX,
      'ACKNOWLEDGEMENT_REFERENCE',
    ),
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  const status = participantConsentRecordStatus(record, input.requiredCategories, input.at);

  return {
    record,
    event: {
      action: 'participant_consent_record.captured',
      actor: input.capturedBy,
      metadata: {
        sessionId: record.sessionId,
        participantId: record.participantId,
        consentTemplateId: record.consentTemplateId,
        templateVersion: String(record.templateVersion),
        status,
        amendsRecordId: record.amendsRecordId ?? '',
      },
    },
  };
}

/**
 * Mark a record superseded because a newer one now represents the
 * participant's position. Called alongside a `captureParticipantConsent`
 * call for the replacement record — the two are applied together by the
 * service layer, matching `changeSessionFacilitator`/`updateSessionDetails`
 * being combined by `SessionsService.update` (BUILD_ROADMAP.md Milestone 2).
 */
export function supersedeConsentRecord(
  record: ParticipantConsentRecord,
  supersededByRecordId: ParticipantConsentRecordId,
  actor: Actor,
  at: Date,
): ParticipantConsentRecordOutcome {
  if (record.withdrawnAt !== null) {
    throw new InvariantViolation(
      'A withdrawn consent record cannot be superseded.',
      'ALREADY_WITHDRAWN',
    );
  }
  if (record.supersededByRecordId !== null) {
    throw new InvariantViolation(
      'This consent record has already been superseded.',
      'ALREADY_SUPERSEDED',
    );
  }

  const next: ParticipantConsentRecord = {
    ...record,
    supersededByRecordId,
    updatedAt: at,
    version: record.version + 1,
  };

  return {
    record: next,
    event: {
      action: 'participant_consent_record.superseded',
      actor,
      metadata: { supersededByRecordId },
    },
  };
}

/**
 * Withdraw a previously captured consent record. Unlike
 * `withdrawParticipant`/`restoreParticipant` (`session-participant.ts`),
 * there is no restore for consent — re-granting after withdrawal is a new
 * `captureParticipantConsent` call, not an undo, because "I withdrew, then
 * changed my mind again" is itself a fact the audit trail must preserve as
 * a distinct event, not erase by reverting to the prior state.
 */
export function withdrawParticipantConsent(
  record: ParticipantConsentRecord,
  actor: Actor,
  reason: string | null,
  at: Date,
): ParticipantConsentRecordOutcome {
  if (record.withdrawnAt !== null) {
    throw new InvariantViolation(
      'This consent record has already been withdrawn.',
      'ALREADY_WITHDRAWN',
    );
  }

  const next: ParticipantConsentRecord = {
    ...record,
    withdrawnAt: at,
    withdrawalReason: assertOptional(reason, WITHDRAWAL_REASON_MAX, 'WITHDRAWAL_REASON'),
    updatedAt: at,
    version: record.version + 1,
  };

  return {
    record: next,
    event: {
      action: 'participant_consent_record.withdrawn',
      actor,
      metadata: next.withdrawalReason === null ? {} : { reason: next.withdrawalReason },
    },
  };
}
