/**
 * EntityAlias — community language, preserved forever (ADR-0026 point 4;
 * the originating feature request's "KnowledgeAlias").
 *
 * Merging or normalising a concept must never delete the words a community
 * actually used. An alias row is immutable and additive-only: there is no
 * `updateAlias` or `removeAlias` in this file, on purpose. A wrong alias is
 * superseded by adding a corrected one, never edited in place — the wrong
 * one is itself evidence of how the concept was once understood.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EntityAliasId, EvidenceId, KnowledgeEntityId } from './ids.js';

export interface EntityAlias {
  readonly id: EntityAliasId;
  readonly entityId: KnowledgeEntityId;
  readonly aliasText: string;
  readonly language: string | null;
  /** The evidence in which this exact expression was used, when known. */
  readonly sourceEvidenceId: EvidenceId | null;
  readonly contributedBy: Actor;
  readonly createdAt: Date;
}

export interface EntityAliasOutcome {
  readonly alias: EntityAlias;
  readonly event: PendingAuditEvent;
}

const ALIAS_MAX = 300;

function assertAliasText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('An alias cannot be empty.', 'ALIAS_TEXT_REQUIRED');
  }
  if (trimmed.length > ALIAS_MAX) {
    throw new InvariantViolation(
      `An alias must be ${ALIAS_MAX} characters or fewer.`,
      'ALIAS_TEXT_TOO_LONG',
    );
  }
  return trimmed;
}

export interface AddEntityAliasInput {
  id: EntityAliasId;
  entityId: KnowledgeEntityId;
  aliasText: string;
  language?: string | null | undefined;
  sourceEvidenceId?: EvidenceId | null | undefined;
  contributedBy: Actor;
  at: Date;
}

export function addEntityAlias(input: AddEntityAliasInput): EntityAliasOutcome {
  const aliasText = assertAliasText(input.aliasText);

  const alias: EntityAlias = {
    id: input.id,
    entityId: input.entityId,
    aliasText,
    language: input.language?.trim() || null,
    sourceEvidenceId: input.sourceEvidenceId ?? null,
    contributedBy: input.contributedBy,
    createdAt: input.at,
  };

  return {
    alias,
    event: {
      action: 'entity_alias.added',
      actor: input.contributedBy,
      metadata: {
        entityId: alias.entityId,
        aliasText: alias.aliasText,
        language: alias.language ?? '',
        sourceEvidenceId: alias.sourceEvidenceId ?? '',
      },
    },
  };
}

/**
 * On merge, every alias of the merged entity is re-pointed to the surviving
 * entity — never deleted, never de-duplicated away. Two entities may have
 * separately accumulated the same alias text; both rows survive, because
 * each carries distinct provenance (who said it, in which evidence) even
 * when the text is identical.
 */
export function carryAliasesIntoSurvivingEntity(
  aliases: readonly EntityAlias[],
  survivingEntityId: KnowledgeEntityId,
): readonly EntityAlias[] {
  return aliases.map((alias) => ({ ...alias, entityId: survivingEntityId }));
}
