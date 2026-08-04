/**
 * Application layer for session participants (BUILD_ROADMAP.md Milestone 3).
 *
 * Same shape as `SessionsService`: load the row, reconstruct the domain
 * aggregate, call into `@witness/domain` for the rule, write the result and
 * its audit event back inside a transaction, using the client's
 * `expectedVersion` as the conditional `WHERE` clause for optimistic
 * concurrency.
 *
 * The one thing this service does that `SessionsService` does not: an
 * imperative, in-service Casbin decision (`participant:manage_restricted`),
 * separate from the route-level `@Requires(...)` gate the controller
 * declares. A single `GET` here can legitimately return two different
 * bodies for two different callers — a reader sees a redacted participant,
 * a contributor sees the full record — and that distinction cannot be
 * expressed by a route-level boolean gate. `resolveVisibility` below is the
 * one place that decision is made, so every read method reaches it exactly
 * the same way.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  addParticipant,
  changeLinkedUser,
  permittedAttendanceTransitions,
  permittedInvitationTransitions,
  restoreParticipant,
  toCoDesignSessionId,
  toOrganisationId,
  toSessionParticipantId,
  toUserId,
  toWorkspaceId,
  updateAttendanceStatus,
  updateFacilitatorNotes,
  updateIdentityVisibility,
  updateInvitationStatus,
  updateParticipantDetails,
  withdrawParticipant,
  type Actor,
  type ParticipantAttendanceStatus,
  type ParticipantIdentityVisibility,
  type ParticipantInvitationStatus,
  type ParticipationMode,
  type SessionParticipant,
  type SessionParticipantOutcome,
  type SessionStatus,
} from '@witness/domain';
import type {
  AddSessionParticipantRequest,
  SessionLifecycleEventView,
  SessionParticipantDetail,
  SessionParticipantSummary,
  SessionParticipantTransitionRequest,
  UpdateParticipantNotesRequest,
  UpdateSessionParticipantRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Principal } from '../authz/authorization.port.js';

const RESTRICTED_DISPLAY_NAME = 'Restricted participant';

const HISTORY_ACTIONS = [
  'session_participant.added',
  'session_participant.linked_user_changed',
  'session_participant.identity_visibility_changed',
  'session_participant.invitation_status_changed',
  'session_participant.attendance_status_changed',
  'session_participant.withdrawn',
  'session_participant.restored',
] as const;

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(
    workspaceId: string,
    sessionId: string,
    principal: Principal,
  ): Promise<SessionParticipantSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);

    const rows = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return rows.map((row) => toSummary(row, includeRestricted));
  }

  async get(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    principal: Principal,
  ): Promise<SessionParticipantDetail> {
    const row = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(row, includeRestricted);
  }

  async history(
    workspaceId: string,
    sessionId: string,
    participantId: string,
  ): Promise<SessionLifecycleEventView[]> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);

    const events = await this.prisma.auditEvent.findMany({
      where: {
        subjectType: 'session_participant',
        subjectId: participantId,
        action: { in: [...HISTORY_ACTIONS] },
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

  /**
   * Always redacted, regardless of the caller's tier — an export artifact
   * leaves the application's trusted context (attached to a report, handed
   * to someone outside the facilitator team), so it applies the same
   * redaction an unprivileged reader would see, never the caller's own,
   * possibly-elevated, view.
   */
  async exportRedacted(
    workspaceId: string,
    sessionId: string,
  ): Promise<SessionParticipantSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const rows = await this.prisma.sessionParticipant.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return rows.map((row) => toSummary(row, false));
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async add(
    workspaceId: string,
    sessionId: string,
    request: AddSessionParticipantRequest,
    principal: Principal,
  ): Promise<SessionParticipantDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = addParticipant(session.status as SessionStatus, {
      id: toSessionParticipantId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      linkedUserId: request.linkedUserId !== undefined ? toUserId(request.linkedUserId) : null,
      displayName: request.displayName,
      preferredName: request.preferredName,
      pronouns: request.pronouns,
      affiliation: request.affiliation,
      participantType: request.participantType,
      participationMode: request.participationMode as ParticipationMode,
      identityMode: request.identityMode,
      identityVisibility: request.identityVisibility as ParticipantIdentityVisibility | undefined,
      languagePreference: request.languagePreference,
      accessibilityRequirements: request.accessibilityRequirements,
      addedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionParticipant.create({ data: toCreateRow(outcome.participant) });
      await appendAuditEvent(tx, 'session_participant', outcome.participant.id, outcome.event, now);
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const row = await this.requireParticipantRow(workspaceId, sessionId, outcome.participant.id);
    return toDetail(row, includeRestricted);
  }

  async update(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    request: UpdateSessionParticipantRequest,
    principal: Principal,
  ): Promise<SessionParticipantDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const participant = toDomainParticipant(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const patch = {
      displayName: request.displayName,
      preferredName: request.preferredName,
      pronouns: request.pronouns,
      affiliation: request.affiliation,
      participantType: request.participantType,
      participationMode: request.participationMode as ParticipationMode | undefined,
      languagePreference: request.languagePreference,
      accessibilityRequirements: request.accessibilityRequirements,
    };

    const outcome = updateParticipantDetails(
      participant,
      session.status as SessionStatus,
      actor,
      patch,
      now,
    );

    await this.applyOutcome(participantId, request.expectedVersion, outcome, now);

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    return toDetail(updated, includeRestricted);
  }

  /** Restricted — the controller requires `participant:manage_restricted` to reach this. */
  async updateNotes(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    request: UpdateParticipantNotesRequest,
    principal: Principal,
  ): Promise<SessionParticipantDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const participant = toDomainParticipant(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateFacilitatorNotes(
      participant,
      session.status as SessionStatus,
      actor,
      request.facilitatorNotes,
      now,
    );

    await this.applyOutcome(participantId, request.expectedVersion, outcome, now);

    const updated = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    return toDetail(updated, true);
  }

  async transition(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    action: SessionParticipantTransitionRequest,
    principal: Principal,
  ): Promise<SessionParticipantDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const participant = toDomainParticipant(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;

    const outcome = this.applyTransition(participant, status, action, actor, now);

    await this.applyOutcome(participantId, action.expectedVersion, outcome, now);

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireParticipantRow(workspaceId, sessionId, participantId);
    return toDetail(updated, includeRestricted);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private applyTransition(
    participant: SessionParticipant,
    status: SessionStatus,
    action: SessionParticipantTransitionRequest,
    actor: Actor,
    at: Date,
  ): SessionParticipantOutcome {
    switch (action.action) {
      case 'invite':
        return updateInvitationStatus(participant, status, actor, 'invited', at);
      case 'accept_invitation':
        return updateInvitationStatus(participant, status, actor, 'accepted', at);
      case 'decline_invitation':
        return updateInvitationStatus(participant, status, actor, 'declined', at);
      case 'cancel_invitation':
        return updateInvitationStatus(participant, status, actor, 'cancelled', at);
      case 'record_attendance':
        return updateAttendanceStatus(
          participant,
          status,
          actor,
          action.status as ParticipantAttendanceStatus,
          at,
        );
      case 'change_identity_visibility':
        return updateIdentityVisibility(
          participant,
          status,
          actor,
          action.identityVisibility as ParticipantIdentityVisibility,
          at,
        );
      case 'link_user':
        return changeLinkedUser(participant, status, actor, toUserId(action.linkedUserId), at);
      case 'unlink_user':
        return changeLinkedUser(participant, status, actor, null, at);
      case 'withdraw':
        return withdrawParticipant(participant, status, actor, action.reason ?? null, at);
      case 'restore':
        return restoreParticipant(participant, status, actor, at);
      default: {
        const unreachable: never = action;
        throw new Error(`Unhandled participant transition: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  /**
   * Write one domain outcome back, conditioned on the version the client
   * last saw — same conditional `updateMany` pattern as
   * `SessionsService.applyOutcomes`, single-outcome here because no
   * participant operation yet combines two domain calls into one request.
   */
  private async applyOutcome(
    participantId: string,
    expectedVersion: number,
    outcome: SessionParticipantOutcome,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.sessionParticipant.updateMany({
        where: { id: participantId, version: expectedVersion },
        data: toUpdateRow(outcome.participant),
      });

      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This participant was changed by someone else since you last loaded them. ' +
              'Reload and try again.',
          },
        });
      }

      await appendAuditEvent(tx, 'session_participant', participantId, outcome.event, at);
    });
  }

  /** Resolves the `participant:manage_restricted` decision once per request. */
  private async canSeeRestricted(principal: Principal, workspaceId: string): Promise<boolean> {
    const decision = await this.policyEnforcement.decide(
      principal,
      'participant:manage_restricted',
      {
        type: 'workspace',
        workspaceId,
      },
    );
    return decision.allowed;
  }

  private async requireSessionRow(
    workspaceId: string,
    sessionId: string,
  ): Promise<{ id: string; organisationId: string; workspaceId: string; status: string }> {
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

  private async requireParticipantRow(
    workspaceId: string,
    sessionId: string,
    participantId: string,
  ): Promise<ParticipantRow> {
    const row = await this.prisma.sessionParticipant.findUnique({ where: { id: participantId } });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_NOT_FOUND',
          message: `No participant '${participantId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }
}

type ParticipantRow = Awaited<ReturnType<PrismaService['sessionParticipant']['findUniqueOrThrow']>>;

function toDomainParticipant(row: ParticipantRow): SessionParticipant {
  return {
    id: toSessionParticipantId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    linkedUserId: row.linkedUserId !== null ? toUserId(row.linkedUserId) : null,
    displayName: row.displayName,
    preferredName: row.preferredName,
    pronouns: row.pronouns,
    affiliation: row.affiliation,
    participantType: row.participantType,
    participationMode: row.participationMode as SessionParticipant['participationMode'],
    identityMode: row.identityMode as SessionParticipant['identityMode'],
    identityVisibility: row.identityVisibility as SessionParticipant['identityVisibility'],
    languagePreference: row.languagePreference,
    accessibilityRequirements: row.accessibilityRequirements,
    invitationStatus: row.invitationStatus as SessionParticipant['invitationStatus'],
    attendanceStatus: row.attendanceStatus as SessionParticipant['attendanceStatus'],
    consentStatusSummary: row.consentStatusSummary as SessionParticipant['consentStatusSummary'],
    facilitatorNotes: row.facilitatorNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    withdrawnAt: row.withdrawnAt,
    version: row.version,
  };
}

function toCreateRow(participant: SessionParticipant) {
  return {
    id: participant.id,
    organisationId: participant.organisationId,
    workspaceId: participant.workspaceId,
    sessionId: participant.sessionId,
    ...toUpdateRow(participant),
    createdAt: participant.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(participant: SessionParticipant) {
  return {
    linkedUserId: participant.linkedUserId,
    displayName: participant.displayName,
    preferredName: participant.preferredName,
    pronouns: participant.pronouns,
    affiliation: participant.affiliation,
    participantType: participant.participantType,
    participationMode: participant.participationMode,
    identityMode: participant.identityMode,
    identityVisibility: participant.identityVisibility,
    languagePreference: participant.languagePreference,
    accessibilityRequirements: participant.accessibilityRequirements,
    invitationStatus: participant.invitationStatus,
    attendanceStatus: participant.attendanceStatus,
    consentStatusSummary: participant.consentStatusSummary,
    facilitatorNotes: participant.facilitatorNotes,
    updatedAt: participant.updatedAt,
    withdrawnAt: participant.withdrawnAt,
    version: participant.version,
  };
}

/**
 * Privacy-safe by construction — see `SessionParticipantSummary`'s doc
 * comment. `identityRestricted` redacts every identifying field to a
 * generic placeholder when `identityVisibility` is `facilitators_only` and
 * the caller does not hold `participant:manage_restricted`; an `anonymous`
 * participant needs no extra redaction here because
 * `addParticipant`/`updateParticipantDetails` never let those fields carry
 * anything identifying in the first place.
 */
function toSummary(
  row: ParticipantRow,
  includeRestrictedIdentity: boolean,
): SessionParticipantSummary {
  const identityRestricted =
    row.identityVisibility === 'facilitators_only' && !includeRestrictedIdentity;

  return {
    id: row.id,
    sessionId: row.sessionId,
    displayName: identityRestricted ? RESTRICTED_DISPLAY_NAME : row.displayName,
    preferredName: identityRestricted ? null : row.preferredName,
    pronouns: identityRestricted ? null : row.pronouns,
    affiliation: identityRestricted ? null : row.affiliation,
    participantType: row.participantType,
    participationMode: row.participationMode as SessionParticipantSummary['participationMode'],
    identityMode: row.identityMode as SessionParticipantSummary['identityMode'],
    identityVisibility: row.identityVisibility as SessionParticipantSummary['identityVisibility'],
    invitationStatus: row.invitationStatus as SessionParticipantSummary['invitationStatus'],
    attendanceStatus: row.attendanceStatus as SessionParticipantSummary['attendanceStatus'],
    consentStatusSummary:
      row.consentStatusSummary as SessionParticipantSummary['consentStatusSummary'],
    withdrawn: row.withdrawnAt !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `linkedUserId` is included only for a caller holding
 * `participant:manage_restricted`, or unconditionally for a `named`
 * participant (a named, registered participant's account link is not
 * restricted information — see `session-participant.ts`'s file header).
 * `facilitatorNotes` is included only for a caller holding
 * `participant:manage_restricted`. Both are OMITTED (not `null`) when not
 * permitted, so their absence is visible on the wire.
 */
function toDetail(
  row: ParticipantRow,
  includeRestrictedIdentity: boolean,
): SessionParticipantDetail {
  const summary = toSummary(row, includeRestrictedIdentity);
  const showLinkedUser = includeRestrictedIdentity || row.identityMode === 'named';

  return {
    ...summary,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    languagePreference: row.languagePreference,
    accessibilityRequirements: row.accessibilityRequirements,
    createdAt: row.createdAt.toISOString(),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    version: row.version,
    permittedInvitationTransitions: [
      ...permittedInvitationTransitions(row.invitationStatus as ParticipantInvitationStatus),
    ],
    permittedAttendanceTransitions: [
      ...permittedAttendanceTransitions(row.attendanceStatus as ParticipantAttendanceStatus),
    ],
    ...(showLinkedUser ? { linkedUserId: row.linkedUserId } : {}),
    ...(includeRestrictedIdentity ? { facilitatorNotes: row.facilitatorNotes } : {}),
  };
}
