/**
 * SessionParticipant (BUILD_ROADMAP.md Milestone 3, Participant Management) —
 * who is part of a co-design session, and how much of who they are is
 * recorded and shown.
 *
 * Same shape as `co-design-session.ts`: immutable, mutation returns a new
 * value plus a `PendingAuditEvent`, the application layer supplies the
 * identifier, clock and persistence (ADR-0003). `organisationId`/
 * `workspaceId`/`sessionId` are trusted as already-verified by the caller,
 * same convention as `CoDesignSession.organisationId`/`workspaceId`.
 *
 * A participant is not required to hold a Witness user account
 * (`linkedUserId` is optional and independent of `identityMode`) — a
 * facilitator regularly convenes community members who will never sign in.
 * `identityMode` and "registered vs non-registered" are deliberately
 * orthogonal: a registered user (`linkedUserId` set) can still participate
 * pseudonymously, and a non-registered participant can still be named.
 *
 * Anonymous participation must not create fake personal details (the
 * milestone's own words) — `addParticipant` enforces this by construction:
 * an `anonymous` participant's identifying fields are forced to `null`/a
 * fixed generic label regardless of what the caller passed in, and it may
 * never carry a `linkedUserId` (linking a real account to an "anonymous"
 * record would contradict the word). Pseudonymous participation is
 * different: the system MAY retain a `linkedUserId` internally (so an
 * organisation can, say, contact a pseudonymous contributor through their
 * registered account), but that link is treated as restricted — never
 * returned by an ordinary read, only by a caller holding the
 * `participant:manage_restricted` permission. Enforcing that split is the
 * API layer's job (`participants.service.ts`), because it requires an
 * authorisation decision the domain is not allowed to make (ADR-0003) — this
 * module only guarantees the data anonymous participants carry is never
 * identifying in the first place.
 *
 * `participantType` is a free-form, organisation-supplied string, same
 * reasoning as `CoDesignSession.sessionType`: "community representative",
 * "interpreter", and "note-taker" are not a closed set an engineering change
 * should gate. It is explicitly NOT a system authorisation role — see
 * `packages/domain/src/role.ts` for that.
 *
 * `consentStatusSummary` mirrors `CoDesignSession.consentConfigurationState`:
 * stored, defaulted to `'not_configured'` at creation, no mutator here. That
 * is a deliberate, named gap — Milestone 4 (Consent) owns writing it.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import type {
  CoDesignSessionId,
  OrganisationId,
  SessionParticipantId,
  UserId,
  WorkspaceId,
} from './ids.js';

const DISPLAY_NAME_MAX = 200;
const PREFERRED_NAME_MAX = 200;
const PRONOUNS_MAX = 50;
const AFFILIATION_MAX = 300;
const PARTICIPANT_TYPE_MAX = 100;
const LANGUAGE_PREFERENCE_MAX = 50;
const ACCESSIBILITY_REQUIREMENTS_MAX = 2000;
const FACILITATOR_NOTES_MAX = 5000;
const WITHDRAWAL_REASON_MAX = 2000;

/** Forced display name for every anonymous participant — never user-supplied. */
export const ANONYMOUS_DISPLAY_NAME = 'Anonymous participant';

export const PARTICIPANT_IDENTITY_MODES = ['named', 'pseudonymous', 'anonymous'] as const;
export type ParticipantIdentityMode = (typeof PARTICIPANT_IDENTITY_MODES)[number];

export const PARTICIPANT_IDENTITY_VISIBILITIES = [
  'visible_to_all_participants',
  'facilitators_only',
] as const;
export type ParticipantIdentityVisibility = (typeof PARTICIPANT_IDENTITY_VISIBILITIES)[number];

export const PARTICIPATION_MODES = [
  'in_person',
  'online',
  'hybrid',
  'asynchronous',
  'proxy',
  'other',
] as const;
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

export const PARTICIPANT_INVITATION_STATUSES = [
  'not_invited',
  'invited',
  'accepted',
  'declined',
  'cancelled',
] as const;
export type ParticipantInvitationStatus = (typeof PARTICIPANT_INVITATION_STATUSES)[number];

export const PARTICIPANT_ATTENDANCE_STATUSES = [
  'expected',
  'present',
  'absent',
  'partially_attended',
  'left_early',
] as const;
export type ParticipantAttendanceStatus = (typeof PARTICIPANT_ATTENDANCE_STATUSES)[number];

/**
 * Milestone 4 (Consent) will replace this with a real, category-level
 * summary computed from `ParticipantConsentRecord`. Until then there is
 * exactly one value — no mutator in this module sets anything else.
 */
