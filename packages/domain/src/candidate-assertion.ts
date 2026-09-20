/**
 * CandidateAssertion — ADR-0012's other half of the human-in-the-loop gate.
 *
 * "Candidates are a distinct type from assertions — not a status flag on the
 * same type — so the compiler prevents a candidate from being used where an
 * assertion is required." This file has no function that turns a
 * `CandidateAssertion` into a `KnowledgeAssertion`; that transformation lives
 * only in `knowledge-assertion.ts`'s `confirmCandidateAssertion`, and it is
 * the only path in, gated on a `KnowledgeReviewDecision` (`knowledge-review.ts`)
 * plus a `KnowledgeProvenanceChain` naming a human confirmer.
 *
 * A candidate always cites at least one `Evidence` id it was derived from —
 * this is what makes "AI never creates primary evidence" true structurally:
 * an extraction pipeline can produce a `CandidateAssertion` referencing
 * existing evidence, but there is no constructor here, or anywhere in this
 * package, that lets a candidate (or anything downstream of one) create an
 * `Evidence` row. Evidence is created only by `evidence.ts`'s
 * `captureEvidence`, called only from a human-facing capture flow.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CandidateAssertionId,
  EvidenceId,
  KnowledgeDomainId,
  OrganisationId,
  WorkspaceId,
} from './ids.js';
import type { ExtractionMethod, SourceUtteranceRef } from './knowledge-provenance-chain.js';

export const CANDIDATE_ASSERTION_TYPES = ['entity_attribute', 'relationship'] as const;
export type CandidateAssertionType = (typeof CANDIDATE_ASSERTION_TYPES)[number];

export const CANDIDATE_ASSERTION_STATUSES = [
  'pending',
  'confirmed',
  'corrected',
  'rejected',
  'superseded',
  'expired',
] as const;
export type CandidateAssertionStatus = (typeof CANDIDATE_ASSERTION_STATUSES)[number];

/**
 * Untyped by design: an entity-attribute candidate and a relationship
 * candidate carry different fields, and this package does not want a
 * discriminated union duplicating what `KnowledgeAssertion`'s own
 * `entity_attribute` / `relationship` split already expresses. The service
 * layer validates payload shape against the declared `assertionType` before
 * this constructor is called (schema validation happens at the API/service
 * boundary, per the originating request's "AI output must be
 * schema-constrained and validated before persistence").
 */
export type CandidateAssertionPayload = Readonly<Record<string, unknown>>;

export interface CandidateAssertion {
  readonly id: CandidateAssertionId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly knowledgeDomainId: KnowledgeDomainId | null;
  readonly assertionType: CandidateAssertionType;
  readonly payload: CandidateAssertionPayload;
  readonly sourceEvidenceIds: readonly EvidenceId[];
  readonly sourceUtteranceRefs: readonly SourceUtteranceRef[];
  /** Machine metadata only — never a substitute for human/community validation (ADR-0012). */
  readonly confidence: number | null;
  readonly extractionMethod: ExtractionMethod;
  readonly extractionModel: string | null;
  readonly extractionModelVersion: string | null;
  readonly promptVersion: string | null;
  readonly proposedBy: Actor;
  readonly status: CandidateAssertionStatus;
  readonly supersededByCandidateId: CandidateAssertionId | null;
  readonly createdAt: Date;
  readonly version: number;
}

export interface CandidateAssertionOutcome {
  readonly candidate: CandidateAssertion;
  readonly event: PendingAuditEvent;
}

export interface ProposeCandidateAssertionInput {
  id: CandidateAssertionId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  knowledgeDomainId?: KnowledgeDomainId | null | undefined;
  assertionType: string;
  payload: CandidateAssertionPayload;
  sourceEvidenceIds: readonly EvidenceId[];
  sourceUtteranceRefs?: readonly SourceUtteranceRef[] | undefined;
  confidence?: number | null | undefined;
  extractionMethod: string;
  extractionModel?: string | null | undefined;
  extractionModelVersion?: string | null | undefined;
  promptVersion?: string | null | undefined;
  proposedBy: Actor;
  at: Date;
}

