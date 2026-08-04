/**
 * Evidence (BUILD_ROADMAP.md Milestone 5, Structured Live Evidence Capture)
 * — a single structured thing someone said, observed, proposed, or objected
 * to during an open co-design session.
 *
 * Same shape as every other aggregate in this package: immutable, mutation
 * returns a new value plus a `PendingAuditEvent`, the application layer
 * supplies the identifier, clock and persistence (ADR-0003).
 * `organisationId`/`workspaceId`/`sessionId` are trusted as already-verified
 * by the caller, same convention `session-participant.ts` established.
 *
 * This milestone implements three of the seven eventual review states —
 * `draft`, `submitted`, `withdrawn`. The remaining four (`under_review`,
 * `needs_clarification`, `validated`, `rejected`) are declared in
 * `EVIDENCE_REVIEW_STATUSES` because the database column and the API
 * contract need the full vocabulary from the start, but no function here
 * transitions into them: Milestone 6 (Evidence Review and Validation) owns
 * that, and adding a mutator now would be exactly the "unfinished lifecycle
 * transition" this milestone's completion standard forbids. Captured
 * evidence must not become validated institutional knowledge by default —
 * `verificationStatus` therefore starts, and stays, `unverified` here.
 *
 * `attributionMode` is the load-bearing privacy decision on this aggregate,
 * and it is NOT free-form: it must be compatible with the source
 * participant's `identityMode`, with the consent the participant actually
 * gave, and with the evidence type. The domain enforces the first and third
 * of those (`assertAttributionCompatibility` below) because they are
 * knowable from data the domain already holds; the consent check is an
 * application-layer call into `ConsentPolicyService` (ADR-0003 — the domain
 * may not read a database), which `EvidenceService` performs before calling
 * `captureEvidence`. Neither check is optional, and neither substitutes for
 * the other.
 *
 * `consentBasis` stores the minimum provenance explaining *why* a capture
 * was permitted — which consent categories were checked and allowed at
 * capture time. It is deliberately not a copy of the participant's consent
 * record: that record can later be amended or withdrawn, and this field
 * must keep saying what was true when the evidence was captured, which is
 * the only thing that makes a later audit meaningful.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import type {
  ParticipantIdentityMode,
  ParticipantIdentityVisibility,
} from './session-participant.js';
import type {
  CoDesignSessionId,
  EvidenceId,
  OrganisationId,
  SessionParticipantId,
  WorkspaceId,
} from './ids.js';

const TITLE_MAX = 300;
const CONTENT_MAX = 20000;
const LANGUAGE_MAX = 50;
const TAG_MAX = 60;
const TAGS_MAX_COUNT = 20;
const WITHDRAWAL_REASON_MAX = 2000;
const CONSENT_BASIS_MAX_COUNT = 20;

/**
 * The evidence types a facilitator can pick from. Free-form at the database
 * level (a `VARCHAR`, not an enum) and validated here against this list
 * only for the well-known set — same reasoning `consent-template.ts` uses
 * for consent categories: the list below covers what a co-design workshop
 * actually produces, but an organisation naming something this list does
 * not anticipate must not need an engineering change. `other` is the
 * explicit escape hatch, and `assertEvidenceType` accepts any non-empty
 * string, so this constant is a *suggestion* for the frontend picker and a
 * shared vocabulary for filtering, not a closed gate.
 *
 * Deliberately contains no AI-derived classifications (sentiment, theme,
 * cluster): those are Milestone 5's explicit non-goals, and baking them in
 * now would be speculative infrastructure.
 */
export const EVIDENCE_TYPES = [
  'observation',
  'quote',
  'idea',
  'concern',
  'need',
  'barrier',
  'opportunity',
  'risk',
  'question',
  'disagreement',
  'consensus',
  'decision_candidate',
  'commitment_candidate',
  'action_candidate',
  'recommendation',
  'facilitator_note',
  'document_reference',
  'link',
  'other',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * Evidence types that reproduce a participant's own words rather than
 * describing or interpreting them. These are the types that require
 * quotation consent (attributed or anonymous, per `attributionMode`) — a
 * facilitator's paraphrased observation of what someone said is a different
 * act from quoting them, and the consent categories distinguish the two.
 */
const QUOTATION_EVIDENCE_TYPES: ReadonlySet<string> = new Set(['quote']);

/**
 * The full review vocabulary. Milestone 5 only *transitions* between
 * `draft`, `submitted` and `withdrawn` — see the file header for why the
 * other four are declared but unreachable from this module.
 */
export const EVIDENCE_REVIEW_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'needs_clarification',
  'validated',
  'rejected',
  'withdrawn',
] as const;
export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number];

