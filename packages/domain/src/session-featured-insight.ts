/**
 * SessionFeaturedInsight — a facilitator's deliberate choice to surface one
 * confirmed `KnowledgeAssertion` back to a live workshop's participants
 * ("what we're hearing so far"), Phase 6, Track E.
 *
 * Curation is human-only (same `isHuman` gate as `customer-story.ts`'s
 * moderator/publisher checks) — a machine-inferred assertion does not get to
 * decide it is ready to be shown to the room; a facilitator does. This is
 * also deliberately manual rather than automatic: ADR-0030's own governing
 * instruction for this track is that automatic live sensemaking is out of
 * scope, and manual curation of already-confirmed assertions is the
 * explicitly allowed fallback.
 *
 * Never features a *candidate* — only a `KnowledgeAssertionId` is accepted,
 * so this module cannot be used to show participants unreviewed, in-flux
 * content and call it "what we're hearing."
 *
 * Unfeaturing is retained, not deleted (`removedAt`), matching this
 * package's general provenance discipline (e.g.
 * `candidate-assertion.ts`'s rejections) — the fact that something was once
 * shown to a room is itself part of the session's record.
 */

import { InvariantViolation } from './errors.js';
import { isHuman, type Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  KnowledgeAssertionId,
  OrganisationId,
  SessionFeaturedInsightId,
  WorkspaceId,
} from './ids.js';

export interface SessionFeaturedInsight {
  readonly id: SessionFeaturedInsightId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly knowledgeAssertionId: KnowledgeAssertionId;
  readonly displayOrder: number;
  readonly curatedBy: Actor;
  readonly curatedAt: Date;
  readonly removedBy: Actor | null;
  readonly removedAt: Date | null;
}

export interface SessionFeaturedInsightOutcome {
  readonly insight: SessionFeaturedInsight;
  readonly event: PendingAuditEvent;
}

export interface FeatureInsightForSessionInput {
  id: SessionFeaturedInsightId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  knowledgeAssertionId: KnowledgeAssertionId;
  displayOrder: number;
  curatedBy: Actor;
  at: Date;
}

/**
 * `alreadyFeatured` is supplied by the caller (a database read the domain
 * may not perform, ADR-0003) — true when this assertion already has an
 * active (`removedAt === null`) featured-insight row for this session.
 */
export function featureInsightForSession(
  input: FeatureInsightForSessionInput,
  alreadyFeatured: boolean,
): SessionFeaturedInsightOutcome {
  if (!isHuman(input.curatedBy)) {
    throw new InvariantViolation(
      'Only a human facilitator may choose what the room sees as an emerging insight.',
      'HUMAN_CURATOR_REQUIRED',
    );
  }
  if (alreadyFeatured) {
    throw new InvariantViolation(
      'This assertion is already featured for this session.',
      'INSIGHT_ALREADY_FEATURED',
    );
  }
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new InvariantViolation(
      'Display order must be a non-negative whole number.',
      'INVALID_DISPLAY_ORDER',
    );
  }

  const insight: SessionFeaturedInsight = Object.freeze({
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    knowledgeAssertionId: input.knowledgeAssertionId,
    displayOrder: input.displayOrder,
    curatedBy: input.curatedBy,
    curatedAt: input.at,
    removedBy: null,
    removedAt: null,
  });

  return {
    insight,
    event: {
      action: 'session_featured_insight.added',
      actor: input.curatedBy,
      metadata: {
        insightId: insight.id,
        sessionId: insight.sessionId,
        knowledgeAssertionId: insight.knowledgeAssertionId,
      },
    },
  };
}

export function unfeatureInsight(
  insight: SessionFeaturedInsight,
  removedBy: Actor,
  at: Date,
): SessionFeaturedInsightOutcome {
  if (!isHuman(removedBy)) {
    throw new InvariantViolation(
      'Only a human facilitator may remove a featured insight.',
      'HUMAN_CURATOR_REQUIRED',
    );
  }
  if (insight.removedAt !== null) {
    throw new InvariantViolation(
      'This insight has already been removed.',
      'INSIGHT_ALREADY_REMOVED',
    );
  }

  const next: SessionFeaturedInsight = {
    ...insight,
    removedBy,
    removedAt: at,
  };

  return {
    insight: next,
    event: {
      action: 'session_featured_insight.removed',
      actor: removedBy,
      metadata: { insightId: insight.id, sessionId: insight.sessionId },
    },
  };
}

export function isCurrentlyFeatured(insight: SessionFeaturedInsight): boolean {
  return insight.removedAt === null;
}