export const PARTICIPANT_CONSENT_STATUS_SUMMARIES = ['not_configured'] as const;
export type ParticipantConsentStatusSummary = (typeof PARTICIPANT_CONSENT_STATUS_SUMMARIES)[number];

/**
 * Invitation transitions. `declined`/`cancelled` can be re-invited —
 * unlike `MembershipState`'s terminal `revoked`, declining or cancelling one
 * invitation does not end a person's relationship to a session the way
 * revoking membership ends it to an organisation.
 */
const INVITATION_TRANSITIONS: Readonly<
  Record<ParticipantInvitationStatus, readonly ParticipantInvitationStatus[]>
> = Object.freeze({
  not_invited: ['invited'],
  invited: ['accepted', 'declined', 'cancelled'],
  accepted: ['cancelled'],
  declined: ['invited'],
  cancelled: ['invited'],
});

export function canTransitionInvitation(
  from: ParticipantInvitationStatus,
  to: ParticipantInvitationStatus,
): boolean {
  return INVITATION_TRANSITIONS[from].includes(to);
}

export function permittedInvitationTransitions(
  from: ParticipantInvitationStatus,
): readonly ParticipantInvitationStatus[] {
  return INVITATION_TRANSITIONS[from];
}

/**
 * Attendance transitions. Deliberately permissive both ways between
 * `expected`/`present`/`absent`/`partially_attended` — a facilitator
 * correcting a mistaken attendance mark after the fact is a routine
 * administrative act, not an institutional decision requiring the
 * `reopenSession`-style human-actor-and-reason guard. `left_early` (present
 * for part of the session, then gone, without returning) is reachable from
 * and correctable back to any of the other four for the same reason.
 *
 * Deliberately named `left_early`, not `withdrawn`: this is attendance
 * bookkeeping for one occurrence of the session, a different concept from
 * `withdrawParticipant`/`SessionParticipant.withdrawnAt` below, which removes
 * the participant from the session's roster entirely. The two must never
 * share a word — a caller reading `attendanceStatus` and `withdrawn` off the
 * same response needs them to answer two different questions, not
 * (dis)agree about one.
 */
const ATTENDANCE_TRANSITIONS: Readonly<
  Record<ParticipantAttendanceStatus, readonly ParticipantAttendanceStatus[]>
> = Object.freeze({
  expected: ['present', 'absent', 'partially_attended', 'left_early'],
  present: ['absent', 'partially_attended', 'left_early'],
  absent: ['present', 'partially_attended', 'left_early'],
  partially_attended: ['present', 'absent', 'left_early'],
  left_early: ['present', 'absent', 'partially_attended'],
});

export function canTransitionAttendance(
  from: ParticipantAttendanceStatus,
  to: ParticipantAttendanceStatus,
): boolean {
  return ATTENDANCE_TRANSITIONS[from].includes(to);
}

export function permittedAttendanceTransitions(
  from: ParticipantAttendanceStatus,
): readonly ParticipantAttendanceStatus[] {
  return ATTENDANCE_TRANSITIONS[from];
}

