/**
 * Application layer for `SessionFeaturedInsight`/`ParticipantKnowledgeResponse`
 * (Phase 6, Track E — "close the co-design loop"). A facilitator curates
 * which *already-confirmed* `KnowledgeAssertion`s a live workshop's
 * participants see as "what we're hearing so far"; a participant may respond
 * to one without ever touching the canonical assertion.
 *
 * `KnowledgeAssertion` rows only ever exist after human confirmation
 * (ADR-0012) — there is no "candidate" state to accidentally expose here.
 * The one thing this service still excludes deliberately is a `rejected`/
 * `superseded` assertion: those are confirmed-then-retracted, and showing
 * them to a live room as "what we're hearing" would misrepresent their
 * standing.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  featureInsightForSession,
  submitParticipantKnowledgeResponse,
  toCoDesignSessionId,
  toKnowledgeAssertionId,
  toOrganisationId,
  toParticipantKnowledgeResponseId,
  toSessionFeaturedInsightId,
  toSessionParticipantId,
  toWorkspaceId,
  unfeatureInsight,
  type SessionFeaturedInsight as SessionFeaturedInsightDomain,
} from '@witness/domain';
import type {
  FeatureInsightRequest,
  FeaturedInsightBadge,
  FeaturedInsightCandidateView,
  FeaturedInsightView,
  ParticipantResponseType,
  SessionRoomView,
  SubmitParticipantKnowledgeResponseRequest,
} from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const RETRACTED_LIFECYCLE_STATES = new Set(['rejected', 'superseded']);
const EARLY_LIFECYCLE_STATES = new Set(['facilitator_curated', 'evidence_reviewed']);

interface SessionRow {
  id: string;
  organisationId: string;
  workspaceId: string;
}

function toDomain(row: {
  id: string;
  organisationId: string;
  workspaceId: string;
  sessionId: string;
  knowledgeAssertionId: string;
  displayOrder: number;
  curatedById: string;
  curatedAt: Date;
  removedById: string | null;
  removedAt: Date | null;
}): SessionFeaturedInsightDomain {
  return {
    id: toSessionFeaturedInsightId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    knowledgeAssertionId: toKnowledgeAssertionId(row.knowledgeAssertionId),
    displayOrder: row.displayOrder,
    curatedBy: { id: row.curatedById as never, kind: 'human', displayName: '' },
    curatedAt: row.curatedAt,
    removedBy:
      row.removedById === null
        ? null
        : { id: row.removedById as never, kind: 'human', displayName: '' },
    removedAt: row.removedAt,
  };
}

/**
 * The same low-tech "`attributeKey`: `attributeValue`" composition the
 * knowledge review page already uses for a candidate's payload
 * (`apps/web/.../knowledge/review/page.tsx`) — reused here rather than
 * inventing a second rendering convention, with the entity's own label
 * prefixed for context. Falls back to the entity label alone if an
 * assertion somehow has no attribute yet (defensive; should not happen for
 * a properly confirmed assertion).
 */
function composeStatement(
  entityLabel: string,
  attributes: readonly { attributeKey: string; attributeValue: string }[],
): string {
  if (attributes.length === 0) return entityLabel;
  return attributes
    .map((attribute) => `${entityLabel} — ${attribute.attributeKey}: ${attribute.attributeValue}`)
    .join('; ');
}

function deriveBadge(
  lifecycleState: string,
  perspectiveTags: readonly string[],
): FeaturedInsightBadge {
  if (perspectiveTags.includes('contested')) return 'contested';
  if (perspectiveTags.includes('unresolved')) return 'under_discussion';
  if (EARLY_LIFECYCLE_STATES.has(lifecycleState)) return 'under_discussion';
  return 'community_validated';
}

function emptyTally(): Record<ParticipantResponseType, number> {
  return { reflects: 0, needs_nuance: 0, missing_context: 0, sees_differently: 0 };
}

