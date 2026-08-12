/**
 * Application layer for workspaces.
 *
 * Mirrors `OrganisationsService`, with one addition: a workspace cannot be
 * created without an existing organisation, and confirming that requires a
 * database read the domain is not allowed to perform itself (ADR-0003) — so it
 * happens here, before `createWorkspace` is ever called.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createActor,
  createAuditEvent,
  createWorkspace,
  toActorId,
  toAuditEventId,
  toOrganisationId,
  toWorkspaceId,
  updateWorkspaceDetails,
  type Actor,
  type Workspace,
} from '@witness/domain';
import type { WorkspaceSummary } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A real, verified session only sees workspaces it can reach: a direct
   * workspace membership, or membership in the workspace's parent
   * organisation (mirrors the "an organisation administrator's remit
   * extends to the workspaces under their organisation" cascade in
   * `RoleResolutionService`). The unverified `X-Witness-Dev-User` path is
   * untouched — see `OrganisationsService.list` for why.
   */
  async list(principal: Principal): Promise<WorkspaceSummary[]> {
    const reach = await this.memberReach(principal);

    const rows = await this.prisma.workspace.findMany({
      where:
        reach === null
          ? {}
          : {
              OR: [
                { id: { in: reach.workspaceIds } },
                { organisationId: { in: reach.organisationIds } },
              ],
            },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      organisationId: row.organisationId,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** `null` means "unscoped — return everything" (the dev-header path). */
  private async memberReach(
    principal: Principal,
  ): Promise<{ workspaceIds: string[]; organisationIds: string[] } | null> {
    if (!principal.subject.startsWith('user:')) return null;

    const userId = principal.subject.slice('user:'.length);
    const [workspaceMemberships, organisationMemberships] = await Promise.all([
      this.prisma.workspaceMembership.findMany({
        where: { userId },
        select: { workspaceId: true },
      }),
      this.prisma.organisationMembership.findMany({
        where: { userId },
        select: { organisationId: true },
      }),
    ]);

    return {
      workspaceIds: workspaceMemberships.map((m) => m.workspaceId),
      organisationIds: organisationMemberships.map((m) => m.organisationId),
    };
  }

  async create(
    name: string,
    organisationId: string,
    principal: Principal,
    description?: string,
  ): Promise<WorkspaceSummary> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
    });

    if (organisation === null) {
      throw new NotFoundException({
        error: {
          code: 'ORGANISATION_NOT_FOUND',
          message: `No organisation with id '${organisationId}'.`,
        },
      });
    }

    const actor = await this.resolveActor(principal);
    const now = new Date();

    const outcome = createWorkspace({
      id: toWorkspaceId(randomUUID()),
      organisationId: toOrganisationId(organisationId),
      name,
      description: description ?? null,
      createdBy: actor,
      createdAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspace.create({
        data: {
          id: outcome.workspace.id,
          name: outcome.workspace.name,
          description: outcome.workspace.description,
          organisationId: outcome.workspace.organisationId,
          createdAt: outcome.workspace.createdAt,
        },
      });

      const event = createAuditEvent(
        {
          id: toAuditEventId(randomUUID()),
          subjectType: 'workspace',
          subjectId: outcome.workspace.id,
          action: outcome.event.action,
          actor: outcome.event.actor,
          occurredAt: now,
          // The workspace's own chain starts here — nothing can precede the
          // event that brought the subject itself into existence.
          previousHash: null,
          metadata: { ...outcome.event.metadata },
        },
        sha256,
      );

      await tx.auditEvent.create({
        data: {
          id: event.id,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          action: event.action,
          actorId: event.actor.id,
          occurredAt: event.occurredAt,
          previousHash: event.previousHash,
          hash: event.hash,
          metadata: event.metadata,
        },
      });
    });

    return {
      id: outcome.workspace.id,
      name: outcome.workspace.name,
      organisationId: outcome.workspace.organisationId,
      description: outcome.workspace.description,
      createdAt: outcome.workspace.createdAt.toISOString(),
    };
  }

  async updateDetails(
    workspaceId: string,
    input: { description?: string | null },
    principal: Principal,
  ): Promise<WorkspaceSummary> {
    const row = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }

    const current: Workspace = {
      id: toWorkspaceId(row.id),
      organisationId: toOrganisationId(row.organisationId),
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
    };

    const actor = await this.resolveActor(principal);
    const now = new Date();
    const outcome = updateWorkspaceDetails(current, input, actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { description: outcome.workspace.description },
      });
      await appendAuditEvent(tx, 'workspace', outcome.workspace.id, outcome.event, now);
    });

    return {
      id: outcome.workspace.id,
      name: outcome.workspace.name,
      organisationId: outcome.workspace.organisationId,
      description: outcome.workspace.description,
      createdAt: outcome.workspace.createdAt.toISOString(),
    };
  }

  /** Find or create the Actor row for a principal. */
  private async resolveActor(principal: Principal): Promise<Actor> {
    const existing = await this.prisma.actor.findFirst({
      where: { displayName: principal.displayName, kind: principal.kind },
    });

    if (existing !== null) {
      return createActor({
        id: toActorId(existing.id),
        kind: existing.kind as Actor['kind'],
        displayName: existing.displayName,
      });
    }

    const created = await this.prisma.actor.create({
      data: {
        id: randomUUID(),
        kind: principal.kind,
        displayName: principal.displayName,
      },
    });

    return createActor({
      id: toActorId(created.id),
      kind: created.kind as Actor['kind'],
      displayName: created.displayName,
    });
  }
}