function assertAssertionType(value: string): CandidateAssertionType {
  if (!(CANDIDATE_ASSERTION_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised candidate assertion type.`,
      'INVALID_CANDIDATE_ASSERTION_TYPE',
    );
  }
  return value as CandidateAssertionType;
}

function assertConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new InvariantViolation('Confidence must be between 0 and 1.', 'INVALID_CONFIDENCE');
  }
  return value;
}

export function proposeCandidateAssertion(
  input: ProposeCandidateAssertionInput,
): CandidateAssertionOutcome {
  if (input.sourceEvidenceIds.length === 0) {
    throw new InvariantViolation(
      'A candidate assertion must cite at least one piece of source evidence — an ungrounded suggestion is not a candidate, it is a hallucination with a UUID.',
      'CANDIDATE_REQUIRES_EVIDENCE',
    );
  }
  if (Object.keys(input.payload).length === 0) {
    throw new InvariantViolation(
      'A candidate assertion must carry a non-empty payload.',
      'CANDIDATE_PAYLOAD_REQUIRED',
    );
  }

  const assertionType = assertAssertionType(input.assertionType);
  const extractionMethod = input.extractionMethod as ExtractionMethod;
  if (
    extractionMethod === 'ai_model' &&
    (!input.extractionModel || !input.extractionModelVersion)
  ) {
    throw new InvariantViolation(
      'An ai_model candidate must name the model and its version at proposal time, not only at confirmation.',
      'CANDIDATE_MODEL_VERSION_REQUIRED',
    );
  }

  const candidate: CandidateAssertion = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    knowledgeDomainId: input.knowledgeDomainId ?? null,
    assertionType,
    payload: input.payload,
    sourceEvidenceIds: [...input.sourceEvidenceIds],
    sourceUtteranceRefs: input.sourceUtteranceRefs ? [...input.sourceUtteranceRefs] : [],
    confidence: assertConfidence(input.confidence),
    extractionMethod,
    extractionModel: input.extractionModel ?? null,
    extractionModelVersion: input.extractionModelVersion ?? null,
    promptVersion: input.promptVersion ?? null,
    proposedBy: input.proposedBy,
    status: 'pending',
    supersededByCandidateId: null,
    createdAt: input.at,
    version: 1,
  };

  return {
    candidate,
    event: {
      action: 'knowledge_candidate.proposed',
      actor: input.proposedBy,
      metadata: {
        candidateId: candidate.id,
        assertionType: candidate.assertionType,
        extractionMethod: candidate.extractionMethod,
        sourceEvidenceIds: candidate.sourceEvidenceIds.join(','),
        confidence: candidate.confidence === null ? '' : String(candidate.confidence),
      },
    },
  };
}

function assertPending(candidate: CandidateAssertion): void {
  if (candidate.status !== 'pending') {
    throw new InvariantViolation(
      `Candidate assertion is '${candidate.status}', not 'pending' — it has already been decided.`,
      'CANDIDATE_NOT_PENDING',
    );
  }
}

/** Reject a candidate. Rejections are retained (never deleted) — they are the evaluation signal ADR-0012 relies on. */
export function rejectCandidateAssertion(
  candidate: CandidateAssertion,
  rejectedBy: Actor,
  rationale: string,
): CandidateAssertionOutcome {
  assertPending(candidate);
  const trimmed = rationale.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'Rejecting a candidate requires a rationale.',
      'REJECT_RATIONALE_REQUIRED',
    );
  }
  return {
    candidate: { ...candidate, status: 'rejected', version: candidate.version + 1 },
    event: {
      action: 'knowledge_candidate.rejected',
      actor: rejectedBy,
      metadata: { candidateId: candidate.id, rationale: trimmed },
    },
  };
}

export function expireCandidateAssertion(
  candidate: CandidateAssertion,
  by: Actor,
): CandidateAssertionOutcome {
  assertPending(candidate);
  return {
    candidate: { ...candidate, status: 'expired', version: candidate.version + 1 },
    event: {
      action: 'knowledge_candidate.expired',
      actor: by,
      metadata: { candidateId: candidate.id },
    },
  };
}

/**
 * Mark a candidate confirmed or corrected. Called by the same transaction
 * that creates the resulting `KnowledgeAssertion` — this function only
 * updates the candidate's own status/version, it does not construct the
 * assertion (see `knowledge-assertion.ts`).
 */
export function markCandidateDecided(
  candidate: CandidateAssertion,
  decision: 'confirmed' | 'corrected',
  by: Actor,
): CandidateAssertionOutcome {
  assertPending(candidate);
  return {
    candidate: { ...candidate, status: decision, version: candidate.version + 1 },
    event: {
      action:
        decision === 'confirmed'
          ? 'knowledge_candidate.confirmed'
          : 'knowledge_candidate.corrected',
      actor: by,
      metadata: { candidateId: candidate.id },
    },
  };
}