@Injectable()
export class SessionFeaturedInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async curate(
    workspaceId: string,
    sessionId: string,
    request: FeatureInsightRequest,
    principal: Principal,
  ): Promise<FeaturedInsightView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);

    const assertion = await this.prisma.knowledgeAssertion.findUnique({
      where: { id: request.knowledgeAssertionId },
      select: { workspaceId: true, lifecycleState: true },
    });
    if (assertion === null || assertion.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'KNOWLEDGE_ASSERTION_NOT_FOUND',
          message: `No confirmed assertion '${request.knowledgeAssertionId}' in this workspace.`,
        },
      });
    }
    if (RETRACTED_LIFECYCLE_STATES.has(assertion.lifecycleState)) {
      throw new BadRequestException({
        error: {
          code: 'ASSERTION_RETRACTED',
          message: 'A rejected or superseded assertion cannot be featured for participants.',
        },
      });
    }

    const alreadyFeatured =
      (await this.prisma.sessionFeaturedInsight.findFirst({
        where: { sessionId, knowledgeAssertionId: request.knowledgeAssertionId, removedAt: null },
        select: { id: true },
      })) !== null;

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = featureInsightForSession(
      {
        id: toSessionFeaturedInsightId(randomUUID()),
        organisationId: toOrganisationId(session.organisationId),
        workspaceId: toWorkspaceId(workspaceId),
        sessionId: toCoDesignSessionId(sessionId),
        knowledgeAssertionId: toKnowledgeAssertionId(request.knowledgeAssertionId),
        displayOrder: request.displayOrder ?? 0,
        curatedBy: actor,
        at: now,
      },
      alreadyFeatured,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionFeaturedInsight.create({
        data: {
          id: outcome.insight.id,
          organisationId: outcome.insight.organisationId,
          workspaceId: outcome.insight.workspaceId,
          sessionId: outcome.insight.sessionId,
          knowledgeAssertionId: outcome.insight.knowledgeAssertionId,
          displayOrder: outcome.insight.displayOrder,
          curatedById: outcome.insight.curatedBy.id,
          curatedAt: outcome.insight.curatedAt,
        },
      });
      await appendAuditEvent(
        tx,
        'session_featured_insight',
        outcome.insight.id,
        outcome.event,
        now,
      );
    });

    const views = await this.toParticipantViews(sessionId, [outcome.insight.id], null);
    return views[0]!;
  }

  async remove(
    workspaceId: string,
    sessionId: string,
    insightId: string,
    principal: Principal,
  ): Promise<void> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireInsightRow(sessionId, insightId);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = unfeatureInsight(toDomain(row), actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionFeaturedInsight.update({
        where: { id: insightId },
        data: { removedById: outcome.insight.removedBy!.id, removedAt: outcome.insight.removedAt },
      });
      await appendAuditEvent(tx, 'session_featured_insight', insightId, outcome.event, now);
    });
  }

  /** The facilitator-authenticated participant-safe list, plus a `canPublish`-style capability isn't needed here — curation is already gated at the controller. */
  async listForWorkspace(workspaceId: string, sessionId: string): Promise<FeaturedInsightView[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    return this.listActive(sessionId, null);
  }

  /**
   * What a facilitator could choose to feature next — every confirmed,
   * non-retracted assertion in this workspace that isn't already actively
   * featured for this session. Bounded and most-recent-first: a curation
   * picker, not a full knowledge-graph browser.
   */
  async listCandidates(
    workspaceId: string,
    sessionId: string,
  ): Promise<FeaturedInsightCandidateView[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const active = await this.prisma.sessionFeaturedInsight.findMany({
      where: { sessionId, removedAt: null },
      select: { knowledgeAssertionId: true },
    });
    const activeIds = new Set(active.map((row) => row.knowledgeAssertionId));

    const assertions = await this.prisma.knowledgeAssertion.findMany({
      where: {
        workspaceId,
        lifecycleState: { notIn: [...RETRACTED_LIFECYCLE_STATES] },
      },
      select: {
        id: true,
        lifecycleState: true,
        perspectiveTags: true,
        entityAttributes: {
          select: {
            attributeKey: true,
            attributeValue: true,
            entity: { select: { canonicalLabel: true } },
          },
        },
      },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    return assertions
      .filter((assertion) => !activeIds.has(assertion.id))
      .map((assertion) => ({
        knowledgeAssertionId: assertion.id,
        statement: composeStatement(
          assertion.entityAttributes[0]?.entity.canonicalLabel ?? 'This theme',
          assertion.entityAttributes,
        ),
        badge: deriveBadge(assertion.lifecycleState, assertion.perspectiveTags),
      }));
  }

  /** The narrow participant-facing read — same rows, plus `myResponseType`. */
  async listForParticipant(
    sessionId: string,
    participantId: string,
  ): Promise<FeaturedInsightView[]> {
    return this.listActive(sessionId, participantId);
  }

  async submitResponse(
    sessionId: string,
    insightId: string,
    participantId: string,
    request: SubmitParticipantKnowledgeResponseRequest,
    principal: Principal,
  ): Promise<void> {
    const insight = await this.prisma.sessionFeaturedInsight.findUnique({
      where: { id: insightId },
      select: {
        sessionId: true,
        knowledgeAssertionId: true,
        removedAt: true,
        organisationId: true,
        workspaceId: true,
      },
    });
    if (insight === null || insight.sessionId !== sessionId || insight.removedAt !== null) {
      throw new NotFoundException({
        error: {
          code: 'FEATURED_INSIGHT_NOT_FOUND',
          message: `No active featured insight '${insightId}' in this session.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = submitParticipantKnowledgeResponse({
      id: toParticipantKnowledgeResponseId(randomUUID()),
      organisationId: toOrganisationId(insight.organisationId),
      workspaceId: toWorkspaceId(insight.workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      knowledgeAssertionId: toKnowledgeAssertionId(insight.knowledgeAssertionId),
      sourceParticipantId: toSessionParticipantId(participantId),
      responseType: request.responseType,
      comment: request.comment,
      submittedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.participantKnowledgeResponse.create({
        data: {
          id: outcome.response.id,
          organisationId: outcome.response.organisationId,
          workspaceId: outcome.response.workspaceId,
          sessionId: outcome.response.sessionId,
          knowledgeAssertionId: outcome.response.knowledgeAssertionId,
          sourceParticipantId: outcome.response.sourceParticipantId,
          responseType: outcome.response.responseType,
          comment: outcome.response.comment,
          submittedById: outcome.response.submittedBy.id,
          createdAt: outcome.response.createdAt,
        },
      });
      await appendAuditEvent(
        tx,
        'participant_knowledge_response',
        outcome.response.id,
        outcome.event,
        now,
      );
    });
  }

  async roomView(workspaceId: string, sessionId: string): Promise<SessionRoomView> {
    await this.requireSessionRow(workspaceId, sessionId);

    const [
      activeAgendaItem,
      participantCount,
      contributedParticipants,
      totalContributions,
      insights,
    ] = await Promise.all([
      this.prisma.agendaItem.findFirst({ where: { sessionId, status: 'current' } }),
      this.prisma.sessionParticipant.count({ where: { sessionId, withdrawnAt: null } }),
      this.prisma.evidence.findMany({
        where: { sessionId, sourceParticipantId: { not: null } },
        select: { sourceParticipantId: true },
        distinct: ['sourceParticipantId'],
      }),
      this.prisma.evidence.count({ where: { sessionId } }),
      this.listActive(sessionId, null),
    ]);

    return {
      activeAgendaItem:
        activeAgendaItem === null
          ? null
          : {
              id: activeAgendaItem.id,
              workspaceId: activeAgendaItem.workspaceId,
              sessionId: activeAgendaItem.sessionId,
              title: activeAgendaItem.title,
              description: activeAgendaItem.description,
              promptText: activeAgendaItem.promptText,
              facilitatorId: activeAgendaItem.facilitatorId,
              facilitatorName: null,
              status: activeAgendaItem.status as never,
              sortOrder: activeAgendaItem.sortOrder,
              startAt: activeAgendaItem.startAt?.toISOString() ?? null,
              durationMinutes: activeAgendaItem.durationMinutes,
              createdAt: activeAgendaItem.createdAt.toISOString(),
              updatedAt: activeAgendaItem.updatedAt.toISOString(),
            },
      participantCount,
      contributedCount: contributedParticipants.length,
      totalContributions,
      insights: insights.map((insight) => ({
        insightId: insight.id,
        knowledgeAssertionId: insight.knowledgeAssertionId,
        statement: insight.statement,
        badge: insight.badge,
        responseTally: insight.responseTally,
      })),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async listActive(
    sessionId: string,
    participantId: string | null,
  ): Promise<FeaturedInsightView[]> {
    const rows = await this.prisma.sessionFeaturedInsight.findMany({
      where: { sessionId, removedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
    return this.toParticipantViews(
      sessionId,
      rows.map((row) => row.id),
      participantId,
      rows,
    );
  }

  private async toParticipantViews(
    sessionId: string,
    insightIds: readonly string[],
    participantId: string | null,
    preloadedRows?: readonly { id: string; knowledgeAssertionId: string; displayOrder: number }[],
  ): Promise<FeaturedInsightView[]> {
    if (insightIds.length === 0) return [];

    const rows =
      preloadedRows ??
      (await this.prisma.sessionFeaturedInsight.findMany({
        where: { id: { in: [...insightIds] } },
        orderBy: { displayOrder: 'asc' },
      }));

    const assertionIds = [...new Set(rows.map((row) => row.knowledgeAssertionId))];

    const [assertions, responses] = await Promise.all([
      this.prisma.knowledgeAssertion.findMany({
        where: { id: { in: assertionIds } },
        select: {
          id: true,
          lifecycleState: true,
          perspectiveTags: true,
          entityAttributes: {
            select: {
              attributeKey: true,
              attributeValue: true,
              entity: { select: { canonicalLabel: true } },
            },
          },
        },
      }),
      this.prisma.participantKnowledgeResponse.findMany({
        where: { sessionId, knowledgeAssertionId: { in: assertionIds } },
        select: { knowledgeAssertionId: true, responseType: true, sourceParticipantId: true },
      }),
    ]);

    const assertionById = new Map(assertions.map((assertion) => [assertion.id, assertion]));

    const tallyByAssertion = new Map<string, Record<ParticipantResponseType, number>>();
    const myResponseByAssertion = new Map<string, ParticipantResponseType>();
    for (const response of responses) {
      const tally = tallyByAssertion.get(response.knowledgeAssertionId) ?? emptyTally();
      tally[response.responseType as ParticipantResponseType] += 1;
      tallyByAssertion.set(response.knowledgeAssertionId, tally);
      if (participantId !== null && response.sourceParticipantId === participantId) {
        myResponseByAssertion.set(
          response.knowledgeAssertionId,
          response.responseType as ParticipantResponseType,
        );
      }
    }

    return rows.map((row) => {
      const assertion = assertionById.get(row.knowledgeAssertionId);
      const entityLabel = assertion?.entityAttributes[0]?.entity.canonicalLabel ?? 'This theme';
      const statement =
        assertion === undefined
          ? 'This assertion is no longer available.'
          : composeStatement(entityLabel, assertion.entityAttributes);
      return {
        id: row.id,
        knowledgeAssertionId: row.knowledgeAssertionId,
        statement,
        badge:
          assertion === undefined
            ? 'under_discussion'
            : deriveBadge(assertion.lifecycleState, assertion.perspectiveTags),
        displayOrder: row.displayOrder,
        responseTally: tallyByAssertion.get(row.knowledgeAssertionId) ?? emptyTally(),
        myResponseType: myResponseByAssertion.get(row.knowledgeAssertionId) ?? null,
      };
    });
  }

  private async requireSessionRow(workspaceId: string, sessionId: string): Promise<SessionRow> {
    const row = await this.prisma.coDesignSession.findUnique({ where: { id: sessionId } });
    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `No co-design session '${sessionId}' in workspace '${workspaceId}'.`,
        },
      });
    }
    return row;
  }

  private async requireInsightRow(sessionId: string, insightId: string) {
    const row = await this.prisma.sessionFeaturedInsight.findUnique({ where: { id: insightId } });
    if (row === null || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'FEATURED_INSIGHT_NOT_FOUND',
          message: `No featured insight '${insightId}' in this session.`,
        },
      });
    }
    if (row.removedAt !== null) {
      throw new ConflictException({
        error: {
          code: 'INSIGHT_ALREADY_REMOVED',
          message: 'This insight has already been removed.',
        },
      });
    }
    return row;
  }
}
