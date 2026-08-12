/**
 * Application layer for program agenda items (Client-Ready Experience
 * overhaul, Phase 11).
 *
 * Same shape as `ConsentTemplatesService`: load the row(s), reconstruct the
 * domain aggregate, call into `@witness/domain` for the rule, write the
 * result and its audit event back in a transaction.
 *
 * `transitionStatus` is the one place this service does more than its
 * domain counterpart: `transitionAgendaItemStatus` is a pure function that
 * cannot see the rest of the workspace's agenda, so demoting any other
 * `current` item to `upcoming` when a new one becomes `current` happens
 * here, inside the same transaction, not in the domain (see
 * `agenda-item.ts`'s doc comment).
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createAgendaItem,
  reorderAgendaItem,
  transitionAgendaItemStatus,
  updateAgendaItem,
  toAgendaItemId,
  toCoDesignSessionId,
  toUserId,
  toWorkspaceId,
  type AgendaItem,
} from '@witness/domain';
import type {
  AgendaItemView,
  CreateAgendaItemRequest,
  ReorderAgendaItemRequest,
  UpdateAgendaItemRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

type AgendaItemRow = Awaited<ReturnType<PrismaService['agendaItem']['findFirstOrThrow']>> & {
  facilitator: { displayName: string } | null;
};

@Injectable()
export class AgendaItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<AgendaItemView[]> {
    await this.requireWorkspace(workspaceId);

    const rows = await this.prisma.agendaItem.findMany({
      where: { workspaceId },
      include: { facilitator: { select: { displayName: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    return rows.map(toView);
  }

  async create(
    workspaceId: string,
    request: CreateAgendaItemRequest,
    principal: Principal,
  ): Promise<AgendaItemView> {
    await this.requireWorkspace(workspaceId);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const maxSortOrder = await this.prisma.agendaItem.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });

    const outcome = createAgendaItem({
      id: toAgendaItemId(randomUUID()),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: request.sessionId ? toCoDesignSessionId(request.sessionId) : null,
      title: request.title,
      description: request.description ?? null,
      promptText: request.promptText ?? null,
      facilitatorId: request.facilitatorId ? toUserId(request.facilitatorId) : null,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      startAt: request.startAt ? new Date(request.startAt) : null,
      durationMinutes: request.durationMinutes ?? null,
      createdBy: actor,
      createdAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.agendaItem.create({ data: toCreateRow(outcome.item) });
      await appendAuditEvent(tx, 'agenda_item', outcome.item.id, outcome.event, now);
    });

    return toView(await this.requireRow(workspaceId, outcome.item.id));
  }

  async update(
    workspaceId: string,
    itemId: string,
    request: UpdateAgendaItemRequest,
    principal: Principal,
  ): Promise<AgendaItemView> {
    const row = await this.requireRow(workspaceId, itemId);
    const item = toDomain(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateAgendaItem(
      item,
      {
        ...(request.title !== undefined ? { title: request.title } : {}),
        ...(request.description !== undefined ? { description: request.description } : {}),
        ...(request.promptText !== undefined ? { promptText: request.promptText } : {}),
        ...(request.facilitatorId !== undefined
          ? {
              facilitatorId:
                request.facilitatorId === null ? null : toUserId(request.facilitatorId),
            }
          : {}),
        ...(request.startAt !== undefined
          ? { startAt: request.startAt === null ? null : new Date(request.startAt) }
          : {}),
        ...(request.durationMinutes !== undefined
          ? { durationMinutes: request.durationMinutes }
          : {}),
      },
      actor,
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.agendaItem.update({ where: { id: itemId }, data: toUpdateRow(outcome.item) });
      await appendAuditEvent(tx, 'agenda_item', itemId, outcome.event, now);
    });

    return toView(await this.requireRow(workspaceId, itemId));
  }

  async transitionStatus(
    workspaceId: string,
    itemId: string,
    status: AgendaItem['status'],
    principal: Principal,
  ): Promise<AgendaItemView> {
    const row = await this.requireRow(workspaceId, itemId);
    const item = toDomain(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = transitionAgendaItemStatus(item, status, actor, now);

    await this.prisma.$transaction(async (tx) => {
      if (status === 'current') {
        // At most one item per workspace is `current` — demote any other
        // holder before this one takes it, in the same transaction.
        const others = await tx.agendaItem.findMany({
          where: { workspaceId, status: 'current', id: { not: itemId } },
        });

        for (const other of others) {
          const demoted = transitionAgendaItemStatus(toDomain(other), 'upcoming', actor, now);
          await tx.agendaItem.update({
            where: { id: other.id },
            data: { status: demoted.item.status, updatedAt: demoted.item.updatedAt },
          });
          await appendAuditEvent(tx, 'agenda_item', other.id, demoted.event, now);
        }
      }

      await tx.agendaItem.update({
        where: { id: itemId },
        data: { status: outcome.item.status, updatedAt: outcome.item.updatedAt },
      });
      await appendAuditEvent(tx, 'agenda_item', itemId, outcome.event, now);
    });

    return toView(await this.requireRow(workspaceId, itemId));
  }

  async reorder(
    workspaceId: string,
    itemId: string,
    request: ReorderAgendaItemRequest,
    principal: Principal,
  ): Promise<AgendaItemView> {
    const row = await this.requireRow(workspaceId, itemId);
    const item = toDomain(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = reorderAgendaItem(item, request.sortOrder, actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.agendaItem.update({
        where: { id: itemId },
        data: { sortOrder: outcome.item.sortOrder, updatedAt: outcome.item.updatedAt },
      });
      await appendAuditEvent(tx, 'agenda_item', itemId, outcome.event, now);
    });

    return toView(await this.requireRow(workspaceId, itemId));
  }

  private async requireWorkspace(workspaceId: string): Promise<void> {
    const exists = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (exists === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }
  }

  private async requireRow(workspaceId: string, itemId: string): Promise<AgendaItemRow> {
    const row = await this.prisma.agendaItem.findUnique({
      where: { id: itemId },
      include: { facilitator: { select: { displayName: true } } },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'AGENDA_ITEM_NOT_FOUND',
          message: `No agenda item '${itemId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    return row;
  }
}

function toDomain(row: {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  title: string;
  description: string | null;
  promptText: string | null;
  facilitatorId: string | null;
  status: string;
  sortOrder: number;
  startAt: Date | null;
  durationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}): AgendaItem {
  return {
    id: toAgendaItemId(row.id),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: row.sessionId !== null ? toCoDesignSessionId(row.sessionId) : null,
    title: row.title,
    description: row.description,
    promptText: row.promptText,
    facilitatorId: row.facilitatorId !== null ? toUserId(row.facilitatorId) : null,
    status: row.status as AgendaItem['status'],
    sortOrder: row.sortOrder,
    startAt: row.startAt,
    durationMinutes: row.durationMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCreateRow(item: AgendaItem) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    sessionId: item.sessionId,
    title: item.title,
    description: item.description,
    promptText: item.promptText,
    facilitatorId: item.facilitatorId,
    status: item.status,
    sortOrder: item.sortOrder,
    startAt: item.startAt,
    durationMinutes: item.durationMinutes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toUpdateRow(item: AgendaItem) {
  return {
    title: item.title,
    description: item.description,
    promptText: item.promptText,
    facilitatorId: item.facilitatorId,
    startAt: item.startAt,
    durationMinutes: item.durationMinutes,
    updatedAt: item.updatedAt,
  };
}

function toView(row: AgendaItemRow): AgendaItemView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    title: row.title,
    description: row.description,
    promptText: row.promptText,
    facilitatorId: row.facilitatorId,
    facilitatorName: row.facilitator?.displayName ?? null,
    status: row.status as AgendaItemView['status'],
    sortOrder: row.sortOrder,
    startAt: row.startAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
