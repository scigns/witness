/**
 * KnowledgeAssertion — the confirmed, provenance-backed unit of institutional
 * knowledge (ADR-0012's `Assertion`, named to match the originating feature
 * request per ADR-0026 point 4). `entity_attribute` and `relationship` rows
 * (`knowledge-entity-attribute.ts`, `knowledge-relationship.ts`) each cite
 * exactly one `KnowledgeAssertion` for their provenance — this file governs
 * the assertion itself: its lifecycle, its perspective metadata, and the one
 * legal way to create one.
 *
 * There is no exported constructor that builds a `KnowledgeAssertion` from
 * raw input. The only way in is `confirmCandidateAssertion`, which requires
 * a `KnowledgeReviewDecision` (or an explicit facilitator-curation actor for
 * the no-AI path) plus a `KnowledgeProvenanceChain` — so an assertion without
 * a candidate behind it is still possible (manual facilitator curation,
 * Phase 3), but an assertion without provenance is not representable.
 */

import { isHuman } from './actor.js';
import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CandidateAssertionId,
  KnowledgeAssertionId,
  KnowledgeDomainId,
  KnowledgeEntityId,
  KnowledgeProvenanceChainId,
  OrganisationId,
  WorkspaceId,
} from './ids.js';
import type {
  AssertionLifecycleState,
  AccessScope,
  AssertionValidationPolicy,
} from './assertion-lifecycle.js';
import { assertLifecycleTransition, assertPublicationAllowed } from './assertion-lifecycle.js';
import type { SensitivityClass } from './knowledge-entity.js';
import type { CandidateAssertionType } from './candidate-assertion.js';

/**
 * Preserved verbatim from `KNOWLEDGE_GRAPH.md` §2.5/§ADR request:
 * disagreement and perspective metadata, multi-valued because more than one
 * can hold at once (an assertion can be both `CONTESTED` and
 * `CULTURALLY_SIGNIFICANT`).
 */
export const PERSPECTIVE_TAGS = [
  'contested',
  'minority_perspective',
  'culturally_significant',
  'unresolved',
  'community_restricted',
  'machine_inferred',
] as const;
export type PerspectiveTag = (typeof PERSPECTIVE_TAGS)[number];

export interface KnowledgeAssertion {
  readonly id: KnowledgeAssertionId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly knowledgeDomainId: KnowledgeDomainId | null;
  readonly candidateId: CandidateAssertionId | null;
  readonly assertionType: CandidateAssertionType;
  readonly provenanceChainId: KnowledgeProvenanceChainId;
  readonly confidence: number;
  readonly sensitivityClass: SensitivityClass;
  readonly lifecycleState: AssertionLifecycleState;
  readonly perspectiveTags: readonly PerspectiveTag[];
  /** Which community/group entity holds this perspective, for "Group A supports / Group B opposes" (never collapsed). */
  readonly groupAttributionId: KnowledgeEntityId | null;
  readonly accessScope: AccessScope;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly retractedAt: Date | null;
  readonly retractedReason: string | null;
  readonly recordedAt: Date;
  readonly createdBy: Actor;
  readonly version: number;
}

export interface KnowledgeAssertionOutcome {
  readonly assertion: KnowledgeAssertion;
  readonly event: PendingAuditEvent;
}

export interface ConfirmCandidateAssertionInput {
  id: KnowledgeAssertionId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  knowledgeDomainId?: KnowledgeDomainId | null | undefined;
  candidateId: CandidateAssertionId | null;
  assertionType: CandidateAssertionType;
  provenanceChainId: KnowledgeProvenanceChainId;
  confidence: number;
  sensitivityClass: SensitivityClass;
  perspectiveTags?: readonly string[] | undefined;
  groupAttributionId?: KnowledgeEntityId | null | undefined;
  validFrom?: Date | undefined;
  confirmedBy: Actor;
  at: Date;
}

