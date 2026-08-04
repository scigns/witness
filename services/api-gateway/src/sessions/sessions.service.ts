/**
 * Application layer for co-design sessions (BUILD_ROADMAP.md Milestone 2).
 *
 * Every mutating operation loads the current row, reconstructs the domain
 * aggregate, calls into `@witness/domain` for the actual rule, then writes
 * the result back with the audit event in the same transaction — the same
 * shape `RecordsService` uses, extended with one thing records do not need:
 * optimistic concurrency. `update()` and `transition()` both take the
 * client's `expectedVersion` and use it as the `WHERE` clause on the write,
 * not merely the freshly-read row's version — a client that read a session
 * five minutes ago and is still looking at that version must be rejected
 * even if nothing else has changed *since this specific request started*
 * (`services/api-gateway/src/sessions/sessions.service.test.ts` verifies this
 * distinction directly).
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  archiveSession,
  canCaptureEvidence,
  changeSessionFacilitator,
  closeSession,
  isInGoodStanding,
  openSession,
  permittedSessionTransitions,
  reopenSession,
  scheduleSession,
  toCoDesignSessionId,
  toOrganisationId,
  toUserId,
  toWorkspaceId,
  unscheduleSession,
  updateSessionDetails,
  createCoDesignSession,
  type Actor,
  type CoDesignSession,
  type CoDesignSessionOutcome,
  type MembershipState,
  type SessionDeliveryMode,
  type SessionParticipantVisibility,
} from '@witness/domain';
import type {
  CoDesignSessionDetail,
  CoDesignSessionSummary,
  CreateCoDesignSessionRequest,
  SessionLifecycleEventView,
  SessionTransitionRequest,
  UpdateCoDesignSessionRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

const LIFECYCLE_ACTIONS = [
  'co_design_session.created',
  'co_design_session.scheduled',
  'co_design_session.opened',
  'co_design_session.closed',
  'co_design_session.reopened',
  'co_design_session.archived',
] as const;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(workspaceId: string): Promise<CoDesignSessionSummary[]> {
    await this.requireWorkspace(workspaceId);

    const rows = await this.prisma.coDesignSession.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return rows.map(toSummary);
  }

  async get(workspaceId: string, sessionId: string): Promise<CoDesignSessionDetail> {
    const row = await this.requireSessionRow(workspaceId, sessionId);
    return toDetail(row);
  }

  async history(workspaceId: string, sessionId: string): Promise<SessionLifecycleEventView[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const events = await this.prisma.auditEvent.findMany({
      where: {
        subjectType: 'co_design_session',
        subjectId: sessionId,
        action: { in: [...LIFECYCLE_ACTIONS] },
      },
      orderBy: { occurredAt: 'asc' },
      include: { actor: true },
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      actor: {
        id: event.actor.id,
        kind: event.actor.kind as SessionLifecycleEventView['actor']['kind'],
        displayName: event.actor.displayName,
      },
      occurredAt: event.occurredAt.toISOString(),
      metadata: (event.metadata ?? {}) as Record<string, string>,
    }));
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    request: CreateCoDesignSessionRequest,
    principal: Principal,
  ): Promise<CoDesignSessionDetail> {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.requireFacilitator(workspace.organisationId, request.primaryFacilitatorId);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createCoDesignSession({
      id: toCoDesignSessionId(randomUUID()),
      organisationId: toOrganisationId(workspace.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      title: request.title,
      purpose: request.purpose,
      description: request.description,
      sessionType: request.sessionType,
      location: request.location,
      deliveryMode: request.deliveryMode as SessionDeliveryMode,
      primaryFacilitatorId: toUserId(request.primaryFacilitatorId),
      supportedLanguages: request.supportedLanguages,
      culturalProtocolNotes: request.culturalProtocolNotes,
      participantVisibility: request.participantVisibility as
        SessionParticipantVisibility | undefined,
      createdBy: actor,
      createdAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.coDesignSession.create({ data: toCreateRow(outcome.session) });
      await appendAuditEvent(tx, 'co_design_session', outcome.session.id, outcome.event, now);
    });

    return this.get(workspaceId, outcome.session.id);
  }

  /**
   * A detail change and a facilitator change are two distinct domain
   * operations (`updateSessionDetails`/`changeSessionFacilitator`), each
   * emitting its own audit event — never merged into one, so the audit
   * trail always names exactly what happened. When a request carries both,
   * both domain calls run first (so a `DomainError` from either reaches the
   * client with nothing persisted), and both writes plus both audit events
   * commit inside the single transaction `applyOutcomes` opens — a second
   * writer's concurrent change can only ever reject the whole request, never
   * leave one half durable and the other rejected.
   */
  async update(
    workspaceId: string,
    sessionId: string,
    request: UpdateCoDesignSessionRequest,
    principal: Principal,
  ): Promise<CoDesignSessionDetail> {
    const row = await this.requireSessionRow(workspaceId, sessionId);
    let session = toDomainSession(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const detailPatch = {
      title: request.title,
      purpose: request.purpose,
      description: request.description,
      sessionType: request.sessionType,
      location: request.location,
      deliveryMode: request.deliveryMode as SessionDeliveryMode | undefined,
      supportedLanguages: request.supportedLanguages,
      culturalProtocolNotes: request.culturalProtocolNotes,
      participantVisibility: request.participantVisibility as
        SessionParticipantVisibility | undefined,
    };
    const hasDetailChanges = Object.values(detailPatch).some((value) => value !== undefined);
    const hasFacilitatorChange = request.primaryFacilitatorId !== undefined;

    if (!hasDetailChanges && !hasFacilitatorChange) {
      throw new BadRequestException({
        error: { code: 'NO_CHANGES', message: 'An update must change at least one field.' },
      });
    }

    if (hasFacilitatorChange) {
      await this.requireFacilitator(session.organisationId, request.primaryFacilitatorId!);
    }

    const outcomes: CoDesignSessionOutcome[] = [];

    if (hasDetailChanges) {
      const outcome = updateSessionDetails(session, actor, detailPatch, now);
      outcomes.push(outcome);
      session = outcome.session;
    }

    if (hasFacilitatorChange) {
      const outcome = changeSessionFacilitator(
        session,
        actor,
        toUserId(request.primaryFacilitatorId!),
        now,
      );
      outcomes.push(outcome);
    }

    await this.applyOutcomes(sessionId, request.expectedVersion, outcomes, now);

    return this.get(workspaceId, sessionId);
  }

  async transition(
    workspaceId: string,
    sessionId: string,
    action: SessionTransitionRequest,
    principal: Principal,
  ): Promise<CoDesignSessionDetail> {
    const row = await this.requireSessionRow(workspaceId, sessionId);
    const current = toDomainSession(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = this.applyTransition(current, action, actor, now);

    await this.applyOutcomes(sessionId, action.expectedVersion, [outcome], now);

    return this.get(workspaceId, sessionId);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private applyTransition(
    session: CoDesignSession,
    action: SessionTransitionRequest,
    actor: Actor,
    at: Date,
  ): CoDesignSessionOutcome {
    switch (action.action) {
      case 'schedule':
        return scheduleSession(
          session,
          actor,
          {
            startAt: new Date(action.startAt),
            endAt: action.endAt !== undefined ? new Date(action.endAt) : null,
            timezone: action.timezone ?? null,
          },
          at,
        );
      case 'unschedule':
        return unscheduleSession(session, actor, at);
      case 'open':
        return openSession(session, actor, at);
      case 'close':
        return closeSession(session, actor, at);
      case 'reopen':
        return reopenSession(session, actor, action.reason, at);
      case 'archive':
        return archiveSession(session, actor, at);
      default: {
        // Exhaustiveness guard: a new SessionTransitionRequest variant that
        // forgets a case here fails to compile, rather than silently falling
        // through to whatever `applyOutcomes` does with `undefined`.
        const unreachable: never = action;
        throw new Error(`Unhandled session transition: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  /**
   * Write one or more domain outcomes back in a single transaction,
   * conditioned on the version the client last saw. `updateMany`'s `WHERE`
   * clause is the entire concurrency check for the first write: it is the
   * row's version *as the client believes it to be* (`expectedVersion`), not
   * the version this method just read — matching zero rows means someone
   * else's write landed since the client's last read. Each subsequent
   * outcome in the list chains onto the version the previous one produced,
   * so a caller combining several domain operations into one request (e.g.
   * `update`'s detail-and-facilitator case) gets one all-or-nothing write:
   * a conflict on any outcome rolls back every write and every audit event
   * in the whole call, never leaving an earlier one durable and a later one
   * rejected.
   */
  private async applyOutcomes(
    sessionId: string,
    firstExpectedVersion: number,
    outcomes: readonly CoDesignSessionOutcome[],
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      let expectedVersion = firstExpectedVersion;

      for (const outcome of outcomes) {
        const result = await tx.coDesignSession.updateMany({
          where: { id: sessionId, version: expectedVersion },
          data: toUpdateRow(outcome.session),
        });

        if (result.count === 0) {
          throw new ConflictException({
            error: {
              code: 'STALE_VERSION',
              message:
                'This session was changed by someone else since you last loaded it. ' +
                'Reload and try again.',
            },
          });
        }

        await appendAuditEvent(tx, 'co_design_session', sessionId, outcome.event, at);
        expectedVersion = outcome.session.version;
      }
    });
  }

  private async requireWorkspace(
    workspaceId: string,
  ): Promise<{ id: string; organisationId: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, organisationId: true },
    });

    if (workspace === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }

    return workspace;
  }

  /**
   * A session's facilitator must be a member in good standing of the
   * session's own organisation — not merely any registered user. Checking
   * only that the user id exists (as a plain `user.findUnique` would) lets a
   * caller name someone from a completely unrelated organisation as the
   * facilitator of a session they have no relationship to; scoping the
   * lookup to `OrganisationMembership` closes that.
   */
  private async requireFacilitator(organisationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
      select: { state: true },
    });

    if (membership === null || !isInGoodStanding(membership.state as MembershipState)) {
      throw new NotFoundException({
        error: {
          code: 'FACILITATOR_NOT_ELIGIBLE',
          message:
            `User '${userId}' is not a member in good standing of organisation ` +
            `'${organisationId}', and cannot be the primary facilitator of a session there.`,
        },
      });
    }
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
}

type SessionRow = Awaited<ReturnType<PrismaService['coDesignSession']['findUniqueOrThrow']>>;

function toDomainSession(row: SessionRow): CoDesignSession {
  return {
    id: toCoDesignSessionId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    title: row.title,
    purpose: row.purpose,
    description: row.description,
    sessionType: row.sessionType,
    location: row.location,
    deliveryMode: row.deliveryMode as SessionDeliveryMode,
    startAt: row.startAt,
    endAt: row.endAt,
    timezone: row.timezone,
    primaryFacilitatorId: toUserId(row.primaryFacilitatorId),
    status: row.status as CoDesignSession['status'],
    supportedLanguages: row.supportedLanguages,
    culturalProtocolNotes: row.culturalProtocolNotes,
    participantVisibility: row.participantVisibility as SessionParticipantVisibility,
    consentConfigurationState:
      row.consentConfigurationState as CoDesignSession['consentConfigurationState'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    version: row.version,
  };
}

function toCreateRow(session: CoDesignSession) {
  return {
    id: session.id,
    organisationId: session.organisationId,
    workspaceId: session.workspaceId,
    ...toUpdateRow(session),
    createdAt: session.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(session: CoDesignSession) {
  return {
    title: session.title,
    purpose: session.purpose,
    description: session.description,
    sessionType: session.sessionType,
    location: session.location,
    deliveryMode: session.deliveryMode,
    startAt: session.startAt,
    endAt: session.endAt,
    timezone: session.timezone,
    primaryFacilitatorId: session.primaryFacilitatorId,
    status: session.status,
    supportedLanguages: [...session.supportedLanguages],
    culturalProtocolNotes: session.culturalProtocolNotes,
    participantVisibility: session.participantVisibility,
    consentConfigurationState: session.consentConfigurationState,
    updatedAt: session.updatedAt,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    archivedAt: session.archivedAt,
    version: session.version,
  };
}

function toSummary(row: SessionRow): CoDesignSessionSummary {
  return {
    id: row.id,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    title: row.title,
    sessionType: row.sessionType,
    deliveryMode: row.deliveryMode as SessionDeliveryMode,
    status: row.status as CoDesignSessionSummary['status'],
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    primaryFacilitatorId: row.primaryFacilitatorId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: SessionRow): CoDesignSessionDetail {
  const session = toDomainSession(row);

  return {
    ...toSummary(row),
    purpose: session.purpose,
    description: session.description,
    location: session.location,
    timezone: session.timezone,
    supportedLanguages: [...session.supportedLanguages],
    culturalProtocolNotes: session.culturalProtocolNotes,
    participantVisibility: session.participantVisibility,
    consentConfigurationState: session.consentConfigurationState,
    createdAt: session.createdAt.toISOString(),
    openedAt: session.openedAt?.toISOString() ?? null,
    closedAt: session.closedAt?.toISOString() ?? null,
    archivedAt: session.archivedAt?.toISOString() ?? null,
    version: session.version,
    permittedTransitions: [...permittedSessionTransitions(session.status)],
    canCaptureEvidence: canCaptureEvidence(session),
  };
}
