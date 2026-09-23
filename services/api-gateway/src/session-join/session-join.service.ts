/**
 * Application layer for governed QR/link session joining (Phase 5,
 * Workstream 1.6) — the "scan a QR code, become a `SessionParticipant`,
 * with no facilitator typing anyone's name in" flow.
 *
 * Two client-facing halves, same split as `workspace-invitations.service.ts`:
 * link management (`create`/`list`/`revoke`) is facilitator-authenticated and
 * gated by `AuthorizationGuard` at the controller; `getContext`/`join` are
 * reachable by token possession alone — there is no workspace-scoped grant
 * to check yet for `join`, that is exactly what it produces (same reasoning
 * `WorkspaceInvitationTokenController.accept` documents).
 *
 * `governanceMode` decides what a joining request additionally needs, but
 * the decision is made here, not in the domain (ADR-0003 — the domain
 * cannot see a session cookie or a WorkspaceMembership row):
 *  - `invited_only`  — a valid session AND an active WorkspaceMembership.
 *  - `verified_guest`— a valid session; no prior membership required.
 *  - `pseudonymous`  — no session; caller supplies a display name; never
 *                       linked to any account, signed in or not.
 *  - `anonymous`     — no session, no display name; `identityMode` forced
 *                       to `'anonymous'` by `addParticipant` itself.
 *
 * Idempotency and rate-limiting mirror `manual-settlement.service.ts`'s
 * proven pattern: a Postgres advisory lock scoped to the join link, then a
 * unique-constraint-backed replay check — a retried join (flaky mobile
 * network resubmitting the same request) resolves to the same participant
 * rather than creating a duplicate.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';

import {
  addParticipant,
  assertSessionJoinLinkUsable,
  createSessionJoinLink,
  recordSessionJoinLinkUse,
  revokeSessionJoinLink,
  toCoDesignSessionId,
  toOrganisationId,
  toSessionJoinLinkId,
  toSessionParticipantId,
  toUserId,
  toWorkspaceId,
  type Actor,
  type SessionJoinGovernanceMode,
  type SessionJoinLink,
  type SessionStatus,
} from '@witness/domain';
import type {
  CreateSessionJoinLinkRequest,
  JoinSessionRequest,
  JoinSessionResult,
  SessionJoinContextView,
  SessionJoinLinkCreatedView,
  SessionJoinLinkView,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { sha256 } from '../infrastructure/hashing.js';
import { sessionToken } from '../authn/browser-session.js';
import { SessionService } from '../authn/session.service.js';
import type { Principal } from '../authz/authorization.port.js';

/** Same trailing-window burst guard shape as any token-bucket, sized for a
 * roomful of phones scanning at once, not a scripted flood. */
const JOIN_RATE_LIMIT_WINDOW_MS = 60_000;
const JOIN_RATE_LIMIT_MAX_PER_WINDOW = 30;

function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

function hashIp(address: string | undefined): string | null {
  if (address === undefined || address.length === 0) return null;
  return createHash('sha256').update(address, 'utf8').digest('hex');
}