export interface SessionParticipant {
  readonly id: SessionParticipantId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly linkedUserId: UserId | null;
  readonly displayName: string;
  readonly preferredName: string | null;
  readonly pronouns: string | null;
  readonly affiliation: string | null;
  readonly participantType: string;
  readonly participationMode: ParticipationMode;
  readonly identityMode: ParticipantIdentityMode;
  readonly identityVisibility: ParticipantIdentityVisibility;
  readonly languagePreference: string | null;
  readonly accessibilityRequirements: string | null;
  readonly invitationStatus: ParticipantInvitationStatus;
  readonly attendanceStatus: ParticipantAttendanceStatus;
  readonly consentStatusSummary: ParticipantConsentStatusSummary;
  /** Visible only to a caller holding `participant:manage_restricted`. */
  readonly facilitatorNotes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly withdrawnAt: Date | null;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface SessionParticipantOutcome {
  readonly participant: SessionParticipant;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(`A participant must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A participant ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
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
 * Session states that permit adding a participant or making an ordinary
 * detail change — `draft`, `scheduled` and `open` (a facilitator registering
 * a walk-in participant during a live session is a realistic need the
 * milestone's floor rules do not forbid: "Draft and Scheduled sessions may
 * add and update participants" states a minimum, not a ceiling, and "Open
 * sessions may record attendance and limited participant updates" does not
 * exclude adding one). `closed` and `archived` reject ordinary participant
 * changes — closed matches the milestone's explicit requirement, archived
 * matches every other aggregate's read-only-when-archived rule.
 */
function assertParticipantsMutable(sessionStatus: SessionStatus): void {
  if (sessionStatus === 'closed' || sessionStatus === 'archived') {
    throw new InvariantViolation(
      `Cannot add or update a participant while the session is '${sessionStatus}'.`,
      'SESSION_NOT_MUTABLE_FOR_PARTICIPANTS',
    );
  }
}

/**
 * Attendance is recordable once a session has a real occurrence to attend —
 * `scheduled`, `open` or `closed` (marking final attendance after a session
 * wraps up is routine). Not `draft` (nothing to attend yet) and not
 * `archived` (read-only).
 */
function assertAttendanceRecordable(sessionStatus: SessionStatus): void {
  if (sessionStatus === 'draft' || sessionStatus === 'archived') {
    throw new InvariantViolation(
      `Cannot record attendance while the session is '${sessionStatus}'.`,
      'SESSION_NOT_OPEN_FOR_ATTENDANCE',
    );
  }
}

function assertNotArchived(sessionStatus: SessionStatus): void {
  if (sessionStatus === 'archived') {
    throw new InvariantViolation(
      'An archived session is read-only — its participants cannot be changed.',
      'SESSION_ARCHIVED',
    );
  }
}

export interface AddParticipantInput {
  id: SessionParticipantId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  linkedUserId?: UserId | null | undefined;
  displayName?: string | undefined;
  preferredName?: string | null | undefined;
  pronouns?: string | null | undefined;
  affiliation?: string | null | undefined;
  participantType: string;
  participationMode: ParticipationMode;
  identityMode: ParticipantIdentityMode;
  identityVisibility?: ParticipantIdentityVisibility | undefined;
  languagePreference?: string | null | undefined;
  accessibilityRequirements?: string | null | undefined;
  addedBy: Actor;
  at: Date;
}

/**
 * Add a participant to a session.
 *
 * `displayName` is required for `named` and `pseudonymous` participants (a
 * real name or a chosen pseudonym respectively) but ignored — forced to
 * `ANONYMOUS_DISPLAY_NAME` — for `anonymous` ones, along with
 * `preferredName`/`pronouns`/`affiliation`, which are cleared regardless of
 * what the caller passed. `linkedUserId` on an `anonymous` participant is
 * rejected outright: linking a real account would make the record
 * re-identifiable, which is exactly what "anonymous" promises not to happen.
 *
 * Least privilege (Constitution, Authority and Access): the application
 * layer is expected to gate this behind a `participant:create` check before
 * calling in, the same way session creation gates `session:create`.
 */
export function addParticipant(
  sessionStatus: SessionStatus,
  input: AddParticipantInput,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  if (input.identityMode === 'anonymous' && input.linkedUserId != null) {
    throw new InvariantViolation(
      'An anonymous participant cannot be linked to a registered user account.',
      'ANONYMOUS_CANNOT_BE_LINKED',
    );
  }

  const isAnonymous = input.identityMode === 'anonymous';

  const displayName = isAnonymous
    ? ANONYMOUS_DISPLAY_NAME
    : assertNonEmpty(
        input.displayName ?? '',
        'display name',
        DISPLAY_NAME_MAX,
        'DISPLAY_NAME_REQUIRED',
      );

  const participant: SessionParticipant = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    linkedUserId: isAnonymous ? null : (input.linkedUserId ?? null),
    displayName,
    preferredName: isAnonymous
      ? null
      : assertOptional(input.preferredName, PREFERRED_NAME_MAX, 'PREFERRED_NAME'),
    pronouns: isAnonymous ? null : assertOptional(input.pronouns, PRONOUNS_MAX, 'PRONOUNS'),
    affiliation: isAnonymous
      ? null
      : assertOptional(input.affiliation, AFFILIATION_MAX, 'AFFILIATION'),
    participantType: assertNonEmpty(
      input.participantType,
      'participant type',
      PARTICIPANT_TYPE_MAX,
      'PARTICIPANT_TYPE_REQUIRED',
    ),
    participationMode: input.participationMode,
    identityMode: input.identityMode,
    identityVisibility: input.identityVisibility ?? 'facilitators_only',
    languagePreference: assertOptional(
      input.languagePreference,
      LANGUAGE_PREFERENCE_MAX,
      'LANGUAGE_PREFERENCE',
    ),
    accessibilityRequirements: assertOptional(
      input.accessibilityRequirements,
      ACCESSIBILITY_REQUIREMENTS_MAX,
      'ACCESSIBILITY_REQUIREMENTS',
    ),
    invitationStatus: 'not_invited',
    attendanceStatus: 'expected',
    consentStatusSummary: 'not_configured',
    facilitatorNotes: null,
    createdAt: input.at,
    updatedAt: input.at,
    withdrawnAt: null,
    version: 1,
  };

  return {
    participant,
    event: {
      action: 'session_participant.added',
      actor: input.addedBy,
      metadata: {
        sessionId: participant.sessionId,
        identityMode: participant.identityMode,
        participantType: participant.participantType,
      },
    },
  };
}

export interface UpdateParticipantDetailsPatch {
  preferredName?: string | null | undefined;
  pronouns?: string | null | undefined;
  affiliation?: string | null | undefined;
  participantType?: string | undefined;
  participationMode?: ParticipationMode | undefined;
  languagePreference?: string | null | undefined;
  accessibilityRequirements?: string | null | undefined;
  /**
   * `displayName` may only be changed for `named`/`pseudonymous`
   * participants — see `updateParticipantDetails`.
   */
  displayName?: string | undefined;
}

/**
 * Update a participant's descriptive fields. Rejected once the session is
 * `closed` or `archived` — see `assertParticipantsMutable`.
 *
 * Rejects an attempt to set `displayName` on an `anonymous` participant:
 * that field is permanently `ANONYMOUS_DISPLAY_NAME` for the record's life,
 * the same way `identityMode` itself has no mutator (changing *how*
 * identifying a participant's record is meant to be is a withdraw-and-re-add
 * decision, not an edit).
 */
export function updateParticipantDetails(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateParticipantDetailsPatch,
  at: Date,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  const changedFields: string[] = [];
  const updates: { -readonly [K in keyof SessionParticipant]?: SessionParticipant[K] } = {};

  if (patch.displayName !== undefined) {
    if (participant.identityMode === 'anonymous') {
      throw new InvariantViolation(
        'An anonymous participant does not have an editable display name.',
        'ANONYMOUS_DISPLAY_NAME_FIXED',
      );
    }
    updates.displayName = assertNonEmpty(
      patch.displayName,
      'display name',
      DISPLAY_NAME_MAX,
      'DISPLAY_NAME_REQUIRED',
    );
    changedFields.push('displayName');
  }
  if (patch.preferredName !== undefined) {
    updates.preferredName = assertOptional(
      patch.preferredName,
      PREFERRED_NAME_MAX,
      'PREFERRED_NAME',
    );
    changedFields.push('preferredName');
  }
  if (patch.pronouns !== undefined) {
    updates.pronouns = assertOptional(patch.pronouns, PRONOUNS_MAX, 'PRONOUNS');
    changedFields.push('pronouns');
  }
  if (patch.affiliation !== undefined) {
    updates.affiliation = assertOptional(patch.affiliation, AFFILIATION_MAX, 'AFFILIATION');
    changedFields.push('affiliation');
  }
  if (patch.participantType !== undefined) {
    updates.participantType = assertNonEmpty(
      patch.participantType,
      'participant type',
      PARTICIPANT_TYPE_MAX,
      'PARTICIPANT_TYPE_REQUIRED',
    );
    changedFields.push('participantType');
  }
  if (patch.participationMode !== undefined) {
    updates.participationMode = patch.participationMode;
    changedFields.push('participationMode');
  }
  if (patch.languagePreference !== undefined) {
    updates.languagePreference = assertOptional(
      patch.languagePreference,
      LANGUAGE_PREFERENCE_MAX,
      'LANGUAGE_PREFERENCE',
    );
    changedFields.push('languagePreference');
  }
  if (patch.accessibilityRequirements !== undefined) {
    updates.accessibilityRequirements = assertOptional(
      patch.accessibilityRequirements,
      ACCESSIBILITY_REQUIREMENTS_MAX,
      'ACCESSIBILITY_REQUIREMENTS',
    );
    changedFields.push('accessibilityRequirements');
  }

  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: SessionParticipant = {
    ...participant,
    ...updates,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/** Link or unlink a registered Witness user account. Rejected for `anonymous` participants. */
export function changeLinkedUser(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  linkedUserId: UserId | null,
  at: Date,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  if (participant.identityMode === 'anonymous' && linkedUserId !== null) {
    throw new InvariantViolation(
      'An anonymous participant cannot be linked to a registered user account.',
      'ANONYMOUS_CANNOT_BE_LINKED',
    );
  }
  if (linkedUserId === participant.linkedUserId) {
    throw new InvariantViolation(
      'The linked user must differ from the current one.',
      'LINKED_USER_UNCHANGED',
    );
  }

  const next: SessionParticipant = {
    ...participant,
    linkedUserId,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.linked_user_changed',
      actor,
      metadata: { from: participant.linkedUserId ?? '', to: linkedUserId ?? '' },
    },
  };
}

export function updateIdentityVisibility(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  to: ParticipantIdentityVisibility,
  at: Date,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  if (to === participant.identityVisibility) {
    throw new InvariantViolation(
      'The identity visibility must differ from the current one.',
      'IDENTITY_VISIBILITY_UNCHANGED',
    );
  }

  const next: SessionParticipant = {
    ...participant,
    identityVisibility: to,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.identity_visibility_changed',
      actor,
      metadata: { from: participant.identityVisibility, to },
    },
  };
}

export function updateInvitationStatus(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  to: ParticipantInvitationStatus,
  at: Date,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  if (!canTransitionInvitation(participant.invitationStatus, to)) {
    throw new InvariantViolation(
      `Cannot move a participant's invitation from '${participant.invitationStatus}' to '${to}'.`,
      'INVALID_INVITATION_TRANSITION',
    );
  }

