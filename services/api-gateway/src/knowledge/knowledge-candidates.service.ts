/**
 * CandidateAssertion propose + review. This is the minimal manual-creation
 * surface needed to exercise Phase 1+2 end-to-end (ADR-0026's "Negative"
 * consequence: the full curated Phase 3 workflow — bulk review queues,
 * richer steward tooling — is follow-on work). No AI extraction path exists
 * yet, so `extractionMethod` is always `human_manual` here.
 *
 * Approval is the one place all of this pass's guarantees meet in one
 * transaction: a `KnowledgeProvenanceChain` is constructed (rejecting a
 * non-human confirmer or missing evidence), a `KnowledgeAssertion` is
 * confirmed from it, the corresponding `KnowledgeEntityAttribute` or
 * `KnowledgeRelationship` row is written, and an outbox event is appended —
 * all inside one Prisma transaction, so a failure at any step leaves no
 * partial graph-assertion behind.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  confirmCandidateAssertionAfterReview,
  setKnowledgeEntityAttribute,
  createKnowledgeProvenanceChain,
  createKnowledgeRelationship,
  markCandidateDecided,
  proposeCandidateAssertion,
  recordKnowledgeReviewDecision,
  rejectCandidateAssertion,
  toCandidateAssertionId,
  toEvidenceId,
  toKnowledgeAssertionId,
  toKnowledgeDomainId,
  toKnowledgeEntityAttributeId,
  toKnowledgeEntityId,
  toKnowledgeProvenanceChainId,
  toKnowledgeRelationshipId,
  toKnowledgeReviewDecisionId,
  toOrganisationId,
  toWorkspaceId,
  InvariantViolation,
  DEFAULT_VALIDATION_POLICY,
  type AssertionValidationPolicy,
} from '@witness/domain';
import type {
  CandidateAssertionView,
  ProposeCandidateAssertionRequest,
  ReviewCandidateAssertionRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { appendOutboxEvent } from '../infrastructure/outbox.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { Principal } from '../authz/authorization.port.js';

type CandidateRow = Awaited<
  ReturnType<PrismaService['knowledgeCandidateAssertion']['findFirstOrThrow']>
> & {
  proposedBy: { displayName: string };
};

function toView(row: CandidateRow): CandidateAssertionView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    knowledgeDomainId: row.knowledgeDomainId,
    assertionType: row.assertionType as CandidateAssertionView['assertionType'],
    payload: row.payload as Record<string, unknown>,
    sourceEvidenceIds: row.sourceEvidenceIds,
    confidence: row.confidence,
    extractionMethod: row.extractionMethod as CandidateAssertionView['extractionMethod'],
    proposedByName: row.proposedBy.displayName,
    status: row.status as CandidateAssertionView['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class KnowledgeCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
  ) {}

  async list(workspaceId: string, status?: string): Promise<CandidateAssertionView[]> {
    const rows = await this.prisma.knowledgeCandidateAssertion.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      include: { proposedBy: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toView);
  }

  async get(workspaceId: string, candidateId: string): Promise<CandidateAssertionView> {
    const row = await this.prisma.knowledgeCandidateAssertion.findFirst({
      where: { id: candidateId, workspaceId },
      include: { proposedBy: true },
    });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Candidate assertion not found.' },
      });
    }
    return toView(row);
  }

  async propose(
    organisationId: string,
    workspaceId: string,
    request: ProposeCandidateAssertionRequest,
    principal: Principal,
  ): Promise<CandidateAssertionView> {
    // Evidence must exist and be in scope — "AI never creates primary
    // evidence" cuts both ways: a candidate can only ever point at real,
    // already-captured evidence, never conjure it.
    const evidenceRows = await this.prisma.evidence.findMany({
      where: { id: { in: request.sourceEvidenceIds }, workspaceId },
      select: { id: true, sessionId: true, sourceParticipantId: true },
    });
    if (evidenceRows.length !== request.sourceEvidenceIds.length) {
      throw new BadRequestException({
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: 'One or more source evidence ids were not found in this workspace.',
        },
      });
    }

    // The consent gate this whole feature depends on: a participant's
    // words may only enter the knowledge graph if they consented to that
    // specific category (`knowledge_graph_inclusion`,
    // packages/domain/src/consent-decision.ts's `mayIncludeInKnowledgeGraph`).
    // Evidence with no source participant (facilitator observation,
    // institutional source) carries no personal-data consent question here.
    for (const row of evidenceRows) {
      if (row.sourceParticipantId === null) continue;
      const answer = await this.consentPolicy.mayIncludeInKnowledgeGraph(
        row.sessionId,
        row.sourceParticipantId,
      );
      if (!answer.allowed) {
        throw new ForbiddenException({
          error: { code: 'CONSENT_NOT_GRANTED', message: answer.reason },
        });
      }
    }

    if (request.knowledgeDomainId) {
      const domain = await this.prisma.knowledgeDomain.findFirst({
        where: { id: request.knowledgeDomainId, workspaceId },
      });
      if (domain === null) {
        throw new BadRequestException({
          error: {
            code: 'KNOWLEDGE_DOMAIN_NOT_FOUND',
            message: 'Knowledge domain not found in this workspace.',
          },
        });
      }
    }

    // Every entity a candidate references must already exist *in this
    // workspace* — checked here (fail fast, at the point a contributor
    // learns about it) and again at approval time in `review()` (defense
    // in depth, matching this schema's tenancy convention of never relying
    // on a single check — ADR-0013). Without this, a candidate could name
    // an entity id belonging to another organisation's workspace, and
    // approval would silently create a cross-tenant graph edge or
    // attribute — exactly the traversal this feature must never allow.
    await this.assertPayloadEntitiesInWorkspace(this.prisma, workspaceId, request.payload);

    const actor = await resolveActor(this.prisma, principal);
    let outcome: ReturnType<typeof proposeCandidateAssertion>;
    try {
      outcome = proposeCandidateAssertion({
        id: toCandidateAssertionId(randomUUID()),
        organisationId: toOrganisationId(organisationId),
        workspaceId: toWorkspaceId(workspaceId),
        knowledgeDomainId: request.knowledgeDomainId
          ? toKnowledgeDomainId(request.knowledgeDomainId)
          : null,
        assertionType: request.payload.assertionType,
        payload: request.payload,
        sourceEvidenceIds: request.sourceEvidenceIds.map(toEvidenceId),
        confidence: request.confidence ?? null,
        extractionMethod: 'human_manual',
        proposedBy: actor,
        at: new Date(),
      });
    } catch (error) {
      if (error instanceof InvariantViolation) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeCandidateAssertion.create({
        data: {
          id: outcome.candidate.id,
          organisationId: outcome.candidate.organisationId,
          workspaceId: outcome.candidate.workspaceId,
          knowledgeDomainId: outcome.candidate.knowledgeDomainId,
          assertionType: outcome.candidate.assertionType,
          payload: outcome.candidate.payload as object,
          sourceEvidenceIds: [...outcome.candidate.sourceEvidenceIds],
          confidence: outcome.candidate.confidence,
          extractionMethod: outcome.candidate.extractionMethod,
          proposedById: outcome.candidate.proposedBy.id,
          status: outcome.candidate.status,
          createdAt: outcome.candidate.createdAt,
          version: outcome.candidate.version,
        },
        include: { proposedBy: true },
      });
      await appendAuditEvent(
        tx,
        'candidate_assertion',
        created.id,
        outcome.event,
        outcome.candidate.createdAt,
      );
      return created;
    });

    return toView(row);
  }

  /**
   * Every entity id a candidate payload names must resolve inside
   * `workspaceId` — never merely "exist somewhere". `findFirst` with both
   * `id` and `workspaceId` in the `where` clause, not `findUnique` on `id`
   * alone, is the load-bearing difference (see this file's other call of
   * this check, in `review()`, for why both call sites matter).
   */
  private async assertPayloadEntitiesInWorkspace(
    client: Pick<PrismaService, 'knowledgeEntity' | 'relationshipTypeDefinition'>,
    workspaceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entityIds: string[] =
      payload['assertionType'] === 'entity_attribute'
        ? [String(payload['entityId'])]
        : [String(payload['fromEntityId']), String(payload['toEntityId'])];

    const found = await client.knowledgeEntity.findMany({
      where: { id: { in: entityIds }, workspaceId },
      select: { id: true },
    });
    const foundIds = new Set(found.map((e) => e.id));
    const missing = entityIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `One or more entities were not found in this workspace: ${missing.join(', ')}.`,
        },
      });
    }

    if (payload['assertionType'] === 'relationship') {
      const relationshipType = String(payload['relationshipType']);
      const typeDef = await client.relationshipTypeDefinition.findUnique({
        where: { code: relationshipType },
      });
      if (typeDef === null) {
        throw new BadRequestException({
          error: {
            code: 'UNREGISTERED_RELATIONSHIP_TYPE',
            message: `'${relationshipType}' is not a registered relationship type.`,
          },
        });
      }
    }
  }

  async review(
    organisationId: string,
    workspaceId: string,
    candidateId: string,
    request: ReviewCandidateAssertionRequest,
    principal: Principal,
  ): Promise<CandidateAssertionView> {
    const candidateRow = await this.prisma.knowledgeCandidateAssertion.findFirst({
      where: { id: candidateId, workspaceId },
      include: { proposedBy: true },
    });
    if (candidateRow === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Candidate assertion not found.' },
      });
    }
    if (candidateRow.status !== 'pending') {
      throw new BadRequestException({
        error: {
          code: 'CANDIDATE_NOT_PENDING',
          message: `Candidate is '${candidateRow.status}', not 'pending'.`,
        },
      });
    }

    const reviewer = await resolveActor(this.prisma, principal);
    const now = new Date();
    const reviewStartedAt = new Date(request.reviewStartedAt);

    let reviewOutcome: ReturnType<typeof recordKnowledgeReviewDecision>;
    try {
      reviewOutcome = recordKnowledgeReviewDecision({
        id: toKnowledgeReviewDecisionId(randomUUID()),
        candidateId: toCandidateAssertionId(candidateId),
        reviewer,
        decision: request.decision,
        correctedPayload: request.correctedPayload,
        rationale: request.rationale,
        decidedAt: now,
        reviewStartedAt,
      });
    } catch (error) {
      if (error instanceof InvariantViolation) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }

    const effectivePayload = (request.correctedPayload ?? candidateRow.payload) as Record<
      string,
      unknown
    >;

    return this.prisma.$transaction(async (tx) => {
      await tx.knowledgeReviewDecision.create({
        data: {
          id: reviewOutcome.reviewDecision.id,
          candidateId: reviewOutcome.reviewDecision.candidateId,
          reviewerActorId: reviewOutcome.reviewDecision.reviewer.id,
          decision: reviewOutcome.reviewDecision.decision,
          ...(request.correctedPayload
            ? { correctedPayload: request.correctedPayload as object }
            : {}),
          rationale: reviewOutcome.reviewDecision.rationale,
          decidedAt: reviewOutcome.reviewDecision.decidedAt,
          reviewDurationMs: reviewOutcome.reviewDecision.reviewDurationMs,
        },
      });
      await appendAuditEvent(
        tx,
        'knowledge_review_decision',
        reviewOutcome.reviewDecision.id,
        reviewOutcome.event,
        now,
      );

      if (request.decision !== 'approved') {
        const { candidate: rejected, event } =
          request.decision === 'rejected'
            ? rejectCandidateAssertion(
                { ...candidateRowToDomain(candidateRow), payload: effectivePayload },
                reviewer,
                request.rationale ?? request.decision,
              )
            : markCandidateDecided(
                { ...candidateRowToDomain(candidateRow), payload: effectivePayload },
                'corrected',
                reviewer,
              );
        const updated = await tx.knowledgeCandidateAssertion.update({
          where: { id: candidateId },
          data: { status: rejected.status, version: rejected.version },
          include: { proposedBy: true },
        });
        await appendAuditEvent(tx, 'candidate_assertion', candidateId, event, now);
        return toView(updated);
      }

      // Approved — confirm into a KnowledgeAssertion, one transaction.
      const domain = candidateRow.knowledgeDomainId
        ? await tx.knowledgeDomain.findUnique({ where: { id: candidateRow.knowledgeDomainId } })
        : null;
      const policy: AssertionValidationPolicy = domain
        ? (domain.validationPolicy as unknown as AssertionValidationPolicy)
        : DEFAULT_VALIDATION_POLICY;
      void policy; // Lifecycle transition beyond the initial confirm is a separate endpoint (transitionKnowledgeAssertion).

      const chain = createKnowledgeProvenanceChain({
        id: toKnowledgeProvenanceChainId(randomUUID()),
        candidateId: toCandidateAssertionId(candidateId),
        sourceEvidenceIds: candidateRow.sourceEvidenceIds.map(toEvidenceId),
        extractionMethod: 'human_manual',
        consentBasis: [],
        confirmedBy: reviewer,
        confirmedAt: now,
      });
      await tx.knowledgeProvenanceChain.create({
        data: {
          id: chain.id,
          candidateId: chain.candidateId,
          sourceEvidenceIds: [...chain.sourceEvidenceIds],
          extractionMethod: chain.extractionMethod,
          extractionModel: chain.extractionModel,
          extractionModelVersion: chain.extractionModelVersion,
          consentBasis: [...chain.consentBasis],
          confirmedByActorId: chain.confirmedBy.id,
          confirmedAt: chain.confirmedAt,
        },
      });

      const { assertion, event: confirmEvent } = confirmCandidateAssertionAfterReview({
        id: toKnowledgeAssertionId(randomUUID()),
        organisationId: toOrganisationId(organisationId),
        workspaceId: toWorkspaceId(workspaceId),
        knowledgeDomainId: candidateRow.knowledgeDomainId
          ? toKnowledgeDomainId(candidateRow.knowledgeDomainId)
          : null,
        candidateId: toCandidateAssertionId(candidateId),
        assertionType: candidateRow.assertionType as 'entity_attribute' | 'relationship',
        provenanceChainId: chain.id,
        confidence: candidateRow.confidence ?? 1,
        sensitivityClass: request.sensitivityClass ?? 'internal',
        perspectiveTags: request.perspectiveTags,
        groupAttributionId: request.groupAttributionId
          ? toKnowledgeEntityId(request.groupAttributionId)
          : null,
        confirmedBy: reviewer,
        at: now,
      });
      await tx.knowledgeAssertion.create({
        data: {
          id: assertion.id,
          organisationId: assertion.organisationId,
          workspaceId: assertion.workspaceId,
          knowledgeDomainId: assertion.knowledgeDomainId,
          candidateId: assertion.candidateId,
          assertionType: assertion.assertionType,
          provenanceChainId: assertion.provenanceChainId,
          confidence: assertion.confidence,
          sensitivityClass: assertion.sensitivityClass,
          lifecycleState: assertion.lifecycleState,
          perspectiveTags: [...assertion.perspectiveTags],
          groupAttributionId: assertion.groupAttributionId,
          accessScope: assertion.accessScope,
          validFrom: assertion.validFrom,
          recordedAt: assertion.recordedAt,
          createdById: assertion.createdBy.id,
          version: assertion.version,
        },
      });
      await appendAuditEvent(tx, 'knowledge_assertion', assertion.id, confirmEvent, now);

      // Defense in depth (ADR-0013): re-verify every referenced entity
      // resolves *inside this workspace* even though `propose()` already
      // checked it — a candidate can sit pending for a long time, and this
      // is the point a graph row actually gets written.
      await this.assertPayloadEntitiesInWorkspace(tx, workspaceId, effectivePayload);

      if (effectivePayload['assertionType'] === 'entity_attribute') {
        const attributeOutcome = setKnowledgeEntityAttribute({
          id: toKnowledgeEntityAttributeId(randomUUID()),
          entityId: toKnowledgeEntityId(String(effectivePayload['entityId'])),
          attributeKey: String(effectivePayload['attributeKey']),
          attributeValue: String(effectivePayload['attributeValue']),
          assertionId: assertion.id,
          createdBy: reviewer,
          at: now,
        });
        await tx.knowledgeEntityAttribute.create({
          data: {
            id: attributeOutcome.attribute.id,
            entityId: attributeOutcome.attribute.entityId,
            attributeKey: attributeOutcome.attribute.attributeKey,
            attributeValue: attributeOutcome.attribute.attributeValue,
            assertionId: attributeOutcome.attribute.assertionId,
            validFrom: attributeOutcome.attribute.validFrom,
            createdAt: attributeOutcome.attribute.createdAt,
            createdById: attributeOutcome.attribute.createdBy.id,
          },
        });
      } else {
        const fromEntityId = String(effectivePayload['fromEntityId']);
        const toEntityId = String(effectivePayload['toEntityId']);
        const relationshipType = String(effectivePayload['relationshipType']);
        // Scoped by workspaceId, not `findUnique` on id alone — the load-bearing
        // tenancy check. `assertPayloadEntitiesInWorkspace` above already
        // guarantees these resolve here; this fetch cannot itself cross a
        // tenant boundary even if that guarantee were ever weakened.
        const [fromRow, toRow] = await Promise.all([
          tx.knowledgeEntity.findFirst({ where: { id: fromEntityId, workspaceId } }),
          tx.knowledgeEntity.findFirst({ where: { id: toEntityId, workspaceId } }),
        ]);
        if (fromRow === null || toRow === null) {
          throw new BadRequestException({
            error: { code: 'ENTITY_NOT_FOUND', message: 'Relationship endpoint entity not found.' },
          });
        }
        const relOutcome = createKnowledgeRelationship({
          id: toKnowledgeRelationshipId(randomUUID()),
          from: {
            id: toKnowledgeEntityId(fromRow.id),
            organisationId: toOrganisationId(fromRow.organisationId),
            workspaceId: toWorkspaceId(fromRow.workspaceId),
            status: fromRow.status as 'active',
          },
          to: {
            id: toKnowledgeEntityId(toRow.id),
            organisationId: toOrganisationId(toRow.organisationId),
            workspaceId: toWorkspaceId(toRow.workspaceId),
            status: toRow.status as 'active',
          },
          relationshipType,
          registeredTypeCodes: new Set([relationshipType]),
          assertionId: assertion.id,
          validFrom: effectivePayload['validFrom']
            ? new Date(String(effectivePayload['validFrom']))
            : undefined,
          strength:
            typeof effectivePayload['strength'] === 'number' ? effectivePayload['strength'] : null,
          createdBy: reviewer,
          at: now,
        });
        await tx.knowledgeRelationship.create({
          data: {
            id: relOutcome.relationship.id,
            organisationId: relOutcome.relationship.organisationId,
            workspaceId: relOutcome.relationship.workspaceId,
            fromEntityId: relOutcome.relationship.fromEntityId,
            toEntityId: relOutcome.relationship.toEntityId,
            relationshipType: relOutcome.relationship.relationshipType,
            assertionId: relOutcome.relationship.assertionId,
            validFrom: relOutcome.relationship.validFrom,
            validTo: relOutcome.relationship.validTo,
            strength: relOutcome.relationship.strength,
            createdAt: relOutcome.relationship.createdAt,
            createdById: relOutcome.relationship.createdBy.id,
          },
        });
      }

      const finalCandidate = await tx.knowledgeCandidateAssertion.update({
        where: { id: candidateId },
        data: { status: 'confirmed', version: candidateRow.version + 1 },
        include: { proposedBy: true },
      });

      await appendOutboxEvent(tx, {
        id: randomUUID(),
        organisationId,
        workspaceId,
        aggregateType: 'knowledge_assertion',
        aggregateId: assertion.id,
        eventType: 'org.witness.knowledge.assertion.confirmed.v1',
        payload: { assertionId: assertion.id, assertionType: assertion.assertionType },
        occurredAt: now,
      });

      return toView(finalCandidate);
    });
  }
}

