/**
 * What an institutional outcome rests on (BUILD_ROADMAP.md Milestone 7,
 * Decisions, Commitments and Actions).
 *
 * A decision, commitment or action that an institution treats as binding has
 * to be answerable to the question "on what basis?". This module is the one
 * place that answers it, and the one place that refuses to answer it badly.
 *
 * There are exactly two admissible bases, and the distinction is the point:
 *
 * - `validated_evidence` — the outcome rests on something a reviewer
 *   examined and validated (Milestone 6). The link records the evidence's
 *   id, the *version* that was validated, and the verification status at
 *   link time, so a later correction to that evidence cannot silently
 *   change what the outcome was justified by.
 * - `institutional_synthesis` — the outcome rests on the institution's own
 *   judgement rather than on any one piece of evidence. Legitimate, common,
 *   and required to be *stated*: a rationale is mandatory, because an
 *   outcome with no evidence and no stated reasoning is indistinguishable
 *   from one somebody made up.
 *
 * Every other basis is rejected. `assertEvidenceSupportable` below is the
 * gate: evidence that is still `draft`/`submitted`/`under_review`/
 * `needs_clarification` has not been validated by anyone, and evidence that
 * is `rejected` or `withdrawn` was examined and found wanting or retracted.
 * Neither can carry an institutional outcome. Cross-workspace and
 * cross-organisation evidence is refused for the same reason
 * `evidence-link.ts` refuses it — an outcome in one workspace must not be
 * justified by material its readers cannot see.
 *
 * The "can this caller actually reach that evidence" half of the rule needs
 * a database read and an authorisation decision, so it is not here (ADR-0003);
 * `OutcomeSupportService` performs it before calling in, the same split
 * `assertAttributionCompatibility` and `ConsentPolicyService` established
 * for capture in Milestone 5.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EvidenceReviewStatus, EvidenceVerificationStatus } from './evidence.js';
import type {
  CoDesignSessionId,
  EvidenceId,
  OrganisationId,
  OutcomeSupportId,
  WorkspaceId,
} from './ids.js';

const RATIONALE_MAX = 4000;
const NOTE_MAX = 2000;

/** Which kind of outcome a support record belongs to. */
export const OUTCOME_TYPES = ['decision', 'commitment', 'action_item'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/** How an outcome is justified. See the file header for why there are only two. */
export const OUTCOME_SUPPORT_BASES = ['validated_evidence', 'institutional_synthesis'] as const;
export type OutcomeSupportBasis = (typeof OUTCOME_SUPPORT_BASES)[number];

/**
 * The evidence facts this module needs in order to decide. Supplied by the
 * service layer from a row it has already scoped and authorised — the
 * domain never reads them itself.
 */
export interface SupportingEvidenceRef {
  readonly id: EvidenceId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly reviewStatus: EvidenceReviewStatus;
  readonly verificationStatus: EvidenceVerificationStatus;
  readonly version: number;
}

/** The outcome's own scope, for the cross-boundary checks below. */
export interface OutcomeScope {
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
}

/**
 * The single gate on evidence-backed support.
 *
 * Rejects, by name rather than by a catch-all: evidence that has not been
 * validated, evidence that was rejected or withdrawn, evidence whose
 * verification status disagrees with its review status (a state that should
 * be unreachable, checked anyway because this is the last place it would be
 * caught), and evidence from another workspace or organisation.
 */
export function assertEvidenceSupportable(
  evidence: SupportingEvidenceRef,
  outcome: OutcomeScope,
): void {
  if (evidence.organisationId !== outcome.organisationId) {
    throw new InvariantViolation(
      'An outcome cannot be supported by evidence from another organisation.',
      'EVIDENCE_CROSS_ORGANISATION',
    );
  }

  if (evidence.workspaceId !== outcome.workspaceId) {
    throw new InvariantViolation(
      'An outcome cannot be supported by evidence from another workspace.',
      'EVIDENCE_CROSS_WORKSPACE',
    );
  }

  if (evidence.reviewStatus !== 'validated') {
    throw new InvariantViolation(
      `Only validated evidence can support an institutional outcome — this evidence is '${evidence.reviewStatus}'.`,
      'EVIDENCE_NOT_VALIDATED',
    );
  }

  if (evidence.verificationStatus !== 'verified') {
    throw new InvariantViolation(
      `Evidence marked '${evidence.verificationStatus}' cannot support an institutional outcome.`,
      'EVIDENCE_NOT_VERIFIED',
    );
  }
}

export interface OutcomeSupport {
  readonly id: OutcomeSupportId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly outcomeType: OutcomeType;
  /** The decision/commitment/action this supports, widened to `string` — see `AuditEvent.subjectId`. */
  readonly outcomeId: string;
  readonly basis: OutcomeSupportBasis;
  /** Present only for `validated_evidence`. */
  readonly evidenceId: EvidenceId | null;
  /**
   * The evidence version that was validated when this link was made. A later
   * correction bumps the evidence's own version; this one does not move, so
   * "what did we actually rely on" survives the correction.
   */
  readonly evidenceVersion: number | null;
  /** The evidence's verification status at link time, frozen for the same reason. */
  readonly evidenceVerificationStatus: EvidenceVerificationStatus | null;
  /** Required for `institutional_synthesis`; optional commentary otherwise. */
  readonly rationale: string | null;
  readonly note: string | null;
  readonly recordedBy: Actor;
  readonly recordedAt: Date;
  readonly createdAt: Date;
}

export interface OutcomeSupportOutcome {
  readonly support: OutcomeSupport;
  readonly event: PendingAuditEvent;
}

function assertOptionalText(
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

export interface RecordEvidenceSupportInput {
  id: OutcomeSupportId;
  sessionId: CoDesignSessionId;
  outcomeType: OutcomeType;
  outcomeId: string;
  scope: OutcomeScope;
  evidence: SupportingEvidenceRef;
  note?: string | null | undefined;
  recordedBy: Actor;
  at: Date;
}

/** Attach validated evidence to an outcome, freezing what was relied on. */
export function recordEvidenceSupport(input: RecordEvidenceSupportInput): OutcomeSupportOutcome {
  assertEvidenceSupportable(input.evidence, input.scope);

  const support: OutcomeSupport = {
    id: input.id,
    organisationId: input.scope.organisationId,
    workspaceId: input.scope.workspaceId,
    sessionId: input.sessionId,
    outcomeType: input.outcomeType,
    outcomeId: input.outcomeId,
    basis: 'validated_evidence',
    evidenceId: input.evidence.id,
    evidenceVersion: input.evidence.version,
    evidenceVerificationStatus: input.evidence.verificationStatus,
    rationale: null,
    note: assertOptionalText(input.note, NOTE_MAX, 'NOTE'),
    recordedBy: input.recordedBy,
    recordedAt: input.at,
    createdAt: input.at,
  };

  return {
    support,
    event: {
      action: 'outcome_support.evidence_linked',
      actor: input.recordedBy,
      metadata: {
        outcomeType: support.outcomeType,
        outcomeId: support.outcomeId,
        evidenceId: input.evidence.id,
        evidenceVersion: String(input.evidence.version),
      },
    },
  };
}

export interface RecordSynthesisSupportInput {
  id: OutcomeSupportId;
  sessionId: CoDesignSessionId;
  outcomeType: OutcomeType;
  outcomeId: string;
  scope: OutcomeScope;
  rationale: string;
  recordedBy: Actor;
  at: Date;
}

/**
 * Record that an outcome rests on the institution's own synthesis rather
 * than on a specific piece of evidence. The rationale is required — that
 * requirement is the entire reason this basis is admissible at all.
 */
export function recordSynthesisSupport(input: RecordSynthesisSupportInput): OutcomeSupportOutcome {
  const rationale = input.rationale.trim();
  if (rationale.length === 0) {
    throw new InvariantViolation(
      'Institutional synthesis must state its rationale — an outcome with neither evidence nor reasoning is not accountable.',
      'SYNTHESIS_RATIONALE_REQUIRED',
    );
  }
  if (rationale.length > RATIONALE_MAX) {
    throw new InvariantViolation(
      `A rationale must be ${RATIONALE_MAX} characters or fewer, received ${rationale.length}.`,
      'SYNTHESIS_RATIONALE_TOO_LONG',
    );
  }

  const support: OutcomeSupport = {
    id: input.id,
    organisationId: input.scope.organisationId,
    workspaceId: input.scope.workspaceId,
    sessionId: input.sessionId,
    outcomeType: input.outcomeType,
    outcomeId: input.outcomeId,
    basis: 'institutional_synthesis',
    evidenceId: null,
    evidenceVersion: null,
    evidenceVerificationStatus: null,
    rationale,
    note: null,
    recordedBy: input.recordedBy,
    recordedAt: input.at,
    createdAt: input.at,
  };

  return {
    support,
    event: {
      action: 'outcome_support.synthesis_recorded',
      actor: input.recordedBy,
      metadata: { outcomeType: support.outcomeType, outcomeId: support.outcomeId },
    },
  };
}

/** Remove a support record. Emits an audit event; the caller deletes the row. */
export function removeOutcomeSupport(support: OutcomeSupport, actor: Actor): PendingAuditEvent {
  return {
    action: 'outcome_support.removed',
    actor,
    metadata: {
      outcomeType: support.outcomeType,
      outcomeId: support.outcomeId,
      basis: support.basis,
      evidenceId: support.evidenceId ?? '',
    },
  };
}

/**
 * Whether a set of support records is enough to make a *specific* outcome
 * authoritative — at least one admissible basis that actually belongs to it.
 *
 * The ownership check is not paranoia about the caller's query. It is what
 * makes the guard mean what it says: a list of support records is just an
 * array, and an aggregate that accepts any non-empty array would be satisfied
 * by another outcome's evidence. The service loads support by outcome id, so
 * this cannot happen through the API today — but "cannot happen today" is a
 * property of a caller, and this is the function that has to hold regardless
 * of who calls it.
 */
export function hasAdmissibleSupport(
  supports: readonly OutcomeSupport[],
  outcomeId: string,
): boolean {
  return supports.some((support) => support.outcomeId === outcomeId);
}

/**
 * The guard each outcome's confirm/activate mutator calls. Separate from
 * `hasAdmissibleSupport` so the failure carries the outcome's own vocabulary
 * rather than a generic false.
 */
export function assertSupported(
  supports: readonly OutcomeSupport[],
  outcomeId: string,
  what: string,
): void {
  if (!hasAdmissibleSupport(supports, outcomeId)) {
    throw new InvariantViolation(
      `A ${what} must rest on validated evidence or a stated institutional synthesis before it can be made authoritative.`,
      'OUTCOME_NOT_SUPPORTED',
    );
  }
}
