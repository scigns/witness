/**
 * Application layer for external-collaborator workspace invitations
 * (ADR-0028) — the "invite a facilitator/reviewer/Knowledge Steward from
 * another organisation into this one workspace, without making them a
 * member of ours" flow PART 5-9 of the originating request asks for.
 *
 * Deliberately separate from `OrganisationInvitationsService`: no
 * organisation-membership side effect exists anywhere in this file, ever.
 * See `packages/domain/src/workspace-invitation.ts`'s file header for the
 * full reasoning, including why this flow uses a bearer token where the
 * organisation-invitation flow explicitly does not.
 */

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import {
  acceptWorkspaceInvitation,
  addExternalWorkspaceCollaborator,
  assignExternalWorkspaceRole,
  createWorkspaceInvitation,
  declineWorkspaceInvitation,
  markWorkspaceInvitationExpired,
  permittedActionsForRole,
  recordWorkspaceInvitationDelivery,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  toOrganisationId,
  toRoleAssignmentId,
  toUserId,
  toWorkspaceId,
  toWorkspaceInvitationId,
  toWorkspaceMembershipId,
  type WitnessRole,
} from '@witness/domain';
import type { Actor } from '@witness/domain';
import type {
  CreateWorkspaceInvitationRequest,
  WorkspaceInvitationContextView,
  WorkspaceInvitationView,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { sha256 } from '../infrastructure/hashing.js';
import { MailerService } from '../infrastructure/mailer.js';
import { roleLabel } from '../infrastructure/role.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import { WITNESS_CONFIG } from '../tokens.js';
import type { WitnessConfig } from '@witness/config';
import { Inject } from '@nestjs/common';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

/**
 * The real `witness_user.id` behind a signed-in principal — distinct from
 * `resolveActor`'s `Actor` row, which exists only for the audit chain.
 * `inviterId` is a real foreign key to `User`, so it needs this, not an
 * Actor id. Mirrors the identical pattern already used by
 * `workspaces.service.ts`/`organisations.service.ts` for the same reason.
 */
function requirePrincipalUserId(principal: Principal): string {
  if (!principal.subject.startsWith('user:')) {
    throw new ForbiddenException({
      error: {
        code: 'USER_PRINCIPAL_REQUIRED',
        message: 'Only a signed-in user account may send a workspace invitation.',
      },
    });
  }
  return principal.subject.slice('user:'.length);
}

@Injectable()
export class WorkspaceInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mailer?: MailerService,
    @Optional() @Inject(WITNESS_CONFIG) private readonly config?: WitnessConfig,
  ) {}

  async create(
    workspaceId: string,
    request: CreateWorkspaceInvitationRequest,
    principal: Principal,
  ): Promise<WorkspaceInvitationView> {
    const workspace = await this.requireWorkspace(workspaceId);
    const inviterUserId = requirePrincipalUserId(principal);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const token = newToken();

    const outcome = createWorkspaceInvitation({
      id: toWorkspaceInvitationId(randomUUID()),
      organisationId: toOrganisationId(workspace.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      invitedEmail: request.invitedEmail,
      invitedName: request.invitedName ?? null,
      inviterId: toUserId(inviterUserId),
      role: request.role,
      affiliationType: request.affiliationType,
      affiliationLabel: request.affiliationLabel ?? null,
      message: request.message ?? null,
      tokenHash: token.hash,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      invitedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.create({ data: toRow(outcome.invitation) });
      await appendAuditEvent(tx, 'workspace_invitation', outcome.invitation.id, outcome.event, now);
    });

    await this.deliver(outcome.invitation.id, token.raw, actor);

    return this.toView(outcome.invitation.id);
  }

  async list(workspaceId: string): Promise<WorkspaceInvitationView[]> {
    await this.requireWorkspace(workspaceId);
    const rows = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId },
      include: { inviter: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toViewFromRow);
  }

  async resend(
    workspaceId: string,
    invitationId: string,
    principal: Principal,
  ): Promise<WorkspaceInvitationView> {
    const invitation = await this.requireInvitation(workspaceId, invitationId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const token = newToken();

    const outcome = resendWorkspaceInvitation(
      fromRow(invitation),
      token.hash,
      new Date(now.getTime() + INVITATION_TTL_MS),
      actor,
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: {
          status: outcome.invitation.status,
          tokenHash: outcome.invitation.tokenHash,
          expiresAt: outcome.invitation.expiresAt,
          resendCount: outcome.invitation.resendCount,
          updatedAt: now,
        },
      });
      await appendAuditEvent(tx, 'workspace_invitation', invitationId, outcome.event, now);
    });

    await this.deliver(invitationId, token.raw, actor);

    return this.toView(invitationId);
  }

  async revoke(
    workspaceId: string,
    invitationId: string,
    principal: Principal,
  ): Promise<WorkspaceInvitationView> {
    const invitation = await this.requireInvitation(workspaceId, invitationId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = revokeWorkspaceInvitation(fromRow(invitation), actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: {
          status: outcome.invitation.status,
          revokedAt: outcome.invitation.revokedAt,
          updatedAt: now,
        },
      });
      await appendAuditEvent(tx, 'workspace_invitation', invitationId, outcome.event, now);
    });

    return this.toView(invitationId);
  }

  /**
   * Public — reachable with only the raw token, no authentication (PART 7:
   * full context before sign-in). Never returns the token or anything
   * beyond what a prospective invitee needs to decide whether to accept.
   */
  async getContext(rawToken: string): Promise<WorkspaceInvitationContextView> {
    const invitation = await this.findByToken(rawToken);
    const [organisation, workspace, inviter] = await Promise.all([
      this.prisma.organisation.findUniqueOrThrow({
        where: { id: invitation.organisationId },
        select: { name: true },
      }),
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: invitation.workspaceId },
        select: { name: true, description: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: invitation.inviterId },
        select: { displayName: true },
      }),
    ]);

    const displayStatus = await this.effectiveStatus(invitation);

    return {
      organisationName: organisation.name,
      workspaceName: workspace.name,
      workspaceDescription: workspace.description,
      inviterDisplayName: inviter.displayName,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role as WitnessRole,
      roleLabel: roleLabel(invitation.role as WitnessRole),
      affiliationType:
        invitation.affiliationType as WorkspaceInvitationContextView['affiliationType'],
      affiliationLabel: invitation.affiliationLabel,
      message: invitation.message,
      status: displayStatus as WorkspaceInvitationContextView['status'],
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accept — `sessionUserId`/`sessionEmail` come from the caller's resolved
   * session (controller layer), never from the request body: reading
   * `workspaceId`/`role` only from the invitation row, and the acting
   * identity only from the session, is what makes tampering structurally
   * impossible rather than merely checked (ADR-0028).
   */
  async accept(
    rawToken: string,
    sessionUserId: string,
    sessionEmail: string,
    principal: Principal,
  ): Promise<{ workspaceId: string; role: WitnessRole }> {
    const invitation = await this.findByToken(rawToken);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const emailMatches =
      invitation.invitedEmail.toLowerCase() === sessionEmail.trim().toLowerCase();

    let outcome;
    try {
      outcome = acceptWorkspaceInvitation(
        fromRow(invitation),
        toUserId(sessionUserId),
        emailMatches,
        actor,
        now,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not match')) {
        throw new ForbiddenException({
          error: {
            code: 'INVITATION_EMAIL_MISMATCH',
            message:
              'This invitation was sent to a different email address than the one you are signed in with.',
          },
        });
      }
      if (error instanceof Error && error.message.includes('expired')) {
        throw new ConflictException({
          error: { code: 'INVITATION_EXPIRED', message: 'This invitation has expired.' },
        });
      }
      throw new ConflictException({
        error: { code: 'INVITATION_NOT_PENDING', message: 'This invitation is no longer pending.' },
      });
    }

    const membershipOutcome = addExternalWorkspaceCollaborator({
      id: toWorkspaceMembershipId(randomUUID()),
      workspaceId: toWorkspaceId(invitation.workspaceId),
      userId: toUserId(sessionUserId),
      affiliationType: invitation.affiliationType,
      affiliationLabel: invitation.affiliationLabel,
      viaInvitationId: toWorkspaceInvitationId(invitation.id),
      addedBy: actor,
      at: now,
    });

    const roleOutcome = assignExternalWorkspaceRole({
      id: toRoleAssignmentId(randomUUID()),
      userId: toUserId(sessionUserId),
      role: invitation.role,
      workspaceId: toWorkspaceId(invitation.workspaceId),
      viaInvitationId: toWorkspaceInvitationId(invitation.id),
      assignedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      // Idempotency / no-replay under concurrency: this conditional update
      // only succeeds if the row is still 'pending' at the moment of the
      // write, closing the race a plain read-then-write would leave open
      // between two simultaneous accept requests for the same token.
      const updated = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: 'pending' },
        data: {
          status: outcome.invitation.status,
          acceptedAt: outcome.invitation.acceptedAt,
          acceptedByUserId: sessionUserId,
          updatedAt: now,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          error: {
            code: 'INVITATION_NOT_PENDING',
            message: 'This invitation is no longer pending.',
          },
        });
      }

      await appendAuditEvent(tx, 'workspace_invitation', invitation.id, outcome.event, now);

      await tx.workspaceMembership.create({
        data: {
          id: membershipOutcome.membership.id,
          workspaceId: membershipOutcome.membership.workspaceId,
          userId: membershipOutcome.membership.userId,
          state: membershipOutcome.membership.state,
          affiliationType: membershipOutcome.membership.affiliationType,
          affiliationLabel: membershipOutcome.membership.affiliationLabel,
          viaInvitationId: membershipOutcome.membership.viaInvitationId,
          createdAt: membershipOutcome.membership.createdAt,
          updatedAt: membershipOutcome.membership.updatedAt,
        },
      });
      await appendAuditEvent(
        tx,
        'workspace_membership',
        membershipOutcome.membership.id,
        membershipOutcome.event,
        now,
      );

      await tx.roleAssignment.create({
        data: {
          id: roleOutcome.assignment.id,
          scopeType: 'workspace',
          workspaceId: invitation.workspaceId,
          userId: roleOutcome.assignment.userId,
          role: roleOutcome.assignment.role,
          viaInvitationId: roleOutcome.assignment.viaInvitationId,
          createdAt: roleOutcome.assignment.createdAt,
          updatedAt: roleOutcome.assignment.updatedAt,
        },
      });
      await appendAuditEvent(
        tx,
        'role_assignment',
        roleOutcome.assignment.id,
        roleOutcome.event,
        now,
      );
    });

    return { workspaceId: invitation.workspaceId, role: invitation.role as WitnessRole };
  }

  async decline(rawToken: string): Promise<void> {
    const invitation = await this.findByToken(rawToken);
    const actor: Actor = await resolveActor(this.prisma, {
      subject: `invitation:${invitation.id}`,
      displayName: invitation.invitedName ?? invitation.invitedEmail,
      kind: 'human',
      roles: [],
    });
    const now = new Date();

    const outcome = declineWorkspaceInvitation(fromRow(invitation), actor, now);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: 'pending' },
        data: {
          status: outcome.invitation.status,
          declinedAt: outcome.invitation.declinedAt,
          updatedAt: now,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          error: {
            code: 'INVITATION_NOT_PENDING',
            message: 'This invitation is no longer pending.',
          },
        });
      }
      await appendAuditEvent(tx, 'workspace_invitation', invitation.id, outcome.event, now);
    });
  }

  private async deliver(invitationId: string, rawToken: string, actor: Actor): Promise<void> {
    if (this.mailer === undefined || this.config === undefined) return;
    const now = new Date();
    const invitation = await this.prisma.workspaceInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: {
        organisation: { select: { name: true } },
        workspace: { select: { name: true } },
        inviter: { select: { displayName: true } },
      },
    });
    const invitationUrl = new URL(
      `workspace-invitations/${rawToken}`,
      this.config.webBaseUrl,
    ).toString();

    let result: { readonly messageId: string | null };
    try {
      result = await this.mailer.sendWorkspaceInvitation({
        to: invitation.invitedEmail,
        organisationName: invitation.organisation.name,
        workspaceName: invitation.workspace.name,
        inviterDisplayName: invitation.inviter.displayName,
        role: roleLabel(invitation.role as WitnessRole),
        invitationUrl,
        expiresAt: invitation.expiresAt,
        message: invitation.message,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'SMTP delivery failed.';
      const outcome = recordWorkspaceInvitationDelivery(
        fromRow(invitation),
        { status: 'failed', error: message },
        actor,
        now,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.workspaceInvitation.update({
          where: { id: invitationId },
          data: {
            deliveryStatus: outcome.invitation.deliveryStatus,
            deliveryAttempts: outcome.invitation.deliveryAttempts,
            lastDeliveryError: outcome.invitation.lastDeliveryError,
            updatedAt: now,
          },
        });
        await appendAuditEvent(tx, 'workspace_invitation', invitationId, outcome.event, now);
      });
      return;
    }

    const outcome = recordWorkspaceInvitationDelivery(
      fromRow(invitation),
      { status: 'sent' },
      actor,
      now,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: {
          deliveryStatus: outcome.invitation.deliveryStatus,
          deliveryAttempts: outcome.invitation.deliveryAttempts,
          lastDeliveryError: null,
          updatedAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'workspace_invitation',
        invitationId,
        {
          ...outcome.event,
          metadata: { ...outcome.event.metadata, messageId: result.messageId ?? '' },
        },
        now,
      );
    });
  }

  private async findByToken(rawToken: string): Promise<InvitationRow> {
    const hash = sha256(rawToken);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: { tokenHash: hash },
    });
    if (invitation === null) {
      throw new NotFoundException({
        error: { code: 'INVITATION_NOT_FOUND', message: 'This invitation link is not valid.' },
      });
    }
    return invitation;
  }

  private async effectiveStatus(invitation: InvitationRow): Promise<InvitationRow['status']> {
    if (invitation.status === 'pending' && invitation.expiresAt.getTime() <= Date.now()) {
      const actor: Actor = await resolveActor(this.prisma, {
        subject: 'system:invitation-expiry',
        displayName: 'Witness (system)',
        kind: 'system',
        roles: [],
      });
      const now = new Date();
      const outcome = markWorkspaceInvitationExpired(fromRow(invitation), actor, now);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.workspaceInvitation.updateMany({
          where: { id: invitation.id, status: 'pending' },
          data: { status: outcome.invitation.status, updatedAt: now },
        });
        if (updated.count > 0) {
          await appendAuditEvent(tx, 'workspace_invitation', invitation.id, outcome.event, now);
        }
      });
      return 'expired';
    }
    return invitation.status;
  }

  private async toView(invitationId: string): Promise<WorkspaceInvitationView> {
    const row = await this.prisma.workspaceInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: { inviter: { select: { displayName: true } } },
    });
    return toViewFromRow(row);
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

  private async requireInvitation(
    workspaceId: string,
    invitationId: string,
  ): Promise<InvitationRow> {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
    });
    if (invitation === null || invitation.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'INVITATION_NOT_FOUND',
          message: `No invitation '${invitationId}' in workspace '${workspaceId}'.`,
        },
      });
    }
    return invitation;
  }
}