function assertPerspectiveTag(value: string): PerspectiveTag {
  if (!(PERSPECTIVE_TAGS as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised perspective tag.`,
      'INVALID_PERSPECTIVE_TAG',
    );
  }
  return value as PerspectiveTag;
}

function assertPerspectiveTags(values: readonly string[] | undefined): readonly PerspectiveTag[] {
  if (!values) return [];
  return [...new Set(values.map(assertPerspectiveTag))];
}

/**
 * The one constructor. Confirmation must be a human act (ADR-0012) —
 * enforced again here, not only inside `createKnowledgeProvenanceChain`,
 * because a future call site could in principle build a provenance chain
 * once and reuse it; requiring the confirming actor to be human at both
 * points closes that gap defensively.
 */
export function confirmCandidateAssertion(
  input: ConfirmCandidateAssertionInput,
): KnowledgeAssertionOutcome {
  if (!isHuman(input.confirmedBy)) {
    throw new InvariantViolation(
      'Only a human may confirm a candidate into a knowledge assertion.',
      'ASSERTION_REQUIRES_HUMAN_CONFIRMATION',
    );
  }
  if (input.confidence < 0 || input.confidence > 1 || Number.isNaN(input.confidence)) {
    throw new InvariantViolation('Confidence must be between 0 and 1.', 'INVALID_CONFIDENCE');
  }

  const assertion: KnowledgeAssertion = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    knowledgeDomainId: input.knowledgeDomainId ?? null,
    candidateId: input.candidateId,
    assertionType: input.assertionType,
    provenanceChainId: input.provenanceChainId,
    confidence: input.confidence,
    sensitivityClass: input.sensitivityClass,
    // Confirmation by a facilitator without a preceding review is
    // `facilitator_curated`; a candidate confirmed via `KnowledgeReviewDecision`
    // enters at `evidence_reviewed` instead — the service layer chooses which
    // constructor path led here and passes the matching initial state via
    // `confirmCandidateAssertionAfterReview` below rather than this function
    // guessing from `candidateId` alone (a manually-curated assertion may
    // still have gone through review).
    lifecycleState: 'facilitator_curated',
    perspectiveTags: assertPerspectiveTags(input.perspectiveTags),
    groupAttributionId: input.groupAttributionId ?? null,
    accessScope: 'internal',
    validFrom: input.validFrom ?? input.at,
    validTo: null,
    retractedAt: null,
    retractedReason: null,
    recordedAt: input.at,
    createdBy: input.confirmedBy,
    version: 1,
  };

  return {
    assertion,
    event: {
      action: 'knowledge_assertion.confirmed',
      actor: input.confirmedBy,
      metadata: {
        assertionId: assertion.id,
        assertionType: assertion.assertionType,
        candidateId: assertion.candidateId ?? '',
        provenanceChainId: assertion.provenanceChainId,
        sensitivityClass: assertion.sensitivityClass,
        perspectiveTags: assertion.perspectiveTags.join(','),
      },
    },
  };
}

/** Same constructor, entered post-review — see the comment above. */
export function confirmCandidateAssertionAfterReview(
  input: ConfirmCandidateAssertionInput,
): KnowledgeAssertionOutcome {
  const outcome = confirmCandidateAssertion(input);
  return {
    assertion: { ...outcome.assertion, lifecycleState: 'evidence_reviewed' },
    event: outcome.event,
  };
}

export function transitionKnowledgeAssertion(
  assertion: KnowledgeAssertion,
  target: AssertionLifecycleState,
  policy: AssertionValidationPolicy,
  by: Actor,
): KnowledgeAssertionOutcome {
  assertLifecycleTransition(assertion.lifecycleState, target, policy);
  return {
    assertion: { ...assertion, lifecycleState: target, version: assertion.version + 1 },
    event: {
      action: 'knowledge_assertion.transitioned',
      actor: by,
      metadata: { assertionId: assertion.id, from: assertion.lifecycleState, to: target },
    },
  };
}

export function publishKnowledgeAssertion(
  assertion: KnowledgeAssertion,
  accessScope: AccessScope,
  policy: AssertionValidationPolicy,
  by: Actor,
): KnowledgeAssertionOutcome {
  assertPublicationAllowed(policy, accessScope);
  const transitioned = transitionKnowledgeAssertion(assertion, 'published', policy, by);
  return {
    assertion: { ...transitioned.assertion, accessScope },
    event: {
      action: 'knowledge_assertion.published',
      actor: by,
      metadata: { assertionId: assertion.id, accessScope },
    },
  };
}

export function retractKnowledgeAssertion(
  assertion: KnowledgeAssertion,
  reason: string,
  at: Date,
  by: Actor,
): KnowledgeAssertionOutcome {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'Retracting an assertion requires a reason.',
      'RETRACT_REASON_REQUIRED',
    );
  }
  if (assertion.retractedAt !== null) {
    throw new InvariantViolation('This assertion is already retracted.', 'ALREADY_RETRACTED');
  }
  return {
    assertion: {
      ...assertion,
      retractedAt: at,
      retractedReason: trimmed,
      version: assertion.version + 1,
    },
    event: {
      action: 'knowledge_assertion.retracted',
      actor: by,
      metadata: { assertionId: assertion.id, reason: trimmed },
    },
  };
}

export function addPerspectiveTag(
  assertion: KnowledgeAssertion,
  tag: string,
  by: Actor,
): KnowledgeAssertionOutcome {
  const validated = assertPerspectiveTag(tag);
  if (assertion.perspectiveTags.includes(validated)) {
    return {
      assertion,
      event: {
        action: 'knowledge_assertion.perspective_tag_unchanged',
        actor: by,
        metadata: { assertionId: assertion.id, tag: validated },
      },
    };
  }
  return {
    assertion: {
      ...assertion,
      perspectiveTags: [...assertion.perspectiveTags, validated],
      version: assertion.version + 1,
    },
    event: {
      action: 'knowledge_assertion.perspective_tag_added',
      actor: by,
      metadata: { assertionId: assertion.id, tag: validated },
    },
  };
}
