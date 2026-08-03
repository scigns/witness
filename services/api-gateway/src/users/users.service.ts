/**
 * Application layer for users.
 *
 * Mirrors `OrganisationsService`: the domain decides what happened, this layer
 * supplies the identifier, the clock, the hash function and persistence
 * (ADR-0003). Duplicate-email prevention lives here rather than in the domain
 * because it requires a database read the domain must not perform itself.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { createUser, normaliseEmail, toUserId } from '@witness/domain';
import type { CreateUserRequest, UserSummary } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserSummary[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map(toSummary);
  }

  async get(id: string): Promise<UserSummary> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    if (row === null) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: `No user with id '${id}'.` },
      });
    }

    return toSummary(row);
  }

  async create(request: CreateUserRequest, principal: Principal): Promise<UserSummary> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    // Normalise before the duplicate check so 'Name@Example.com' and
    // 'name@example.com' collide here rather than at the unique-constraint
    // violation, which would surface as an opaque 500.
    const email = normaliseEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing !== null) {
      throw new ConflictException({
        error: { code: 'DUPLICATE_EMAIL', message: `A user with email '${email}' already exists.` },
      });
    }

    const outcome = createUser({
      id: toUserId(randomUUID()),
      email: request.email,
      displayName: request.displayName,
      registeredBy: actor,
      registeredAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: outcome.user.id,
          email: outcome.user.email,
          displayName: outcome.user.displayName,
          accountState: outcome.user.accountState,
          createdAt: outcome.user.createdAt,
          updatedAt: outcome.user.updatedAt,
        },
      });

      await appendAuditEvent(tx, 'user', outcome.user.id, outcome.event, now);
    });

    return {
      id: outcome.user.id,
      email: outcome.user.email,
      displayName: outcome.user.displayName,
      accountState: outcome.user.accountState,
      createdAt: outcome.user.createdAt.toISOString(),
      updatedAt: outcome.user.updatedAt.toISOString(),
    };
  }
}

function toSummary(row: {
  id: string;
  email: string;
  displayName: string;
  accountState: string;
  createdAt: Date;
  updatedAt: Date;
}): UserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    accountState: row.accountState as UserSummary['accountState'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
