/**
 * KnowledgeProvenanceChain — ADR-0012's non-nullable, non-optional structural
 * requirement, made concrete for the evidence knowledge graph.
 *
 * "An assertion cannot be constructed without a ProvenanceChain" is enforced
 * here by the type system, not by convention: `createKnowledgeAssertion`
 * (in `knowledge-assertion.ts`) takes a `KnowledgeProvenanceChain` as a
 * required constructor argument, and this module's only way to produce one
 * is `createKnowledgeProvenanceChain`, which rejects every representable way
 * of skipping the guarantee — no source evidence, no confirming human, a
 * confirming actor that is not human.
 */

import { isHuman } from './actor.js';
import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import type { CandidateAssertionId, EvidenceId, KnowledgeProvenanceChainId } from './ids.js';

export const EXTRACTION_METHODS = ['human_manual', 'ai_model', 'rule_based'] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export interface SourceUtteranceRef {
  readonly transcriptId: string;
  readonly utteranceId: string;
  readonly startCharOffset: number;
  readonly endCharOffset: number;
}

export interface KnowledgeProvenanceChain {
  readonly id: KnowledgeProvenanceChainId;
  readonly candidateId: CandidateAssertionId | null;
  readonly sourceEvidenceIds: readonly EvidenceId[];
  readonly sourceUtteranceRefs: readonly SourceUtteranceRef[];
  readonly extractionMethod: ExtractionMethod;
  readonly extractionModel: string | null;
  readonly extractionModelVersion: string | null;
  readonly promptVersion: string | null;
  /** Consent categories checked and satisfied at confirmation time — a frozen snapshot, like `Evidence.consentBasis`. */
  readonly consentBasis: readonly string[];
  readonly confirmedBy: Actor;
  readonly confirmedAt: Date;
}

export interface CreateKnowledgeProvenanceChainInput {
  id: KnowledgeProvenanceChainId;
  candidateId?: CandidateAssertionId | null | undefined;
  sourceEvidenceIds: readonly EvidenceId[];
  sourceUtteranceRefs?: readonly SourceUtteranceRef[] | undefined;
  extractionMethod: string;
  extractionModel?: string | null | undefined;
  extractionModelVersion?: string | null | undefined;
  promptVersion?: string | null | undefined;
  consentBasis: readonly string[];
  confirmedBy: Actor;
  confirmedAt: Date;
}

function assertExtractionMethod(value: string): ExtractionMethod {
  if (!(EXTRACTION_METHODS as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised extraction method.`,
      'INVALID_EXTRACTION_METHOD',
    );
  }
  return value as ExtractionMethod;
}

export function createKnowledgeProvenanceChain(
  input: CreateKnowledgeProvenanceChainInput,
): KnowledgeProvenanceChain {
  if (input.sourceEvidenceIds.length === 0) {
    throw new InvariantViolation(
      'A provenance chain must cite at least one piece of source evidence — an assertion with no evidence is not representable.',
      'PROVENANCE_REQUIRES_EVIDENCE',
    );
  }

  // ADR-0012: only a human may confirm. This is the single most important
  // check in this file — every other invariant here is detail, this one is
  // the trust boundary.
  if (!isHuman(input.confirmedBy)) {
    throw new InvariantViolation(
      `Only a human actor may confirm knowledge into the institutional record, received actor kind '${input.confirmedBy.kind}'.`,
      'PROVENANCE_REQUIRES_HUMAN_CONFIRMATION',
    );
  }

  const extractionMethod = assertExtractionMethod(input.extractionMethod);

  if (extractionMethod === 'ai_model') {
    if (!input.extractionModel || !input.extractionModelVersion) {
      throw new InvariantViolation(
        'An ai_model provenance chain must name the model and its version — an unversioned model cannot be re-run or audited (P3).',
        'PROVENANCE_MODEL_VERSION_REQUIRED',
      );
    }
  }

  if (Number.isNaN(input.confirmedAt.getTime())) {
    throw new InvariantViolation('confirmedAt is not a valid date.', 'INVALID_DATE');
  }

  return {
    id: input.id,
    candidateId: input.candidateId ?? null,
    sourceEvidenceIds: [...input.sourceEvidenceIds],
    sourceUtteranceRefs: input.sourceUtteranceRefs ? [...input.sourceUtteranceRefs] : [],
    extractionMethod,
    extractionModel: input.extractionModel ?? null,
    extractionModelVersion: input.extractionModelVersion ?? null,
    promptVersion: input.promptVersion ?? null,
    consentBasis: [...input.consentBasis],
    confirmedBy: input.confirmedBy,
    confirmedAt: input.confirmedAt,
  };
}