/**
 * Whether a human reviewer has confirmed this evidence reflects what
 * actually happened. Separate from `reviewStatus` on purpose: review is a
 * *workflow* position, verification is a *claim about truth*. Milestone 5
 * captures evidence as `unverified` and never changes it; Milestone 6 owns
 * the transition to `verified`/`disputed`.
 */
export const EVIDENCE_VERIFICATION_STATUSES = ['unverified', 'verified', 'disputed'] as const;
export type EvidenceVerificationStatus = (typeof EVIDENCE_VERIFICATION_STATUSES)[number];

/**
 * How this evidence is attributed to its source.
 *
 * `attributed` names the participant; `pseudonymous` shows their chosen
 * name; `anonymous` shows nothing identifying; `facilitator_observation` is
 * the facilitator's own note about the room rather than any one person's
 * words; `institutional_source` is a document, policy, or organisational
 * position; `unattributed` is content with no identifiable source at all
 * (e.g. an anonymous sticky note whose author nobody recorded).
 *
 * The last three are the modes with NO `sourceParticipantId` — they are
 * structurally incapable of exposing a participant, which is why
 * `assertAttributionCompatibility` requires the participant reference to be
 * absent for them rather than merely ignoring it.
 */
export const EVIDENCE_ATTRIBUTION_MODES = [
  'attributed',
  'pseudonymous',
  'anonymous',
  'facilitator_observation',
  'institutional_source',
  'unattributed',
] as const;
export type EvidenceAttributionMode = (typeof EVIDENCE_ATTRIBUTION_MODES)[number];

/** Attribution modes that name, or could name, a specific participant. */
const PARTICIPANT_BACKED_MODES: ReadonlySet<EvidenceAttributionMode> = new Set([
  'attributed',
  'pseudonymous',
  'anonymous',
]);

/** Attribution modes that must never carry a participant reference at all. */
const SOURCELESS_MODES: ReadonlySet<EvidenceAttributionMode> = new Set([
  'facilitator_observation',
  'institutional_source',
  'unattributed',
]);

