/**
 * Application layer for organisations.
 *
 * Mirrors `RecordsService`: the domain decides what happened, this layer
 * supplies the identifier, the clock, the hash function and persistence, and
 * appends the audit event in the same transaction as the state change
 * (ADR-0003).
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createActor,
  createAuditEvent,
  createOrganisation,
  toActorId,
  toAuditEventId,
  toOrganisationId,
  type Actor,
} from '@witness/domain';
import type { OrganisationSummary } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<OrganisationSummary[]> {
    const rows = await this.prisma.organisation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async create(name: string, principal: Principal): Promise<OrganisationSummary> {
    const actor = await this.resolveActor(principal);
    const now = new Date();

    const outcome = createOrganisation({
      id: toOrganisationId(randomUUID()),
      name,
      createdBy: actor,
      createdAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.organisation.create({
        data: {
          id: outcome.organisation.id,
          name: outcome.organisation.name,
          createdAt: outcome.organisation.createdAt,
        },
      });

      const event = createAuditEvent(
        {
          id: toAuditEventId(randomUUID()),
          subjectType: 'organisation',
          subjectId: outcome.organisation.id,
          action: outcome.event.action,
          actor: outcome.event.actor,
          occurredAt: now,
          // The organisation's own chain starts here — nothing can precede the
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
      id: outcome.organisation.id,
      name: outcome.organisation.name,
      createdAt: outcome.organisation.createdAt.toISOString(),
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
