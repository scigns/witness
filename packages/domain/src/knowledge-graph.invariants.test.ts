/**
 * Invariant tests for the evidence knowledge graph domain layer
 * (ADR-0011, ADR-0012, ADR-0026). Mirrors the style of
 * `test/invariants/invariants.test.ts` at the repo root, scoped to what this
 * package alone can prove — cross-service and cross-tenant invariants are
 * covered at the `services/api-gateway` and `workers/graph-projector` layers.
 */

import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import {
  toActorId,
  toCandidateAssertionId,
  toKnowledgeAssertionId,
  toKnowledgeEntityId,
  toKnowledgeProvenanceChainId,
  toKnowledgeRelationshipId,
  toOrganisationId,
  toWorkspaceId,
  toEvidenceId,
  toEntityAliasId,
  toEntityMergeLogId,
} from './ids.js';
import { proposeCandidateAssertion, rejectCandidateAssertion } from './candidate-assertion.js';
import { createKnowledgeProvenanceChain } from './knowledge-provenance-chain.js';
import {
  confirmCandidateAssertion,
  transitionKnowledgeAssertion,
  publishKnowledgeAssertion,
} from './knowledge-assertion.js';
import { createKnowledgeEntity, mergeKnowledgeEntities } from './knowledge-entity.js';
import { addEntityAlias, carryAliasesIntoSurvivingEntity } from './entity-alias.js';
import { createKnowledgeRelationship } from './knowledge-relationship.js';
import { DEFAULT_VALIDATION_POLICY } from './assertion-lifecycle.js';
import { DomainError } from './errors.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(
    `Expected function to throw a DomainError with code '${code}', but it did not throw.`,
  );
}

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Reviewer',
};
const MODEL: Actor = {
  id: toActorId('22222222-2222-4222-8222-222222222222'),
  kind: 'model',
  displayName: 'ollama/llama3.3:70b',
};
const ORG = toOrganisationId('33333333-3333-4333-8333-333333333333');
const WORKSPACE = toWorkspaceId('44444444-4444-4444-8444-444444444444');
const EVIDENCE_A = toEvidenceId('55555555-5555-4555-8555-555555555555');
const NOW = new Date('2026-09-19T00:00:00Z');

describe('INV-KG-1: a candidate assertion always cites at least one piece of evidence', () => {
  it('rejects a candidate with no source evidence', () => {
    expectCode(
      () =>
        proposeCandidateAssertion({
          id: toCandidateAssertionId('66666666-6666-4666-8666-666666666666'),
          organisationId: ORG,
          workspaceId: WORKSPACE,
          assertionType: 'entity_attribute',
          payload: { attributeKey: 'role', attributeValue: 'Director of Housing' },
          sourceEvidenceIds: [],
          extractionMethod: 'human_manual',
          proposedBy: HUMAN,
          at: NOW,
        }),
      'CANDIDATE_REQUIRES_EVIDENCE',
    );
  });
});

