/**
 * EntityMergeLog — the persisted record of a merge decision, separate from
 * the entity rows themselves (`DATA_MODEL.md` §3: `entity_merge_log`).
 * Paired with `mergeKnowledgeEntities` in `knowledge-entity.ts`, which
 * performs the actual state change; this module only shapes the log row and
 * the reversible-window check used by `reverseKnowledgeEntityMerge`.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { EntityMergeLogId, KnowledgeEntityId, OrganisationId, WorkspaceId } from './ids.js';

/** `KNOWLEDGE_GRAPH.md` §6: every merge is reversible for a defined window. */
export const DEFAULT_MERGE_REVERSIBLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface EntityMergeLog {
  readonly id: EntityMergeLogId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly survivingEntityId: KnowledgeEntityId;
  readonly mergedEntityId: KnowledgeEntityId;
  readonly decidedBy: Actor;
  readonly decidedAt: Date;
  readonly rationale: string;
  readonly reversibleUntil: Date;
  readonly reversedAt: Date | null;
}

export interface CreateEntityMergeLogInput {
  id: EntityMergeLogId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  survivingEntityId: KnowledgeEntityId;
  mergedEntityId: KnowledgeEntityId;
  decidedBy: Actor;
  decidedAt: Date;
  rationale: string;
  reversibleWindowMs?: number | undefined;
}

export function createEntityMergeLog(input: CreateEntityMergeLogInput): EntityMergeLog {
  const rationale = input.rationale.trim();
  if (rationale.length === 0) {
    throw new InvariantViolation(
      'A merge log requires a rationale.',
      'MERGE_LOG_RATIONALE_REQUIRED',
    );
  }
  const windowMs = input.reversibleWindowMs ?? DEFAULT_MERGE_REVERSIBLE_WINDOW_MS;

  return {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    survivingEntityId: input.survivingEntityId,
    mergedEntityId: input.mergedEntityId,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    rationale,
    reversibleUntil: new Date(input.decidedAt.getTime() + windowMs),
    reversedAt: null,
  };
}

export function markEntityMergeLogReversed(log: EntityMergeLog, at: Date): EntityMergeLog {
  if (log.reversedAt !== null) {
    throw new InvariantViolation('This merge is already reversed.', 'MERGE_ALREADY_REVERSED');
  }
  if (at.getTime() > log.reversibleUntil.getTime()) {
    throw new InvariantViolation(
      'This merge is outside its reversible window.',
      'MERGE_REVERSAL_WINDOW_EXPIRED',
    );
  }
  return { ...log, reversedAt: at };
}