function candidateRowToDomain(row: {
  id: string;
  organisationId: string;
  workspaceId: string;
  knowledgeDomainId: string | null;
  assertionType: string;
  payload: unknown;
  sourceEvidenceIds: string[];
  sourceUtteranceRefs: unknown;
  confidence: number | null;
  extractionMethod: string;
  extractionModel: string | null;
  extractionModelVersion: string | null;
  promptVersion: string | null;
  proposedById: string;
  proposedBy: { displayName: string };
  status: string;
  supersededByCandidateId: string | null;
  createdAt: Date;
  version: number;
}) {
  return {
    id: toCandidateAssertionId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    knowledgeDomainId: row.knowledgeDomainId ? toKnowledgeDomainId(row.knowledgeDomainId) : null,
    assertionType: row.assertionType as 'entity_attribute' | 'relationship',
    payload: row.payload as Record<string, unknown>,
    sourceEvidenceIds: row.sourceEvidenceIds.map(toEvidenceId),
    sourceUtteranceRefs: [],
    confidence: row.confidence,
    extractionMethod: row.extractionMethod as 'human_manual' | 'ai_model' | 'rule_based',
    extractionModel: row.extractionModel,
    extractionModelVersion: row.extractionModelVersion,
    promptVersion: row.promptVersion,
    proposedBy: {
      id: row.proposedById as never,
      kind: 'human' as const,
      displayName: row.proposedBy.displayName,
    },
    status: row.status as 'pending',
    supersededByCandidateId: null,
    createdAt: row.createdAt,
    version: row.version,
  };
}
