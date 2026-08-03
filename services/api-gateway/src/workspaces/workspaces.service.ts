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
  type Actor,
} from '@witness/domain';
import type { WorkspaceSummary } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkspaceSummary[]> {
    const rows = await this.prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      organisationId: row.organisationId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async create(
    name: string,
    organisationId: string,
    principal: Principal,
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
      createdBy: actor,
      createdAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspace.create({
        data: {
          id: outcome.workspace.id,
          name: outcome.workspace.name,
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