describe('INV-KG-2: AI cannot create primary evidence, and cannot self-confirm', () => {
  it('an ai_model candidate still cites existing evidence, never creates it', () => {
    const { candidate } = proposeCandidateAssertion({
      id: toCandidateAssertionId('66666666-6666-4666-8666-666666666666'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      assertionType: 'entity_attribute',
      payload: { attributeKey: 'role', attributeValue: 'Director of Housing' },
      sourceEvidenceIds: [EVIDENCE_A],
      extractionMethod: 'ai_model',
      extractionModel: 'ollama/llama3.3',
      extractionModelVersion: '70b-instruct',
      proposedBy: MODEL,
      at: NOW,
    });
    expect(candidate.sourceEvidenceIds).toEqual([EVIDENCE_A]);
  });

  it('refuses to build a provenance chain confirmed by a model actor', () => {
    expectCode(
      () =>
        createKnowledgeProvenanceChain({
          id: toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777'),
          sourceEvidenceIds: [EVIDENCE_A],
          extractionMethod: 'ai_model',
          extractionModel: 'ollama/llama3.3',
          extractionModelVersion: '70b-instruct',
          consentBasis: ['knowledge_graph_inclusion'],
          confirmedBy: MODEL,
          confirmedAt: NOW,
        }),
      'PROVENANCE_REQUIRES_HUMAN_CONFIRMATION',
    );
  });

  it('refuses to confirm a candidate assertion with a model actor even given a valid provenance chain id', () => {
    expectCode(
      () =>
        confirmCandidateAssertion({
          id: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
          organisationId: ORG,
          workspaceId: WORKSPACE,
          candidateId: null,
          assertionType: 'entity_attribute',
          provenanceChainId: toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777'),
          confidence: 0.9,
          sensitivityClass: 'internal',
          confirmedBy: MODEL,
          at: NOW,
        }),
      'ASSERTION_REQUIRES_HUMAN_CONFIRMATION',
    );
  });
});

describe('INV-KG-3: every knowledge assertion has non-nullable provenance', () => {
  it('a confirmed assertion always carries a provenanceChainId', () => {
    const chain = createKnowledgeProvenanceChain({
      id: toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777'),
      sourceEvidenceIds: [EVIDENCE_A],
      extractionMethod: 'human_manual',
      consentBasis: ['knowledge_graph_inclusion'],
      confirmedBy: HUMAN,
      confirmedAt: NOW,
    });
    const { assertion } = confirmCandidateAssertion({
      id: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      candidateId: null,
      assertionType: 'entity_attribute',
      provenanceChainId: chain.id,
      confidence: 1,
      sensitivityClass: 'internal',
      confirmedBy: HUMAN,
      at: NOW,
    });
    expect(assertion.provenanceChainId).toBe(chain.id);
  });
});

describe('INV-KG-4: rejected candidates never produce an assertion', () => {
  it('there is no function that turns a rejected candidate into an assertion', () => {
    const { candidate } = proposeCandidateAssertion({
      id: toCandidateAssertionId('66666666-6666-4666-8666-666666666666'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      assertionType: 'entity_attribute',
      payload: { attributeKey: 'role', attributeValue: 'x' },
      sourceEvidenceIds: [EVIDENCE_A],
      extractionMethod: 'human_manual',
      proposedBy: HUMAN,
      at: NOW,
    });
    const { candidate: rejected } = rejectCandidateAssertion(
      candidate,
      HUMAN,
      'not supported by the evidence',
    );
    expect(rejected.status).toBe('rejected');
    // Attempting to review it again is refused — a rejected candidate is terminal.
    expectCode(() => rejectCandidateAssertion(rejected, HUMAN, 'again'), 'CANDIDATE_NOT_PENDING');
  });
});

describe('INV-KG-5: disagreement is preserved, never collapsed', () => {
  it('two assertions with opposing groupAttribution and perspective tags can coexist', () => {
    const chainId = toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777');
    const groupA = toKnowledgeEntityId('99999999-9999-4999-8999-999999999999');
    const groupB = toKnowledgeEntityId('9999999a-9999-4999-8999-999999999999');

    const { assertion: supports } = confirmCandidateAssertion({
      id: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      candidateId: null,
      assertionType: 'relationship',
      provenanceChainId: chainId,
      confidence: 1,
      sensitivityClass: 'internal',
      perspectiveTags: ['contested'],
      groupAttributionId: groupA,
      confirmedBy: HUMAN,
      at: NOW,
    });
    const { assertion: opposes } = confirmCandidateAssertion({
      id: toKnowledgeAssertionId('8888888a-8888-4888-8888-888888888888'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      candidateId: null,
      assertionType: 'relationship',
      provenanceChainId: chainId,
      confidence: 1,
      sensitivityClass: 'internal',
      perspectiveTags: ['contested'],
      groupAttributionId: groupB,
      confirmedBy: HUMAN,
      at: NOW,
    });

    // Both rows exist independently; nothing in this package merges them into one conclusion.
    expect(supports.groupAttributionId).toBe(groupA);
    expect(opposes.groupAttributionId).toBe(groupB);
    expect(supports.id).not.toBe(opposes.id);
  });
});

describe('INV-KG-6: publication respects the domain validation policy', () => {
  it('cannot publish externally when the policy prohibits it', () => {
    const chainId = toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777');
    const { assertion } = confirmCandidateAssertion({
      id: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      candidateId: null,
      assertionType: 'entity_attribute',
      provenanceChainId: chainId,
      confidence: 1,
      sensitivityClass: 'restricted',
      confirmedBy: HUMAN,
      at: NOW,
    });
    const policy = {
      ...DEFAULT_VALIDATION_POLICY,
      requiresReviewerValidation: false,
      permitsExternalPublication: false,
    };
    const { assertion: approved } = transitionKnowledgeAssertion(
      assertion,
      'approved',
      policy,
      HUMAN,
    );
    expectCode(
      () => publishKnowledgeAssertion(approved, 'external', policy, HUMAN),
      'EXTERNAL_PUBLICATION_PROHIBITED',
    );
    // Internal publication under the same policy is fine.
    const { assertion: published } = publishKnowledgeAssertion(approved, 'internal', policy, HUMAN);
    expect(published.lifecycleState).toBe('published');
  });

  it('requires community validation before approval when the domain requires it', () => {
    const chainId = toKnowledgeProvenanceChainId('77777777-7777-4777-8777-777777777777');
    const { assertion } = confirmCandidateAssertion({
      id: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      candidateId: null,
      assertionType: 'entity_attribute',
      provenanceChainId: chainId,
      confidence: 1,
      sensitivityClass: 'internal',
      confirmedBy: HUMAN,
      at: NOW,
    });
    const policy = {
      ...DEFAULT_VALIDATION_POLICY,
      requiresCommunityValidation: true,
      requiresReviewerValidation: false,
    };
    expectCode(
      () => transitionKnowledgeAssertion(assertion, 'approved', policy, HUMAN),
      'INVALID_ASSERTION_LIFECYCLE_TRANSITION',
    );
    const { assertion: validated } = transitionKnowledgeAssertion(
      assertion,
      'community_validated',
      policy,
      HUMAN,
    );
    const { assertion: approved } = transitionKnowledgeAssertion(
      validated,
      'approved',
      policy,
      HUMAN,
    );
    expect(approved.lifecycleState).toBe('approved');
  });
});

describe('INV-KG-7: merges preserve aliases and provenance, never delete them', () => {
  it('carries every alias of the merged entity onto the surviving entity, none dropped', () => {
    const surviving = createKnowledgeEntity({
      id: toKnowledgeEntityId('99999999-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'topic',
      topicScheme: 'cultural_concept',
      canonicalLabel: 'Climate Change',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;
    const merged = createKnowledgeEntity({
      id: toKnowledgeEntityId('9999999a-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'topic',
      topicScheme: 'cultural_concept',
      canonicalLabel: 'Changing Weather',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;

    const { alias: aliasOnMerged } = addEntityAlias({
      id: toEntityAliasId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      entityId: merged.id,
      aliasText: 'seasons have shifted',
      contributedBy: HUMAN,
      at: NOW,
    });

    const outcome = mergeKnowledgeEntities({
      mergeLogId: toEntityMergeLogId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      surviving,
      merged,
      rationale: 'Same concept, different community expression',
      reversibleUntil: new Date(NOW.getTime() + 1000),
      decidedBy: HUMAN,
      at: NOW,
    });

    const carried = carryAliasesIntoSurvivingEntity([aliasOnMerged], outcome.survivingEntity.id);
    expect(carried).toHaveLength(1);
    expect(carried[0]?.aliasText).toBe('seasons have shifted');
    expect(carried[0]?.entityId).toBe(outcome.survivingEntity.id);
    expect(outcome.mergedEntity.status).toBe('merged');
    expect(outcome.mergedEntity.mergedIntoId).toBe(surviving.id);
  });

  it('refuses to merge two community entities without elevated authority', () => {
    const a = createKnowledgeEntity({
      id: toKnowledgeEntityId('99999999-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'community',
      canonicalLabel: 'Vanua Council',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;
    const b = createKnowledgeEntity({
      id: toKnowledgeEntityId('9999999a-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'community',
      canonicalLabel: 'Vanua Committee',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;

    expectCode(
      () =>
        mergeKnowledgeEntities({
          mergeLogId: toEntityMergeLogId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
          surviving: a,
          merged: b,
          rationale: 'looks the same',
          reversibleUntil: new Date(NOW.getTime() + 1000),
          decidedBy: HUMAN,
          at: NOW,
        }),
      'MERGE_REQUIRES_ELEVATED_AUTHORITY',
    );
  });
});

describe('INV-KG-8: relationships require a registered type', () => {
  it('rejects an unregistered relationship type', () => {
    const from = createKnowledgeEntity({
      id: toKnowledgeEntityId('99999999-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'policy',
      canonicalLabel: 'Traditional Knowledge Protocol',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;
    const to = createKnowledgeEntity({
      id: toKnowledgeEntityId('9999999a-9999-4999-8999-999999999999'),
      organisationId: ORG,
      workspaceId: WORKSPACE,
      entityType: 'topic',
      topicScheme: 'general_concept',
      canonicalLabel: 'Community Consent',
      ontologyVersion: '0.1.0',
      createdBy: HUMAN,
      at: NOW,
    }).entity;

    expectCode(
      () =>
        createKnowledgeRelationship({
          id: toKnowledgeRelationshipId('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
          from,
          to,
          relationshipType: 'MADE_UP_TYPE',
          registeredTypeCodes: new Set(['REQUIRES']),
          assertionId: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
          createdBy: HUMAN,
          at: NOW,
        }),
      'UNREGISTERED_RELATIONSHIP_TYPE',
    );

    const { relationship } = createKnowledgeRelationship({
      id: toKnowledgeRelationshipId('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      from,
      to,
      relationshipType: 'REQUIRES',
      registeredTypeCodes: new Set(['REQUIRES']),
      assertionId: toKnowledgeAssertionId('88888888-8888-4888-8888-888888888888'),
      createdBy: HUMAN,
      at: NOW,
    });
    expect(relationship.relationshipType).toBe('REQUIRES');
  });
});