export interface Evidence {
  readonly id: EvidenceId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly evidenceType: string;
  readonly title: string;
  readonly content: string;
  readonly language: string | null;
  readonly capturedAt: Date;
  /** Seconds from the session's start, when the facilitator recorded one. */
  readonly sessionOffsetSeconds: number | null;
  readonly sourceParticipantId: SessionParticipantId | null;
  readonly attributionMode: EvidenceAttributionMode;
  readonly identityVisibility: ParticipantIdentityVisibility;
  /**
   * Which consent categories were checked and allowed at capture time — the
   * minimum provenance explaining why this capture was permitted. See the
   * file header for why this is a snapshot, not a live reference.
   */
  readonly consentBasis: readonly string[];
  readonly reviewStatus: EvidenceReviewStatus;
  readonly verificationStatus: EvidenceVerificationStatus;
  readonly tags: readonly string[];
  readonly supersededByEvidenceId: EvidenceId | null;
  readonly withdrawnAt: Date | null;
  /** Restricted — the API layer only includes this for a caller holding `evidence:manage_restricted`. */
  readonly withdrawalReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface EvidenceOutcome {
  readonly evidence: Evidence;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`Evidence must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `Evidence ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
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
 * Any non-empty string up to the column width — see `EVIDENCE_TYPES`'s doc
 * comment for why this is not a closed enum check.
 */
function assertEvidenceType(value: string): string {
  return assertNonEmpty(value, 'evidence type', 100, 'EVIDENCE_TYPE_REQUIRED');
}

function assertTags(tags: readonly string[] | undefined): readonly string[] {
  if (tags === undefined) return Object.freeze([]);
  if (tags.length > TAGS_MAX_COUNT) {
    throw new InvariantViolation(
      `Evidence may carry at most ${TAGS_MAX_COUNT} tags, received ${tags.length}.`,
      'TOO_MANY_TAGS',
    );
  }

  const normalised: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = raw.trim();
    if (tag.length === 0) continue;
    if (tag.length > TAG_MAX) {
      throw new InvariantViolation(
        `A tag must be ${TAG_MAX} characters or fewer, received '${tag}'.`,
        'TAG_TOO_LONG',
      );
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    normalised.push(tag);
  }

  return Object.freeze(normalised);
}

function assertConsentBasis(basis: readonly string[] | undefined): readonly string[] {
  if (basis === undefined) return Object.freeze([]);
  if (basis.length > CONSENT_BASIS_MAX_COUNT) {
    throw new InvariantViolation(
      `Evidence consent basis may list at most ${CONSENT_BASIS_MAX_COUNT} categories, received ${basis.length}.`,
      'TOO_MANY_CONSENT_CATEGORIES',
    );
  }
  const normalised = [...new Set(basis.map((c) => c.trim()).filter((c) => c.length > 0))];
  return Object.freeze(normalised);
}

function assertSessionOffset(seconds: number | null | undefined): number | null {
  if (seconds === null || seconds === undefined) return null;
  if (!Number.isInteger(seconds)) {
    throw new InvariantViolation(
      'A session-relative timestamp must be a whole number of seconds.',
      'INVALID_SESSION_OFFSET',
    );
  }
  if (seconds < 0) {
    throw new InvariantViolation(
      'A session-relative timestamp cannot be negative.',
      'INVALID_SESSION_OFFSET',
    );
  }
  return seconds;
}

/**
 * Attribution compatibility — the domain half of the milestone's
 * "reject incompatible combinations" rule. Enforces everything knowable
 * without a database read:
 *
 * - a participant-backed mode requires a participant reference, and a
 *   sourceless mode forbids one (so `facilitator_observation` can never
 *   quietly carry someone's identity);
 * - an `anonymous` participant can only ever be `anonymous` here — the
 *   whole point of `session-participant.ts`'s anonymous invariants is that
 *   the record carries nothing identifying, and re-attributing it later
 *   would be a privacy failure the participant never agreed to;
 * - a `pseudonymous` participant can be `pseudonymous` or `anonymous`, but
 *   never `attributed` — their real identity is restricted by construction;
 * - a `named` participant may be any of the three (a named participant can
 *   still ask for a specific contribution to be anonymous);
 * - `facilitator_note` evidence must not be participant-backed at all — a
 *   facilitator's private note about the room is not someone's testimony.
 *
 * The consent half of the rule (does this participant actually permit
 * attributed/anonymous quotation?) is NOT here: it needs the consent
 * record, which is a database read the domain may not perform (ADR-0003).
 * `EvidenceService` calls `ConsentPolicyService` before calling this
 * module. Both checks run; neither replaces the other.
 */
export function assertAttributionCompatibility(input: {
  attributionMode: EvidenceAttributionMode;
  evidenceType: string;
  sourceParticipantId: SessionParticipantId | null;
  participantIdentityMode: ParticipantIdentityMode | null;
}): void {
  const { attributionMode, evidenceType, sourceParticipantId, participantIdentityMode } = input;

  if (SOURCELESS_MODES.has(attributionMode) && sourceParticipantId !== null) {
    throw new InvariantViolation(
      `Attribution mode '${attributionMode}' cannot name a source participant.`,
      'ATTRIBUTION_MODE_FORBIDS_PARTICIPANT',
    );
  }

  if (PARTICIPANT_BACKED_MODES.has(attributionMode) && sourceParticipantId === null) {
    throw new InvariantViolation(
      `Attribution mode '${attributionMode}' requires a source participant.`,
      'ATTRIBUTION_MODE_REQUIRES_PARTICIPANT',
    );
  }

  if (evidenceType.trim() === 'facilitator_note' && sourceParticipantId !== null) {
    throw new InvariantViolation(
      'A facilitator note cannot be attributed to a participant — record it as an observation or a quote instead.',
      'FACILITATOR_NOTE_CANNOT_BE_ATTRIBUTED',
    );
  }

  if (sourceParticipantId === null) return;

  if (participantIdentityMode === null) {
    throw new InvariantViolation(
      'A source participant was named but their identity mode was not supplied.',
      'PARTICIPANT_IDENTITY_MODE_REQUIRED',
    );
  }

  if (participantIdentityMode === 'anonymous' && attributionMode !== 'anonymous') {
    throw new InvariantViolation(
      "An anonymous participant's evidence can only be recorded anonymously.",
      'ANONYMOUS_PARTICIPANT_CANNOT_BE_ATTRIBUTED',
    );
  }

  if (participantIdentityMode === 'pseudonymous' && attributionMode === 'attributed') {
    throw new InvariantViolation(
      "A pseudonymous participant's evidence cannot be attributed to their real identity.",
      'PSEUDONYMOUS_PARTICIPANT_CANNOT_BE_ATTRIBUTED',
    );
  }
}

/**
 * Which consent category a capture needs, given its attribution mode and
 * evidence type — the question `EvidenceService` asks `ConsentPolicyService`
 * before capture. Exported so the service and this module cannot disagree
 * about it, and so a test can assert the mapping directly.
 *
 * Returns `null` when no participant-specific category applies (a
 * sourceless mode has no participant to have consented to anything).
 * `participation` is handled separately and unconditionally — every
 * participant-backed capture needs it, and `ConsentPolicyService`'s own
 * gating already conditions every other category on it.
 */
export function requiredConsentCategoryForCapture(input: {
  attributionMode: EvidenceAttributionMode;
  evidenceType: string;
}): string | null {
  if (SOURCELESS_MODES.has(input.attributionMode)) return null;

  const isQuotation = QUOTATION_EVIDENCE_TYPES.has(input.evidenceType.trim());
  if (!isQuotation) return null;

  return input.attributionMode === 'attributed' ? 'attributed_quotation' : 'anonymous_quotation';
}

/**
 * Session states that permit live evidence capture. `open` only, per the
 * milestone's explicit rule — `draft`/`scheduled` reject capture because
 * there is no approved preparation-note pattern in this repository to make
 * an exception for, `closed` rejects ordinary capture, and `archived` is
 * read-only (`co-design-session.ts`'s own `assertNotArchived` reasoning).
 */
function assertCapturable(sessionStatus: SessionStatus): void {
  if (sessionStatus !== 'open') {
    throw new InvariantViolation(
      `Evidence can only be captured while the session is open — this session is '${sessionStatus}'.`,
      'SESSION_NOT_OPEN',
    );
  }
}

export interface CaptureEvidenceInput {
  id: EvidenceId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  evidenceType: string;
  title: string;
  content: string;
  language?: string | null | undefined;
  sessionOffsetSeconds?: number | null | undefined;
  sourceParticipantId?: SessionParticipantId | null | undefined;
  /** The source participant's identity mode, read by the service — see `assertAttributionCompatibility`. */
  participantIdentityMode?: ParticipantIdentityMode | null | undefined;
  attributionMode: EvidenceAttributionMode;
  identityVisibility?: ParticipantIdentityVisibility | undefined;
  consentBasis?: readonly string[] | undefined;
  tags?: readonly string[] | undefined;
  /** `true` for the quick-capture path, which submits immediately rather than saving a draft. */
  submitImmediately?: boolean | undefined;
  capturedBy: Actor;
  at: Date;
}

/**
 * Capture a new piece of evidence. Starts `draft` unless the caller asks
 * for immediate submission (the quick-capture path — a facilitator typing
 * mid-sentence should not have to make a second click to file what they
 * just wrote).
 *
 * Never starts validated or verified: `verificationStatus` is
 * `'unverified'` here and no function in this module changes it.
 */
export function captureEvidence(
  sessionStatus: SessionStatus,
  input: CaptureEvidenceInput,
): EvidenceOutcome {
  assertCapturable(sessionStatus);

  const evidenceType = assertEvidenceType(input.evidenceType);
  const sourceParticipantId = input.sourceParticipantId ?? null;

  assertAttributionCompatibility({
    attributionMode: input.attributionMode,
    evidenceType,
    sourceParticipantId,
    participantIdentityMode: input.participantIdentityMode ?? null,
  });

  const evidence: Evidence = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    evidenceType,
    title: assertNonEmpty(input.title, 'title', TITLE_MAX, 'TITLE_REQUIRED'),
    content: assertNonEmpty(input.content, 'content', CONTENT_MAX, 'CONTENT_REQUIRED'),
    language: assertOptional(input.language, LANGUAGE_MAX, 'LANGUAGE'),
    capturedAt: input.at,
    sessionOffsetSeconds: assertSessionOffset(input.sessionOffsetSeconds),
    sourceParticipantId,
    attributionMode: input.attributionMode,
    identityVisibility: input.identityVisibility ?? 'visible_to_all_participants',
    consentBasis: assertConsentBasis(input.consentBasis),
    reviewStatus: input.submitImmediately === true ? 'submitted' : 'draft',
    verificationStatus: 'unverified',
    tags: assertTags(input.tags),
    supersededByEvidenceId: null,
    withdrawnAt: null,
    withdrawalReason: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    evidence,
    event: {
      action: input.submitImmediately === true ? 'evidence.quick_captured' : 'evidence.captured',
      actor: input.capturedBy,
      metadata: {
        sessionId: evidence.sessionId,
        evidenceType: evidence.evidenceType,
        attributionMode: evidence.attributionMode,
        reviewStatus: evidence.reviewStatus,
        sourceParticipantId: evidence.sourceParticipantId ?? '',
        consentBasis: evidence.consentBasis.join(','),
      },
    },
  };
}

export interface UpdateEvidenceDraftInput {
  evidenceType?: string | undefined;
  title?: string | undefined;
  content?: string | undefined;
  language?: string | null | undefined;
  sessionOffsetSeconds?: number | null | undefined;
  sourceParticipantId?: SessionParticipantId | null | undefined;
  participantIdentityMode?: ParticipantIdentityMode | null | undefined;
  attributionMode?: EvidenceAttributionMode | undefined;
  identityVisibility?: ParticipantIdentityVisibility | undefined;
  consentBasis?: readonly string[] | undefined;
  tags?: readonly string[] | undefined;
}

/**
 * Edit an evidence draft. Only a `draft` can be edited — once submitted,
 * evidence enters the review workflow and changing it silently underneath a
 * reviewer would defeat the point of having one (Milestone 6 adds a
 * reviewer-controlled correction path with its own versioning).
 *
 * Changing `attributionMode` or `sourceParticipantId` re-runs the full
 * compatibility check against the *new* combination, so an edit cannot
 * reach a state the original capture would have been rejected for.
 */
export function updateEvidenceDraft(
  evidence: Evidence,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateEvidenceDraftInput,
  at: Date,
): EvidenceOutcome {
  assertCapturable(sessionStatus);

  if (evidence.reviewStatus !== 'draft') {
    throw new InvariantViolation(
      `Only a draft can be edited — this evidence is '${evidence.reviewStatus}'.`,
      'EVIDENCE_NOT_DRAFT',
    );
  }

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .filter((key) => key !== 'participantIdentityMode');

  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const evidenceType =
    patch.evidenceType !== undefined
      ? assertEvidenceType(patch.evidenceType)
      : evidence.evidenceType;
  const attributionMode = patch.attributionMode ?? evidence.attributionMode;
  const sourceParticipantId =
    patch.sourceParticipantId !== undefined
      ? patch.sourceParticipantId
      : evidence.sourceParticipantId;

  assertAttributionCompatibility({
    attributionMode,
    evidenceType,
    sourceParticipantId,
    participantIdentityMode: patch.participantIdentityMode ?? null,
  });

  const next: Evidence = {
    ...evidence,
    evidenceType,
    title:
      patch.title !== undefined
        ? assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED')
        : evidence.title,
    content:
      patch.content !== undefined
        ? assertNonEmpty(patch.content, 'content', CONTENT_MAX, 'CONTENT_REQUIRED')
        : evidence.content,
    language:
      patch.language !== undefined
        ? assertOptional(patch.language, LANGUAGE_MAX, 'LANGUAGE')
        : evidence.language,
    sessionOffsetSeconds:
      patch.sessionOffsetSeconds !== undefined
        ? assertSessionOffset(patch.sessionOffsetSeconds)
        : evidence.sessionOffsetSeconds,
    sourceParticipantId,
    attributionMode,
    identityVisibility: patch.identityVisibility ?? evidence.identityVisibility,
    consentBasis:
      patch.consentBasis !== undefined
        ? assertConsentBasis(patch.consentBasis)
        : evidence.consentBasis,
    tags: patch.tags !== undefined ? assertTags(patch.tags) : evidence.tags,
    updatedAt: at,
    version: evidence.version + 1,
  };

  return {
    evidence: next,
    event: {
      action: 'evidence.updated',
      actor,
      metadata: {
        changedFields: changedFields.join(','),
        attributionMode: next.attributionMode,
        sourceParticipantId: next.sourceParticipantId ?? '',
      },
    },
  };
}

/**
 * Submit a draft for human review. `draft → submitted` only — resubmitting
 * something already in the review workflow is a Milestone 6 concern, and a
 * withdrawn record is not a candidate for review at all.
 *
 * Permitted while the session is `open` or `closed`: a facilitator
 * routinely files the last of the session's drafts after the room has
 * emptied, and forcing them to reopen the session to do so would push them
 * toward capturing less. Ordinary *capture* remains open-only.
 */
export function submitEvidence(
  evidence: Evidence,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): EvidenceOutcome {
  if (sessionStatus === 'archived') {
    throw new InvariantViolation('An archived session is read-only.', 'SESSION_ARCHIVED');
  }
  if (sessionStatus !== 'open' && sessionStatus !== 'closed') {
    throw new InvariantViolation(
      `Evidence can only be submitted while the session is open or closed — this session is '${sessionStatus}'.`,
      'SESSION_NOT_SUBMITTABLE',
    );
  }

  if (evidence.reviewStatus !== 'draft') {
    throw new InvariantViolation(
      `Only a draft can be submitted for review — this evidence is '${evidence.reviewStatus}'.`,
      'INVALID_EVIDENCE_TRANSITION',
    );
  }

  const next: Evidence = {
    ...evidence,
    reviewStatus: 'submitted',
    updatedAt: at,
    version: evidence.version + 1,
  };

  return {
    evidence: next,
    event: {
      action: 'evidence.submitted',
      actor,
      metadata: { from: evidence.reviewStatus, to: next.reviewStatus },
    },
  };
}

/**
 * Withdraw evidence — controlled retraction, never destructive deletion.
 * The row and its full history remain; `withdrawnAt` and `reviewStatus`
 * record that it no longer counts, which is what makes a later audit of
 * "what did we take out, and when" possible at all.
 *
 * Permitted in every session status except `archived`, including `closed`:
 * a participant asking for their contribution to be removed after the
 * workshop ends is exactly the case this exists for, and it must not have
 * to wait for anything. There is deliberately no "restore" — re-entering
 * withdrawn content is a fresh capture, the same asymmetry
 * `participant-consent-record.ts` documents for consent withdrawal.
 */
export function withdrawEvidence(
  evidence: Evidence,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string | null,
  at: Date,
): EvidenceOutcome {
  if (sessionStatus === 'archived') {
    throw new InvariantViolation('An archived session is read-only.', 'SESSION_ARCHIVED');
  }

  if (evidence.withdrawnAt !== null) {
    throw new InvariantViolation('This evidence has already been withdrawn.', 'ALREADY_WITHDRAWN');
  }

  const next: Evidence = {
    ...evidence,
    reviewStatus: 'withdrawn',
    withdrawnAt: at,
    withdrawalReason: assertOptional(reason, WITHDRAWAL_REASON_MAX, 'WITHDRAWAL_REASON'),
    updatedAt: at,
    version: evidence.version + 1,
  };

  return {
    evidence: next,
    event: {
      action: 'evidence.withdrawn',
      actor,
      metadata:
        next.withdrawalReason === null
          ? { from: evidence.reviewStatus }
          : { from: evidence.reviewStatus, reason: next.withdrawalReason },
    },
  };
}

/**
 * Whether this evidence can still be edited — derived from state, not
 * stored, the same reasoning `canCaptureEvidence` uses on
 * `CoDesignSession`. Exposed so the API can tell a client what is possible
 * without the client reimplementing the rule.
 */
export function canEditEvidence(evidence: Evidence, sessionStatus: SessionStatus): boolean {
  return sessionStatus === 'open' && evidence.reviewStatus === 'draft';
}

/** Whether this evidence can still be submitted for review. */
export function canSubmitEvidence(evidence: Evidence, sessionStatus: SessionStatus): boolean {
  return (
    (sessionStatus === 'open' || sessionStatus === 'closed') && evidence.reviewStatus === 'draft'
  );
}

/** Whether this evidence can still be withdrawn. */
export function canWithdrawEvidence(evidence: Evidence, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && evidence.withdrawnAt === null;
}
