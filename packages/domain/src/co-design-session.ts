/**
 * CoDesignSession — the first core product capability after identity and
 * access management (BUILD_ROADMAP.md Milestone 2). A session is where a
 * facilitator convenes an organisation's or workspace's community around a
 * co-design workshop, consultation, or similar structured conversation, and
 * everything downstream (participants, consent, evidence, decisions) hangs
 * off it.
 *
 * Same shape as `record.ts`/`organisation.ts`: immutable, mutation returns a
 * new value plus a `PendingAuditEvent`, the application layer supplies the
 * identifier, clock and persistence (ADR-0003). `organisationId`/
 * `workspaceId` are trusted as already-verified by the caller — the same
 * convention `workspace.ts` uses for its own `organisationId` — because
 * confirming the workspace actually belongs to that organisation requires a
 * database read the domain is not allowed to perform (ADR-0003).
 *
 * Session type is deliberately a free-form, organisation-supplied string
 * rather than a closed enum: "talanoa", "formal proceeding", and "community
 * consultation" are not decorative labels for the same underlying workflow —
 * they carry distinct protocol expectations an organisation may need to name
 * for itself, and a fixed enum would either flatten that distinction or grow
 * without bound as new organisations onboard. `packages/contracts` documents
 * a suggested set for the frontend's picker; nothing here enforces it.
 *
 * `evidenceCaptureState` from the milestone's field list is deliberately NOT
 * a stored field — it is fully determined by `status` (open sessions accept
 * capture, nothing else does), so storing it separately would create a
 * second value that could drift from the first. `canCaptureEvidence` below
 * is the computed answer; Milestone 5 (Evidence Capture) calls it rather
 * than reading a field. `consentConfigurationState` IS stored, because
 * Milestone 4 (Consent) will need to set it independently of lifecycle
 * status — but this milestone gives it no mutator of its own; it is set
 * once at creation and stays `not_configured` until Consent exists to
 * change it. That is a deliberate, named gap, not an oversight.
 */