  const next: SessionParticipant = {
    ...participant,
    invitationStatus: to,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.invitation_status_changed',
      actor,
      metadata: { from: participant.invitationStatus, to },
    },
  };
}

export function updateAttendanceStatus(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  to: ParticipantAttendanceStatus,
  at: Date,
): SessionParticipantOutcome {
  assertAttendanceRecordable(sessionStatus);

  if (!canTransitionAttendance(participant.attendanceStatus, to)) {
    throw new InvariantViolation(
      `Cannot move a participant's attendance from '${participant.attendanceStatus}' to '${to}'.`,
      'INVALID_ATTENDANCE_TRANSITION',
    );
  }

  const next: SessionParticipant = {
    ...participant,
    attendanceStatus: to,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.attendance_status_changed',
      actor,
      metadata: { from: participant.attendanceStatus, to },
    },
  };
}

/**
 * Set or clear a participant's restricted facilitator notes. A distinct
 * function (and audit action) from `updateParticipantDetails` — the
 * application layer gates this behind `participant:manage_restricted`, a
 * narrower permission than ordinary `participant:update`, exactly because
 * these notes are the one field the milestone's privacy rules single out as
 * requiring "explicit permission".
 */
export function updateFacilitatorNotes(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  notes: string | null,
  at: Date,
): SessionParticipantOutcome {
  assertParticipantsMutable(sessionStatus);

  const next: SessionParticipant = {
    ...participant,
    facilitatorNotes: assertOptional(notes, FACILITATOR_NOTES_MAX, 'FACILITATOR_NOTES'),
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.notes_changed',
      actor,
      metadata: {},
    },
  };
}

