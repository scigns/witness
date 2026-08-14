/**
 * Application layer for organisations.
 *
 * Mirrors `RecordsService`: the domain decides what happened, this layer
 * supplies the identifier, the clock, the hash function and persistence, and
 * appends the audit event in the same transaction as the state change
 * (ADR-0003).
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createActor,
  createAuditEvent,
  createOrganisation,
  updateStorageQuota,
  toActorId,
  toAuditEventId,
  toOrganisationId,
  type Actor,
} from '@witness/domain';
import type { OrganisationStorageUsage, OrganisationSummary } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { StorageQuotaService } from './storage-quota.service.js';
import type { Principal } from '../authz/authorization.port.js';

/**
 * Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError` —
 * the service tests run against an in-memory double that never constructs a
 * real Prisma error, matching evidence.service.ts's own helper of the same
 * name and shape.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageQuota: StorageQuotaService,
  ) {}

  /**
   * A real, verified session only sees organisations it has a membership
   * row in — otherwise the list itself is a cross-organisation information
   * leak, independent of what any single record's authorisation check would
   * allow. The unverified `X-Witness-Dev-User` path is untouched (returns
   * everything, as it always has): scoping is a property of real identity,
   * and there is no membership set to scope a header nobody has verified to.
   */
  async list(principal: Principal): Promise<OrganisationSummary[]> {
    const memberOrganisationIds = await this.memberOrganisationIds(principal);

    const rows = await this.prisma.organisation.findMany({
      where: memberOrganisationIds === null ? {} : { id: { in: memberOrganisationIds } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** `null` means "unscoped — return everything" (the dev-header path). */
  private async memberOrganisationIds(principal: Principal): Promise<string[] | null> {
    if (!principal.subject.startsWith('user:')) return null;

    const userId = principal.subject.slice('user:'.length);
    const memberships = await this.prisma.organisationMembership.findMany({
      where: { userId },
      select: { organisationId: true },
    });
    return memberships.map((m) => m.organisationId);
  }

  /**
   * Creates the organisation and invites its administrator in the same
   * transaction — mirrors prisma/bootstrap.ts's shape for the deployment's
   * first organisation, so this one is not created with nobody able to sign
   * in and manage it. The invited administrator activates by signing in
   * through the identity provider with that verified email, same as
   * bootstrap: this grants nothing to anyone who cannot already authenticate
   * as that email.
   */
  async create(
    name: string,
    administratorEmail: string,
    administratorName: string,
    principal: Principal,
  ): Promise<OrganisationSummary> {
    const actor = await this.resolveActor(principal);
    const now = new Date();

    const outcome = createOrganisation({
      id: toOrganisationId(randomUUID()),
      name,
      createdBy: actor,
      createdAt: now,
    });

    const administratorUserId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.organisation.create({
        data: {
          id: outcome.organisation.id,
          name: outcome.organisation.name,
          storageQuotaBytes: BigInt(outcome.organisation.storageQuotaBytes),
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

      const existingUser = await tx.user.findUnique({ where: { email: administratorEmail } });
      let userId = existingUser?.id ?? administratorUserId;
      let createdNewUser = existingUser === null;

      if (createdNewUser) {
        try {
          await tx.user.create({
            data: {
              id: userId,
              email: administratorEmail,
              displayName: administratorName,
              accountState: 'invited',
              createdAt: now,
              updatedAt: now,
            },
          });
        } catch (error) {
          // Lost a race with a concurrent organisation:create for the same
          // administrator email — email is unique, and findUnique above ran
          // outside any lock. Fall back to the row the other request just
          // created rather than surfacing a 500 for something that is not
          // actually a conflict from the caller's point of view.
          if (!isUniqueConstraintViolation(error)) throw error;
          const winner = await tx.user.findUnique({ where: { email: administratorEmail } });
          if (winner === null) throw error;
          userId = winner.id;
          createdNewUser = false;
        }
      }

      await tx.organisationMembership.create({
        data: {
          id: randomUUID(),
          organisationId: outcome.organisation.id,
          userId,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.roleAssignment.create({
        data: {
          id: randomUUID(),
          scopeType: 'organisation',
          organisationId: outcome.organisation.id,
          userId,
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        },
      });

      // Only the first event for a brand-new user's own chain starts at
      // previousHash: null. An organisation:create invite to an email that
      // already has a user row (a person administering more than one
      // organisation) must not overwrite that chain — it gets no separate
      // event of its own here; the organisation.created event above and the
      // membership/role-assignment rows are the record of what happened.
      if (createdNewUser) {
        const userEvent = createAuditEvent(
          {
            id: toAuditEventId(randomUUID()),
            subjectType: 'user',
            subjectId: userId,
            action: 'user.invited',
            actor,
            occurredAt: now,
            previousHash: null,
            metadata: { via: 'organisation:create', role: 'admin' },
          },
          sha256,
        );

        await tx.auditEvent.create({
          data: {
            id: userEvent.id,
            subjectType: userEvent.subjectType,
            subjectId: userEvent.subjectId,
            action: userEvent.action,
            actorId: userEvent.actor.id,
            occurredAt: userEvent.occurredAt,
            previousHash: userEvent.previousHash,
            hash: userEvent.hash,
            metadata: userEvent.metadata,
          },
        });
      }
    });

    return {
      id: outcome.organisation.id,
      name: outcome.organisation.name,
      createdAt: outcome.organisation.createdAt.toISOString(),
    };
  }

  /** "STORAGE — X GB of Y GB included used", for an organisation administrator. */
  async storage(organisationId: string): Promise<OrganisationStorageUsage> {
    const { usedBytes, quotaBytes } = await this.storageQuota.usage(organisationId);
    return { usedBytes: usedBytes.toString(), quotaBytes: quotaBytes.toString() };
  }

  /**
   * The operator override Flight 1 asks for: preserves existing content and
   * never deletes anything — this only ever changes the ceiling a future
   * upload is checked against.
   */
  async setStorageQuota(
    organisationId: string,
    quotaBytes: number,
    principal: Principal,
  ): Promise<OrganisationStorageUsage> {
    const row = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'ORGANISATION_NOT_FOUND',
          message: `No organisation with id '${organisationId}'.`,
        },
      });
    }

    const actor = await this.resolveActor(principal);
    const now = new Date();
    const outcome = updateStorageQuota(
      {
        id: toOrganisationId(row.id),
        name: row.name,
        storageQuotaBytes: Number(row.storageQuotaBytes),
        createdAt: row.createdAt,
      },
      quotaBytes,
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.organisation.update({
        where: { id: organisationId },
        data: { storageQuotaBytes: BigInt(outcome.organisation.storageQuotaBytes) },
      });

      // The organisation's chain did not start with this event — create()
      // wrote the first link — so this needs the race-safe tail lookup
      // appendAuditEvent provides (advisory lock; see its own doc comment
      // for the live-reproduced concurrent-append bug it fixes), not the
      // previousHash: null this file's own create() correctly uses for a
      // subject's first event.
      await appendAuditEvent(tx, 'organisation', organisationId, outcome.event, now);
    });

    return this.storage(organisationId);
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