import { HumanConfirmationRequired, InvariantViolation } from './errors.js';
import { isHuman, type Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { CoDesignSessionId, OrganisationId, UserId, WorkspaceId } from './ids.js';

const TITLE_MAX = 200;
const PURPOSE_MAX = 2000;
const DESCRIPTION_MAX = 5000;
const LOCATION_MAX = 300;
const CULTURAL_PROTOCOL_NOTES_MAX = 5000;
const SESSION_TYPE_MAX = 100;
const TIMEZONE_MAX = 64;
const LANGUAGE_MAX = 50;
const LANGUAGES_MAX_COUNT = 20;

export const SESSION_STATUSES = ['draft', 'scheduled', 'open', 'closed', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_DELIVERY_MODES = [
  'in_person',
  'online',
  'hybrid',
  'asynchronous',
  'other',
] as const;
export type SessionDeliveryMode = (typeof SESSION_DELIVERY_MODES)[number];

export const SESSION_PARTICIPANT_VISIBILITIES = [
  'visible_to_all_participants',
  'facilitators_only',
] as const;
export type SessionParticipantVisibility = (typeof SESSION_PARTICIPANT_VISIBILITIES)[number];

export const SESSION_CONSENT_CONFIGURATION_STATES = ['not_configured', 'configured'] as const;
export type SessionConsentConfigurationState =
  (typeof SESSION_CONSENT_CONFIGURATION_STATES)[number];

/**
 * Permitted lifecycle transitions.
 *
 * `open -> closed -> open` (reopen) is deliberate, not an oversight: closed
 * sessions must reject ordinary evidence capture, but a facilitator
 * discovering the workshop is not actually finished needs a way back in
 * that is explicit and audited rather than a silent status edit —
 * `reopenSession` below requires a human actor and a stated reason,
 * mirroring `record.ts`'s `reopenRecord`. `archived` is terminal: an
 * archived session is read-only for the rest of this aggregate's life,
 * matching the milestone's explicit requirement.
 */
const TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = Object.freeze({
  draft: ['scheduled', 'open'],
  scheduled: ['draft', 'open'],
  open: ['closed'],
  closed: ['archived', 'open'],
  archived: [],
});

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function permittedSessionTransitions(from: SessionStatus): readonly SessionStatus[] {
  return TRANSITIONS[from];
}

/** Open sessions accept evidence capture; nothing else does. See file header. */
export function canCaptureEvidence(session: CoDesignSession): boolean {
  return session.status === 'open';
}

export interface CoDesignSession {
  readonly id: CoDesignSessionId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly purpose: string;
  readonly description: string | null;
  readonly sessionType: string;
  readonly location: string | null;
  readonly deliveryMode: SessionDeliveryMode;
  readonly startAt: Date | null;
  readonly endAt: Date | null;
  readonly timezone: string | null;
  readonly primaryFacilitatorId: UserId;
  readonly status: SessionStatus;
  readonly supportedLanguages: readonly string[];
  readonly culturalProtocolNotes: string | null;
  readonly participantVisibility: SessionParticipantVisibility;
  readonly consentConfigurationState: SessionConsentConfigurationState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly openedAt: Date | null;
  readonly closedAt: Date | null;
  readonly archivedAt: Date | null;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface CoDesignSessionOutcome {
  readonly session: CoDesignSession;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(`A co-design session must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A co-design session ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
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

function assertLanguages(languages: readonly string[] | undefined): readonly string[] {
  if (languages === undefined) return [];
  if (languages.length > LANGUAGES_MAX_COUNT) {
    throw new InvariantViolation(
      `A co-design session may list at most ${LANGUAGES_MAX_COUNT} supported languages, received ${languages.length}.`,
      'TOO_MANY_LANGUAGES',
    );
  }

  const trimmed = languages
    .map((language) => language.trim())
    .filter((language) => language.length > 0);

  for (const language of trimmed) {
    if (language.length > LANGUAGE_MAX) {
      throw new InvariantViolation(
        `A supported language code must be ${LANGUAGE_MAX} characters or fewer, received '${language}'.`,
        'LANGUAGE_TOO_LONG',
      );
    }
  }

  return Object.freeze([...new Set(trimmed)]);
}

function assertSchedule(startAt: Date | null, endAt: Date | null): void {
  if (startAt !== null && Number.isNaN(startAt.getTime())) {
    throw new InvariantViolation(
      'A co-design session startAt is not a valid date.',
      'INVALID_START_AT',
    );
  }
  if (endAt !== null && Number.isNaN(endAt.getTime())) {
    throw new InvariantViolation(
      'A co-design session endAt is not a valid date.',
      'INVALID_END_AT',
    );
  }
  if (startAt !== null && endAt !== null && endAt.getTime() <= startAt.getTime()) {
    throw new InvariantViolation(
      'A co-design session end time must be after its start time.',
      'END_BEFORE_START',
    );
  }
}

function assertNotArchived(session: CoDesignSession): void {
  if (session.status === 'archived') {
    throw new InvariantViolation(
      'An archived co-design session is read-only and cannot be changed.',
      'SESSION_ARCHIVED',
    );
  }
}

/**
 * Create a new co-design session. Always starts in `draft` — never
 * scheduled or open — mirroring `record.ts`'s "capture always starts as a
 * draft" convention: a session is not real to participants until a
 * facilitator explicitly schedules or opens it.
 *
 * Least privilege (Constitution, Authority and Access): the application
 * layer is expected to gate this behind a `session:create` authorisation
 * check before calling in, the same way `workspace:create` gates
 * `createWorkspace`.
 */
export function createCoDesignSession(input: {
  id: CoDesignSessionId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  title: string;
  purpose: string;
  description?: string | null | undefined;
  sessionType: string;
  location?: string | null | undefined;
  deliveryMode: SessionDeliveryMode;
  primaryFacilitatorId: UserId;
  supportedLanguages?: readonly string[] | undefined;
  culturalProtocolNotes?: string | null | undefined;
  participantVisibility?: SessionParticipantVisibility | undefined;
  createdBy: Actor;
  createdAt: Date;
}): CoDesignSessionOutcome {
  const session: CoDesignSession = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    title: assertNonEmpty(input.title, 'title', TITLE_MAX, 'TITLE_REQUIRED'),
    purpose: assertNonEmpty(input.purpose, 'purpose', PURPOSE_MAX, 'PURPOSE_REQUIRED'),
    description: assertOptional(input.description, DESCRIPTION_MAX, 'DESCRIPTION'),
    sessionType: assertNonEmpty(
      input.sessionType,
      'session type',
      SESSION_TYPE_MAX,
      'SESSION_TYPE_REQUIRED',
    ),
    location: assertOptional(input.location, LOCATION_MAX, 'LOCATION'),
    deliveryMode: input.deliveryMode,
    startAt: null,
    endAt: null,
    timezone: null,
    primaryFacilitatorId: input.primaryFacilitatorId,
    status: 'draft',
    supportedLanguages: assertLanguages(input.supportedLanguages),
    culturalProtocolNotes: assertOptional(
      input.culturalProtocolNotes,
      CULTURAL_PROTOCOL_NOTES_MAX,
      'CULTURAL_PROTOCOL_NOTES',
    ),
    participantVisibility: input.participantVisibility ?? 'facilitators_only',
    consentConfigurationState: 'not_configured',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    openedAt: null,
    closedAt: null,
    archivedAt: null,
    version: 1,
  };

  return {
    session,
    event: {
      action: 'co_design_session.created',
      actor: input.createdBy,
      metadata: {
        organisationId: session.organisationId,
        workspaceId: session.workspaceId,
        title: session.title,
        sessionType: session.sessionType,
      },
    },
  };
}

/**
 * Update the mutable descriptive fields of a session. Rejected on an
 * archived session (read-only) — every other status permits editing,
 * including `open` (facilitators regularly correct a workshop's stated
 * purpose or add cultural-protocol notes mid-session).
 */
export function updateSessionDetails(
  session: CoDesignSession,
  actor: Actor,
  patch: {
    title?: string | undefined;
    purpose?: string | undefined;
    description?: string | null | undefined;
    sessionType?: string | undefined;
    location?: string | null | undefined;
    deliveryMode?: SessionDeliveryMode | undefined;
    supportedLanguages?: readonly string[] | undefined;
    culturalProtocolNotes?: string | null | undefined;
    participantVisibility?: SessionParticipantVisibility | undefined;
  },
  at: Date,
): CoDesignSessionOutcome {
  assertNotArchived(session);

  const changedFields: string[] = [];
  const updates: { -readonly [K in keyof CoDesignSession]?: CoDesignSession[K] } = {};

  if (patch.title !== undefined) {
    updates.title = assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED');
    changedFields.push('title');
  }
  if (patch.purpose !== undefined) {
    updates.purpose = assertNonEmpty(patch.purpose, 'purpose', PURPOSE_MAX, 'PURPOSE_REQUIRED');
    changedFields.push('purpose');
  }
  if (patch.description !== undefined) {
    updates.description = assertOptional(patch.description, DESCRIPTION_MAX, 'DESCRIPTION');
    changedFields.push('description');
  }
  if (patch.sessionType !== undefined) {
    updates.sessionType = assertNonEmpty(
      patch.sessionType,
      'session type',
      SESSION_TYPE_MAX,
      'SESSION_TYPE_REQUIRED',
    );
    changedFields.push('sessionType');
  }
  if (patch.location !== undefined) {
    updates.location = assertOptional(patch.location, LOCATION_MAX, 'LOCATION');
    changedFields.push('location');
  }
  if (patch.deliveryMode !== undefined) {
    updates.deliveryMode = patch.deliveryMode;
    changedFields.push('deliveryMode');
  }
  if (patch.supportedLanguages !== undefined) {
    updates.supportedLanguages = assertLanguages(patch.supportedLanguages);
    changedFields.push('supportedLanguages');
  }
  if (patch.culturalProtocolNotes !== undefined) {
    updates.culturalProtocolNotes = assertOptional(
      patch.culturalProtocolNotes,
      CULTURAL_PROTOCOL_NOTES_MAX,
      'CULTURAL_PROTOCOL_NOTES',
    );
    changedFields.push('culturalProtocolNotes');
  }
  if (patch.participantVisibility !== undefined) {
    updates.participantVisibility = patch.participantVisibility;
    changedFields.push('participantVisibility');
  }

  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: CoDesignSession = {
    ...session,
    ...updates,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/** Reassign the session's primary facilitator. Audited separately from a general update. */
export function changeSessionFacilitator(
  session: CoDesignSession,
  actor: Actor,
  primaryFacilitatorId: UserId,
  at: Date,
): CoDesignSessionOutcome {
  assertNotArchived(session);

  if (primaryFacilitatorId === session.primaryFacilitatorId) {
    throw new InvariantViolation(
      'The new primary facilitator must differ from the current one.',
      'FACILITATOR_UNCHANGED',
    );
  }

  const next: CoDesignSession = {
    ...session,
    primaryFacilitatorId,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.facilitator_changed',
      actor,
      metadata: { from: session.primaryFacilitatorId, to: primaryFacilitatorId },
    },
  };
}

/**
 * Set or change the session's schedule. Also performs the `draft ->
 * scheduled` transition when the session is still a draft — scheduling a
 * session and marking it Scheduled are the same real-world action, so they
 * are one domain operation rather than two the caller must sequence
 * correctly.
 */
export function scheduleSession(
  session: CoDesignSession,
  actor: Actor,
  input: { startAt: Date; endAt: Date | null; timezone: string | null },
  at: Date,
): CoDesignSessionOutcome {
  assertNotArchived(session);

  if (session.status !== 'draft' && session.status !== 'scheduled') {
    throw new InvariantViolation(
      `Cannot schedule a session in status '${session.status}'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  assertSchedule(input.startAt, input.endAt);

  const timezone = assertOptional(input.timezone, TIMEZONE_MAX, 'TIMEZONE');

  const next: CoDesignSession = {
    ...session,
    status: 'scheduled',
    startAt: input.startAt,
    endAt: input.endAt,
    timezone,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.scheduled',
      actor,
      metadata: {
        from: session.status,
        to: 'scheduled',
        startAt: input.startAt.toISOString(),
        endAt: input.endAt?.toISOString() ?? '',
      },
    },
  };
}

/** Move a session back to `draft` from `scheduled`. */
export function unscheduleSession(
  session: CoDesignSession,
  actor: Actor,
  at: Date,
): CoDesignSessionOutcome {
  if (session.status !== 'scheduled') {
    throw new InvariantViolation(
      `Cannot move a session from '${session.status}' to 'draft'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  const next: CoDesignSession = {
    ...session,
    status: 'draft',
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.updated',
      actor,
      metadata: { from: 'scheduled', to: 'draft' },
    },
  };
}

/** Open a session for live facilitation. Permitted from `draft` or `scheduled`. */
export function openSession(
  session: CoDesignSession,
  actor: Actor,
  at: Date,
): CoDesignSessionOutcome {
  if (!canTransitionSession(session.status, 'open')) {
    throw new InvariantViolation(
      `Cannot move a session from '${session.status}' to 'open'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  const next: CoDesignSession = {
    ...session,
    status: 'open',
    openedAt: at,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.opened',
      actor,
      metadata: { from: session.status, to: 'open' },
    },
  };
}

/** Close an open session. Ordinary evidence capture is rejected from this point on. */
export function closeSession(
  session: CoDesignSession,
  actor: Actor,
  at: Date,
): CoDesignSessionOutcome {
  if (!canTransitionSession(session.status, 'closed')) {
    throw new InvariantViolation(
      `Cannot move a session from '${session.status}' to 'closed'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  const next: CoDesignSession = {
    ...session,
    status: 'closed',
    closedAt: at,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.closed',
      actor,
      metadata: { from: session.status, to: 'closed' },
    },
  };
}

/**
 * Reopen a closed session. Requires a human actor and a stated reason —
 * this reverses "the workshop is over," which is an institutional decision
 * exactly like `reopenRecord`'s reversal of a review decision, and gets the
 * same guardrail.
 */
export function reopenSession(
  session: CoDesignSession,
  actor: Actor,
  reason: string,
  at: Date,
): CoDesignSessionOutcome {
  if (!isHuman(actor)) {
    throw new HumanConfirmationRequired(actor.kind);
  }

  if (!canTransitionSession(session.status, 'open')) {
    throw new InvariantViolation(
      `Cannot reopen a session from '${session.status}'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new InvariantViolation(
      'Reopening a closed session must state a reason — this reverses that the workshop had ended.',
      'REOPEN_REASON_REQUIRED',
    );
  }

  const next: CoDesignSession = {
    ...session,
    status: 'open',
    closedAt: null,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.reopened',
      actor,
      metadata: { from: session.status, to: 'open', reason: trimmedReason },
    },
  };
}

/** Archive a closed session. Terminal: an archived session cannot transition again. */
export function archiveSession(
  session: CoDesignSession,
  actor: Actor,
  at: Date,
): CoDesignSessionOutcome {
  if (!canTransitionSession(session.status, 'archived')) {
    throw new InvariantViolation(
      `Cannot move a session from '${session.status}' to 'archived'.`,
      'INVALID_SESSION_TRANSITION',
    );
  }

  const next: CoDesignSession = {
    ...session,
    status: 'archived',
    archivedAt: at,
    updatedAt: at,
    version: session.version + 1,
  };

  return {
    session: next,
    event: {
      action: 'co_design_session.archived',
      actor,
      metadata: { from: session.status, to: 'archived' },
    },
  };
}