/**
 * Withdraw a participant from the session. Not permitted once the session is
 * archived (read-only); permitted in every other status, including `closed`
 * — honouring a withdrawal request should not have to wait for
 * `reopenSession`, since it removes rather than adds visibility.
 */
export function withdrawParticipant(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string | null,
  at: Date,
): SessionParticipantOutcome {
  assertNotArchived(sessionStatus);

  if (participant.withdrawnAt !== null) {
    throw new InvariantViolation(
      'This participant has already been withdrawn.',
      'ALREADY_WITHDRAWN',
    );
  }

  const trimmedReason = assertOptional(reason, WITHDRAWAL_REASON_MAX, 'WITHDRAWAL_REASON');

  const next: SessionParticipant = {
    ...participant,
    withdrawnAt: at,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.withdrawn',
      actor,
      metadata: trimmedReason === null ? {} : { reason: trimmedReason },
    },
  };
}

/** Restore a previously withdrawn participant. Not permitted once the session is archived. */
export function restoreParticipant(
  participant: SessionParticipant,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): SessionParticipantOutcome {
  assertNotArchived(sessionStatus);

  if (participant.withdrawnAt === null) {
    throw new InvariantViolation('This participant has not been withdrawn.', 'NOT_WITHDRAWN');
  }

  const next: SessionParticipant = {
    ...participant,
    withdrawnAt: null,
    updatedAt: at,
    version: participant.version + 1,
  };

  return {
    participant: next,
    event: {
      action: 'session_participant.restored',
      actor,
      metadata: {},
    },
  };
}