// ─── Row <-> domain mapping ──────────────────────────────────────────────

interface InvitationRow {
  id: string;
  organisationId: string;
  workspaceId: string;
  invitedEmail: string;
  invitedName: string | null;
  inviterId: string;
  role: string;
  affiliationType: string;
  affiliationLabel: string | null;
  message: string | null;
  status: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  resendCount: number;
  deliveryStatus: string;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRow(invitation: ReturnType<typeof createWorkspaceInvitation>['invitation']) {
  return {
    id: invitation.id,
    organisationId: invitation.organisationId,
    workspaceId: invitation.workspaceId,
    invitedEmail: invitation.invitedEmail,
    invitedName: invitation.invitedName,
    inviterId: invitation.inviterId,
    role: invitation.role,
    affiliationType: invitation.affiliationType,
    affiliationLabel: invitation.affiliationLabel,
    message: invitation.message,
    status: invitation.status,
    tokenHash: invitation.tokenHash,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    acceptedByUserId: invitation.acceptedByUserId,
    declinedAt: invitation.declinedAt,
    revokedAt: invitation.revokedAt,
    resendCount: invitation.resendCount,
    deliveryStatus: invitation.deliveryStatus,
    deliveryAttempts: invitation.deliveryAttempts,
    lastDeliveryError: invitation.lastDeliveryError,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}

function fromRow(row: InvitationRow) {
  return {
    id: toWorkspaceInvitationId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    invitedEmail: row.invitedEmail,
    invitedName: row.invitedName,
    inviterId: toUserId(row.inviterId),
    role: row.role as WitnessRole,
    affiliationType: row.affiliationType as ReturnType<
      typeof createWorkspaceInvitation
    >['invitation']['affiliationType'],
    affiliationLabel: row.affiliationLabel,
    message: row.message,
    status: row.status as ReturnType<typeof createWorkspaceInvitation>['invitation']['status'],
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    acceptedByUserId: row.acceptedByUserId === null ? null : toUserId(row.acceptedByUserId),
    declinedAt: row.declinedAt,
    revokedAt: row.revokedAt,
    resendCount: row.resendCount,
    deliveryStatus: row.deliveryStatus as ReturnType<
      typeof createWorkspaceInvitation
    >['invitation']['deliveryStatus'],
    deliveryAttempts: row.deliveryAttempts,
    lastDeliveryError: row.lastDeliveryError,
    updatedAt: row.updatedAt,
  };
}

function toViewFromRow(
  row: InvitationRow & { inviter: { displayName: string } },
): WorkspaceInvitationView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    invitedEmail: row.invitedEmail,
    invitedName: row.invitedName,
    inviterDisplayName: row.inviter.displayName,
    role: row.role as WitnessRole,
    affiliationType: row.affiliationType as WorkspaceInvitationView['affiliationType'],
    affiliationLabel: row.affiliationLabel,
    status: row.status as WorkspaceInvitationView['status'],
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    declinedAt: row.declinedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    resendCount: row.resendCount,
    deliveryStatus: row.deliveryStatus as WorkspaceInvitationView['deliveryStatus'],
  };
}

// Referenced only for its role-permission list re-export convenience in
// controllers that want to show what a role grants alongside this view.
export { permittedActionsForRole };
