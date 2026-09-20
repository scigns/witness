/**
 * Assertion lifecycle — configurable per knowledge type/domain, per the
 * originating feature request ("do not require every assertion to pass
 * through every state... make validation policies configurable by knowledge
 * type/domain").
 *
 * `MACHINE_SUGGESTED` is deliberately not a state here — ADR-0026 point 4
 * maps it to `CandidateAssertion.status === 'pending'` with
 * `extractionMethod === 'ai_model'`, since a `KnowledgeAssertion` cannot
 * exist prior to human confirmation (ADR-0012). Everything below therefore
 * starts *after* confirmation.
 */

import { InvariantViolation } from './errors.js';

export const ASSERTION_LIFECYCLE_STATES = [
  'facilitator_curated',
  'evidence_reviewed',
  'community_validated',
  'approved',
  'published',
  'rejected',
  'superseded',
] as const;
export type AssertionLifecycleState = (typeof ASSERTION_LIFECYCLE_STATES)[number];

export const ACCESS_SCOPES = ['internal', 'organisation', 'external'] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

/**
 * Per knowledge-type/domain configuration (`KnowledgeDomain.governancePolicy`
 * fields feed this). Examples from the request: `CulturalConcept` sets
 * `requiresCommunityValidation: true`; a basic entity extraction leaves both
 * false, so `facilitator_curated -> approved` is a legal single hop;
 * `SensitiveKnowledge` sets `requiresCommunityValidation: true` and
 * `permitsExternalPublication: false`.
 */
export interface AssertionValidationPolicy {
  readonly requiresReviewerValidation: boolean;
  readonly requiresCommunityValidation: boolean;
  readonly permitsExternalPublication: boolean;
}

export const DEFAULT_VALIDATION_POLICY: AssertionValidationPolicy = Object.freeze({
  requiresReviewerValidation: true,
  requiresCommunityValidation: false,
  permitsExternalPublication: true,
});

/**
 * Legal forward transitions from each state, expressed once so the API/UI
 * layer can render "what can happen next" without re-deriving this table
 * (mirrors `Evidence.permittedActions`' role in `evidence.service.ts`).
 * `rejected` is reachable from every non-terminal state and is listed
 * per-state below rather than appended generically, so a future state added
 * to `ASSERTION_LIFECYCLE_STATES` cannot silently inherit it.
 */
function allowedNextStates(
  current: AssertionLifecycleState,
  policy: AssertionValidationPolicy,
): readonly AssertionLifecycleState[] {
  switch (current) {
    case 'facilitator_curated': {
      const next: AssertionLifecycleState[] = ['rejected'];
      if (policy.requiresReviewerValidation) next.push('evidence_reviewed');
      else if (policy.requiresCommunityValidation) next.push('community_validated');
      else next.push('approved');
      return next;
    }
    case 'evidence_reviewed': {
      const next: AssertionLifecycleState[] = ['rejected'];
      if (policy.requiresCommunityValidation) next.push('community_validated');
      else next.push('approved');
      return next;
    }
    case 'community_validated':
      return ['approved', 'rejected'];
    case 'approved':
      return ['published', 'superseded', 'rejected'];
    case 'published':
      return ['superseded'];
    case 'rejected':
      return [];
    case 'superseded':
      return [];
  }
}

export function canTransitionAssertionLifecycle(
  current: AssertionLifecycleState,
  target: AssertionLifecycleState,
  policy: AssertionValidationPolicy,
): boolean {
  return allowedNextStates(current, policy).includes(target);
}

export function assertLifecycleTransition(
  current: AssertionLifecycleState,
  target: AssertionLifecycleState,
  policy: AssertionValidationPolicy,
): void {
  if (!canTransitionAssertionLifecycle(current, target, policy)) {
    throw new InvariantViolation(
      `Cannot move a knowledge assertion from '${current}' to '${target}' under this domain's validation policy.`,
      'INVALID_ASSERTION_LIFECYCLE_TRANSITION',
    );
  }
}

/**
 * A `published` transition additionally checks access scope: sensitive
 * knowledge whose policy prohibits external publication may still be
 * published for internal/organisation audiences, but never `external`.
 */
export function assertPublicationAllowed(
  policy: AssertionValidationPolicy,
  accessScope: AccessScope,
): void {
  if (accessScope === 'external' && !policy.permitsExternalPublication) {
    throw new InvariantViolation(
      'This knowledge domain prohibits external publication.',
      'EXTERNAL_PUBLICATION_PROHIBITED',
    );
  }
}