interface JoinLinkRow {
  id: string;
  organisationId: string;
  workspaceId: string;
  sessionId: string;
  governanceMode: string;
  tokenHash: string;
  status: string;
  createdByUserId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomainLink(row: JoinLinkRow): SessionJoinLink {
  return {
    id: toSessionJoinLinkId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    governanceMode: row.governanceMode as SessionJoinGovernanceMode,
    tokenHash: row.tokenHash,
    status: row.status as SessionJoinLink['status'],
    createdByUserId: toUserId(row.createdByUserId),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    maxUses: row.maxUses,
    useCount: row.useCount,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class SessionJoinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  // ─── Facilitator-facing (AuthorizationGuard-gated at the controller) ──────

  async create(
    workspaceId: string,
    sessionId: string,
    request: CreateSessionJoinLinkRequest,
    principal: Principal,
  ): Promise<SessionJoinLinkCreatedView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const actor = await resolveActor(this.prisma, principal);
    const createdByUserId = requirePrincipalUserId(principal);
    const now = new Date();
    const token = newToken();

    const outcome = createSessionJoinLink({
      id: toSessionJoinLinkId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      governanceMode: request.governanceMode,
      tokenHash: token.hash,
      expiresAt: new Date(now.getTime() + request.expiresInMinutes * 60_000),
      maxUses: request.maxUses ?? null,
      createdByUserId: toUserId(createdByUserId),
      createdBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionJoinLink.create({ data: toCreateRow(outcome.link) });
      await appendAuditEvent(tx, 'session_join_link', outcome.link.id, outcome.event, now);
    });

    return {
      ...toView(outcome.link, principal.displayName),
      token: token.raw,
      joinPath: `/join/${token.raw}`,
    };
  }

  async list(workspaceId: string, sessionId: string): Promise<SessionJoinLinkView[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const rows = await this.prisma.sessionJoinLink.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { displayName: true } } },
    });

    return rows.map((row) => toView(toDomainLink(row), row.createdBy.displayName));
  }

  async revoke(
    workspaceId: string,
    sessionId: string,
    linkId: string,
    principal: Principal,
  ): Promise<SessionJoinLinkView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireLinkRow(sessionId, linkId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = revokeSessionJoinLink(toDomainLink(row), actor, now);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.sessionJoinLink.updateMany({
        where: { id: linkId, status: 'active' },
        data: { status: outcome.link.status, revokedAt: outcome.link.revokedAt, updatedAt: now },
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: { code: 'ALREADY_INACTIVE', message: 'This join link is no longer active.' },
        });
      }
      await appendAuditEvent(tx, 'session_join_link', linkId, outcome.event, now);
    });

    const createdBy = await this.prisma.user.findUnique({
      where: { id: row.createdByUserId },
      select: { displayName: true },
    });
    return toView(outcome.link, createdBy?.displayName ?? 'Unknown');
  }

  // ─── Public — token possession only ────────────────────────────────────

  async getContext(rawToken: string): Promise<SessionJoinContextView> {
    const row = await this.findByToken(rawToken);
    const session = await this.prisma.coDesignSession.findUniqueOrThrow({
      where: { id: row.sessionId },
      include: {
        organisation: { select: { name: true } },
        workspace: { select: { name: true } },
        primaryFacilitator: { select: { displayName: true } },
      },
    });

    const governanceMode = row.governanceMode as SessionJoinGovernanceMode;

    return {
      organisationName: session.organisation.name,
      workspaceName: session.workspace.name,
      sessionId: session.id,
      sessionTitle: session.title,
      facilitatorDisplayName: session.primaryFacilitator.displayName,
      governanceMode,
      status: row.status as SessionJoinContextView['status'],
      sessionStatus: session.status,
      expiresAt: row.expiresAt.toISOString(),
      requiresSignIn: governanceMode === 'invited_only' || governanceMode === 'verified_guest',
      requiresDisplayName: governanceMode === 'pseudonymous' || governanceMode === 'verified_guest',
    };
  }

  async join(
    rawToken: string,
    request: JoinSessionRequest,
    httpRequest: Request,
  ): Promise<JoinSessionResult> {
    const linkRow = await this.findByToken(rawToken);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Serialises every join against this one link — the same
      // advisory-lock-then-replay-check pattern manual-settlement.service.ts
      // already uses for exactly-once settlement, applied here so a
      // double-submit race can never create two participants for one
      // clientRequestId.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('session_join'), hashtext(${linkRow.id}))`;

      const replay = await tx.sessionJoinAttempt.findUnique({
        where: {
          joinLinkId_clientRequestId: {
            joinLinkId: linkRow.id,
            clientRequestId: request.clientRequestId,
          },
        },
      });
      if (replay !== null && replay.participantId !== null) {
        const participant = await tx.sessionParticipant.findUniqueOrThrow({
          where: { id: replay.participantId },
        });
        return {
          participantId: participant.id,
          sessionId: participant.sessionId,
          workspaceId: participant.workspaceId,
          identityMode: participant.identityMode as JoinSessionResult['identityMode'],
          displayName: participant.displayName,
        };
      }

      await this.assertRateLimitOk(tx as PrismaService, linkRow.id, now);

      const session = await tx.coDesignSession.findUniqueOrThrow({
        where: { id: linkRow.sessionId },
      });
      if (session.status !== 'open') {
        throw new ForbiddenException({
          error: {
            code: 'SESSION_NOT_OPEN',
            message: 'This session is not currently open for joining.',
          },
        });
      }

      const link = toDomainLink(linkRow);
      assertSessionJoinLinkUsable(link, now);

      const identity = await this.resolveIdentity(
        link.governanceMode,
        request,
        httpRequest,
        linkRow.workspaceId,
      );

      const outcome = addParticipant(session.status as SessionStatus, {
        id: toSessionParticipantId(randomUUID()),
        organisationId: toOrganisationId(linkRow.organisationId),
        workspaceId: toWorkspaceId(linkRow.workspaceId),
        sessionId: toCoDesignSessionId(linkRow.sessionId),
        linkedUserId: identity.linkedUserId,
        displayName: identity.displayName,
        participantType: 'participant',
        participationMode: identity.linkedUserId != null ? 'in_person' : 'in_person',
        identityMode: identity.identityMode,
        addedBy: identity.actor,
        at: now,
      });

      const updatedLink = recordSessionJoinLinkUse(link, now);

      await tx.sessionParticipant.create({ data: toCreateParticipantRow(outcome.participant) });
      await tx.sessionJoinLink.update({
        where: { id: link.id },
        data: { useCount: updatedLink.useCount, updatedAt: now },
      });
      await tx.sessionJoinAttempt.create({
        data: {
          id: randomUUID(),
          joinLinkId: link.id,
          clientRequestId: request.clientRequestId,
          participantId: outcome.participant.id,
          ipHash: hashIp(httpRequest.socket?.remoteAddress),
          createdAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'session_participant',
        outcome.participant.id,
        {
          action: 'session_participant.joined_via_link',
          actor: identity.actor,
          metadata: { sessionId: linkRow.sessionId, governanceMode: link.governanceMode },
        },
        now,
      );

      return {
        participantId: outcome.participant.id,
        sessionId: outcome.participant.sessionId,
        workspaceId: outcome.participant.workspaceId,
        identityMode: outcome.participant.identityMode,
        displayName: outcome.participant.displayName,
      };
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async assertRateLimitOk(tx: PrismaService, joinLinkId: string, now: Date): Promise<void> {
    const since = new Date(now.getTime() - JOIN_RATE_LIMIT_WINDOW_MS);
    const recentCount = await tx.sessionJoinAttempt.count({
      where: { joinLinkId, createdAt: { gte: since } },
    });
    if (recentCount >= JOIN_RATE_LIMIT_MAX_PER_WINDOW) {
      throw new HttpException(
        {
          error: {
            code: 'JOIN_RATE_LIMITED',
            message: 'Too many people are joining through this link right now. Try again shortly.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async resolveIdentity(
    governanceMode: SessionJoinGovernanceMode,
    request: JoinSessionRequest,
    httpRequest: Request,
    workspaceId: string,
  ): Promise<{
    identityMode: 'named' | 'pseudonymous' | 'anonymous';
    linkedUserId: ReturnType<typeof toUserId> | null;
    displayName: string | undefined;
    actor: Actor;
  }> {
    if (governanceMode === 'anonymous') {
      const actor = await resolveActor(this.prisma, {
        subject: `session_join:anonymous:${randomUUID()}`,
        displayName: 'Anonymous participant',
        kind: 'human',
        roles: [],
      });
      return { identityMode: 'anonymous', linkedUserId: null, displayName: undefined, actor };
    }

    if (governanceMode === 'pseudonymous') {
      if (request.displayName === undefined || request.displayName.trim().length === 0) {
        throw new BadRequestException({
          error: { code: 'DISPLAY_NAME_REQUIRED', message: 'A display name is required to join.' },
        });
      }
      const actor = await resolveActor(this.prisma, {
        subject: `session_join:pseudonymous:${randomUUID()}`,
        displayName: request.displayName,
        kind: 'human',
        roles: [],
      });
      return {
        identityMode: 'pseudonymous',
        linkedUserId: null,
        displayName: request.displayName,
        actor,
      };
    }

    // verified_guest / invited_only both require a real, verified session —
    // never the unverified X-Witness-Dev-User header, same discipline
    // AuthorizationGuard applies to invoice/platform-role actions.
    const token = sessionToken(httpRequest);
    if (token === null) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to join this session.' },
      });
    }
    const resolved = await this.sessions.resolveSession(token);
    if (resolved.status !== 'valid') {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to join this session.' },
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: resolved.userId } });
    if (user === null || user.accountState === 'suspended' || user.accountState === 'deactivated') {
      throw new UnauthorizedException({
        error: { code: 'ACCOUNT_NOT_USABLE', message: 'This account cannot join sessions.' },
      });
    }

    if (governanceMode === 'invited_only') {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
      });
      if (membership === null || membership.state !== 'active') {
        throw new ForbiddenException({
          error: {
            code: 'NOT_INVITED',
            message: 'Only people already invited into this workspace can join this session.',
          },
        });
      }
    }

    const actor = await resolveActor(this.prisma, {
      subject: `user:${user.id}`,
      displayName: user.displayName,
      kind: 'human',
      roles: [],
    });
    return {
      identityMode: 'named',
      linkedUserId: toUserId(user.id),
      displayName: user.displayName,
      actor,
    };
  }

  private async findByToken(rawToken: string): Promise<JoinLinkRow> {
    const tokenHash = sha256(rawToken);
    const row = await this.prisma.sessionJoinLink.findFirst({ where: { tokenHash } });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'JOIN_LINK_NOT_FOUND', message: 'This join link is invalid.' },
      });
    }
    return row;
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

  private async requireLinkRow(sessionId: string, linkId: string): Promise<JoinLinkRow> {
    const row = await this.prisma.sessionJoinLink.findUnique({ where: { id: linkId } });
    if (row === null || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'JOIN_LINK_NOT_FOUND',
          message: `No join link '${linkId}' on this session.`,
        },
      });
    }
    return row;
  }
}

