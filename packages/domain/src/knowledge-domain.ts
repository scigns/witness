/**
 * KnowledgeDomain — a workspace-scoped governance grouping (ADR-0026 point 3
 * — NOT a graph node type; the ratified thirteen-type ontology stays closed).
 *
 * Lets a project separate areas such as Community, Governance, Needs,
 * Problems, Ideas, Decisions, Cultural Knowledge, Outcomes and Commitments,
 * each with its own `AssertionValidationPolicy` and default sensitivity —
 * the mechanism behind "CulturalConcept may require community validation"
 * / "SensitiveKnowledge may require community validation and prohibit
 * external publication" / "basic entity extraction may require only
 * reviewer approval" from the originating request. `key` is a slug, not a
 * closed enum — an organisation may define additional domains.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { KnowledgeDomainId, OrganisationId, WorkspaceId } from './ids.js';
import type { AssertionValidationPolicy } from './assertion-lifecycle.js';
import { DEFAULT_VALIDATION_POLICY } from './assertion-lifecycle.js';
import type { SensitivityClass } from './knowledge-entity.js';

/** Suggested keys, matching the request's example list — not a closed gate, same convention as `SUGGESTED_EVIDENCE_TYPES`. */
export const SUGGESTED_KNOWLEDGE_DOMAIN_KEYS = [
  'community',
  'governance',
  'needs',
  'problems',
  'ideas',
  'decisions',
  'cultural_knowledge',
  'outcomes',
  'commitments',
] as const;

export interface KnowledgeDomain {
  readonly id: KnowledgeDomainId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly validationPolicy: AssertionValidationPolicy;
  readonly defaultSensitivity: SensitivityClass;
  readonly createdAt: Date;
  readonly createdBy: Actor;
  readonly version: number;
}

export interface KnowledgeDomainOutcome {
  readonly domain: KnowledgeDomain;
  readonly event: PendingAuditEvent;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const NAME_MAX = 200;

function assertKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!KEY_PATTERN.test(trimmed)) {
    throw new InvariantViolation(
      "A knowledge domain key must be lower-snake-case, e.g. 'cultural_knowledge'.",
      'INVALID_KNOWLEDGE_DOMAIN_KEY',
    );
  }
  return trimmed;
}

function assertName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'A knowledge domain must have a name.',
      'KNOWLEDGE_DOMAIN_NAME_REQUIRED',
    );
  }
  if (trimmed.length > NAME_MAX) {
    throw new InvariantViolation(
      `A knowledge domain name must be ${NAME_MAX} characters or fewer.`,
      'KNOWLEDGE_DOMAIN_NAME_TOO_LONG',
    );
  }
  return trimmed;
}

export interface CreateKnowledgeDomainInput {
  id: KnowledgeDomainId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  key: string;
  name: string;
  description?: string | null | undefined;
  validationPolicy?: Partial<AssertionValidationPolicy> | undefined;
  defaultSensitivity?: SensitivityClass;
  createdBy: Actor;
  at: Date;
}

export function createKnowledgeDomain(input: CreateKnowledgeDomainInput): KnowledgeDomainOutcome {
  const domain: KnowledgeDomain = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    key: assertKey(input.key),
    name: assertName(input.name),
    description: input.description?.trim() || null,
    validationPolicy: { ...DEFAULT_VALIDATION_POLICY, ...input.validationPolicy },
    defaultSensitivity: input.defaultSensitivity ?? 'internal',
    createdAt: input.at,
    createdBy: input.createdBy,
    version: 1,
  };

  return {
    domain,
    event: {
      action: 'knowledge_domain.created',
      actor: input.createdBy,
      metadata: {
        workspaceId: domain.workspaceId,
        key: domain.key,
        validationPolicy: JSON.stringify(domain.validationPolicy),
      },
    },
  };
}

export function updateKnowledgeDomainPolicy(
  domain: KnowledgeDomain,
  patch: Partial<AssertionValidationPolicy>,
  by: Actor,
): KnowledgeDomainOutcome {
  const validationPolicy = { ...domain.validationPolicy, ...patch };
  return {
    domain: { ...domain, validationPolicy, version: domain.version + 1 },
    event: {
      action: 'knowledge_domain.policy_updated',
      actor: by,
      metadata: { domainId: domain.id, validationPolicy: JSON.stringify(validationPolicy) },
    },
  };
}
