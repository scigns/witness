/**
 * Application layer for evidence links (BUILD_ROADMAP.md Milestone 5) —
 * typed relationships between two pieces of evidence in the same session.
 *
 * Duplicate-link rejection lives here, not in the domain layer
 * (`createEvidenceLink` in `@witness/domain` cannot check it — that would
 * be a database read, forbidden by ADR-0003): `create` below checks for an
 * existing `(fromEvidenceId, toEvidenceId, linkType)` row before calling
 * into the domain, and the migration's own unique index is the last line of
 * defence if that check is ever bypassed.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createEvidenceLink,
  removeEvidenceLink,
  toCoDesignSessionId,
  toEvidenceId,
  toEvidenceLinkId,
  toOrganisationId,
  toWorkspaceId,
  type LinkableEvidenceRef,
} from '@witness/domain';
import type { CreateEvidenceLinkRequest, EvidenceLinkView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import type { EvidenceRow } from './evidence.service.js';

@Injectable()
export class EvidenceLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<EvidenceLinkView[]> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const rows = await this.prisma.evidenceLink.findMany({
      where: { OR: [{ fromEvidenceId: evidenceId }, { toEvidenceId: evidenceId }] },
      include: { createdBy: true },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toView);
  }

  async create(
    workspaceId: string,
    sessionId: string,
    fromEvidenceId: string,
    request: CreateEvidenceLinkRequest,
    principal: Principal,
  ): Promise<EvidenceLinkView> {
    const fromRow = await this.requireEvidenceRow(workspaceId, sessionId, fromEvidenceId);
    const toRow = await this.requireEvidenceRow(workspaceId, sessionId, request.toEvidenceId);

    const existing = await this.prisma.evidenceLink.findFirst({
      where: {
        fromEvidenceId,
        toEvidenceId: request.toEvidenceId,
        linkType: request.linkType,
      },
    });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'EVIDENCE_LINK_DUPLICATE',
          message: `A '${request.linkType}' link already exists between these two pieces of evidence.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createEvidenceLink({
      id: toEvidenceLinkId(randomUUID()),
      linkType: request.linkType,
      from: toRef(fromRow),
      to: toRef(toRow),
      note: request.note,
      createdBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.evidenceLink.create({
        data: {
          id: outcome.link.id,
          organisationId: outcome.link.organisationId,
          workspaceId: outcome.link.workspaceId,
          sessionId: outcome.link.sessionId,
          linkType: outcome.link.linkType,
          fromEvidenceId: outcome.link.fromEvidenceId,
          toEvidenceId: outcome.link.toEvidenceId,
          note: outcome.link.note,
          createdAt: outcome.link.createdAt,
          createdById: actor.id,
        },
      });
      await appendAuditEvent(tx, 'evidence_link', outcome.link.id, outcome.event, now);
    });

    return {
      id: outcome.link.id,
      sessionId: outcome.link.sessionId,
      linkType: outcome.link.linkType,
      fromEvidenceId: outcome.link.fromEvidenceId,
      toEvidenceId: outcome.link.toEvidenceId,
      note: outcome.link.note,
      createdAt: outcome.link.createdAt.toISOString(),
      createdBy: { id: actor.id, kind: actor.kind, displayName: actor.displayName },
    };
  }

  async remove(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    linkId: string,
    principal: Principal,
  ): Promise<void> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const link = await this.prisma.evidenceLink.findUnique({ where: { id: linkId } });
    if (
      link === null ||
      link.sessionId !== sessionId ||
      (link.fromEvidenceId !== evidenceId && link.toEvidenceId !== evidenceId)
    ) {
      throw new NotFoundException({
        error: {
          code: 'EVIDENCE_LINK_NOT_FOUND',
          message: `No link '${linkId}' on evidence '${evidenceId}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const event = removeEvidenceLink(
      {
        id: toEvidenceLinkId(link.id),
        organisationId: toOrganisationId(link.organisationId),
        workspaceId: toWorkspaceId(link.workspaceId),
        sessionId: toCoDesignSessionId(link.sessionId),
        linkType: link.linkType as EvidenceLinkView['linkType'],
        fromEvidenceId: toEvidenceId(link.fromEvidenceId),
        toEvidenceId: toEvidenceId(link.toEvidenceId),
        note: link.note,
        createdAt: link.createdAt,
        createdBy: actor,
      },
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.evidenceLink.delete({ where: { id: linkId } });
      await appendAuditEvent(tx, 'evidence_link', linkId, event, now);
    });
  }

  private async requireEvidenceRow(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<EvidenceRow> {
    const row = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence '${evidenceId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }
}

function toRef(row: EvidenceRow): LinkableEvidenceRef {
  return {
    id: toEvidenceId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
  };
}

type EvidenceLinkRow = Awaited<ReturnType<PrismaService['evidenceLink']['findFirstOrThrow']>> & {
  createdBy: { id: string; kind: string; displayName: string };
};

function toView(row: EvidenceLinkRow): EvidenceLinkView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    linkType: row.linkType as EvidenceLinkView['linkType'],
    fromEvidenceId: row.fromEvidenceId,
    toEvidenceId: row.toEvidenceId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdBy: {
      id: row.createdBy.id,
      kind: row.createdBy.kind as EvidenceLinkView['createdBy']['kind'],
      displayName: row.createdBy.displayName,
    },
  };
}