function requirePrincipalUserId(principal: Principal): string {
  if (!principal.subject.startsWith('user:')) {
    throw new ForbiddenException({
      error: {
        code: 'USER_PRINCIPAL_REQUIRED',
        message: 'Only a signed-in user account may create a session join link.',
      },
    });
  }
  return principal.subject.slice('user:'.length);
}

function toCreateRow(link: SessionJoinLink) {
  return {
    id: link.id,
    organisationId: link.organisationId,
    workspaceId: link.workspaceId,
    sessionId: link.sessionId,
    governanceMode: link.governanceMode,
    tokenHash: link.tokenHash,
    status: link.status,
    createdByUserId: link.createdByUserId,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    maxUses: link.maxUses,
    useCount: link.useCount,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

function toCreateParticipantRow(participant: {
  id: string;
  organisationId: string;
  workspaceId: string;
  sessionId: string;
  linkedUserId: string | null;
  displayName: string;
  preferredName: string | null;
  pronouns: string | null;
  affiliation: string | null;
  participantType: string;
  participationMode: string;
  identityMode: string;
  identityVisibility: string;
  languagePreference: string | null;
  accessibilityRequirements: string | null;
  invitationStatus: string;
  attendanceStatus: string;
  consentStatusSummary: string;
  facilitatorNotes: string | null;
}) {
  return {
    id: participant.id,
    organisationId: participant.organisationId,
    workspaceId: participant.workspaceId,
    sessionId: participant.sessionId,
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
  };
}

function toView(link: SessionJoinLink, createdByDisplayName: string): SessionJoinLinkView {
  return {
    id: link.id,
    sessionId: link.sessionId,
    governanceMode: link.governanceMode,
    status: link.status,
    createdByDisplayName,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    maxUses: link.maxUses,
    useCount: link.useCount,
  };
}
