/**
 * KnowledgeEntityAttribute — a single provenance-backed fact about an entity
 * (`DATA_MODEL.md` §3, "Knowledge entities"). "We never store 'Alice is the
 * Director of Housing.' We store ... a candidate that human H confirmed,
 * asserting Alice held the role Director of Housing" — this row is the
 * stored form of that sentence: `attributeKey`/`attributeValue` plus the
 * `assertionId` that makes it more than a claim.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { KnowledgeAssertionId, KnowledgeEntityAttributeId, KnowledgeEntityId } from './ids.js';

export interface KnowledgeEntityAttribute {
  readonly id: KnowledgeEntityAttributeId;
  readonly entityId: KnowledgeEntityId;
  readonly attributeKey: string;
  readonly attributeValue: string;
  readonly assertionId: KnowledgeAssertionId;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly createdAt: Date;
  readonly createdBy: Actor;
}

export interface KnowledgeEntityAttributeOutcome {
  readonly attribute: KnowledgeEntityAttribute;
  readonly event: PendingAuditEvent;
}

const KEY_MAX = 100;
const VALUE_MAX = 4000;

export interface SetKnowledgeEntityAttributeInput {
  id: KnowledgeEntityAttributeId;
  entityId: KnowledgeEntityId;
  attributeKey: string;
  attributeValue: string;
  assertionId: KnowledgeAssertionId;
  validFrom?: Date | undefined;
  validTo?: Date | null | undefined;
  createdBy: Actor;
  at: Date;
}

export function setKnowledgeEntityAttribute(
  input: SetKnowledgeEntityAttributeInput,
): KnowledgeEntityAttributeOutcome {
  const key = input.attributeKey.trim();
  const value = input.attributeValue.trim();
  if (key.length === 0 || key.length > KEY_MAX) {
    throw new InvariantViolation(
      `attributeKey must be 1-${KEY_MAX} characters.`,
      'INVALID_ATTRIBUTE_KEY',
    );
  }
  if (value.length === 0 || value.length > VALUE_MAX) {
    throw new InvariantViolation(
      `attributeValue must be 1-${VALUE_MAX} characters.`,
      'INVALID_ATTRIBUTE_VALUE',
    );
  }

  const attribute: KnowledgeEntityAttribute = {
    id: input.id,
    entityId: input.entityId,
    attributeKey: key,
    attributeValue: value,
    assertionId: input.assertionId,
    validFrom: input.validFrom ?? input.at,
    validTo: input.validTo ?? null,
    createdAt: input.at,
    createdBy: input.createdBy,
  };

  return {
    attribute,
    event: {
      action: 'knowledge_entity_attribute.set',
      actor: input.createdBy,
      metadata: {
        entityId: attribute.entityId,
        attributeKey: attribute.attributeKey,
        assertionId: attribute.assertionId,
      },
    },
  };
}
