/**
 * Application layer for institutional records.
 *
 * Orchestrates the domain and the adapters. Every business rule lives in
 * `@witness/domain`; this file supplies what the domain refuses to reach for
 * itself — identifiers, the clock, the hash function and persistence (ADR-0003).
 *
 * The audit chain is appended inside the same transaction as the state change.
 * A state change whose audit event failed to write is exactly the situation the
 * audit log exists to make impossible, so the two cannot be separated.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  captureRecord,
  confirmRecord,
  correctRecord,
  createActor,
  createAuditEvent,
  createProvenance,
  createSource,
  isAccepted,
  permittedTransitions,
  rejectRecord,
  reopenRecord,
  submitForReview,
  toActorId,
  toAuditEventId,
  toRecordId,
  toSourceId,
  verifyChain,
  type Actor,
  type AuditEvent,
  type InstitutionalRecord,
  type RecordOutcome,
  type ReviewState,
  type SourceKind,
} from '@witness/domain';
import type {
  AuditEventView,
  CreateRecordRequest,
  RecordDetail,
  RecordSummary,
  ReviewAction,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import type { Principal } from '../authz/authorization.port.js';

/** Maps a review action to the domain operation and the permission it needs. */
const ACTION_LABELS: Readonly<Record<ReviewAction['action'], string>> = Object.freeze({
  submit: 'submit',
  confirm: 'confirm',
  correct: 'correct',
  reject: 'reject',
  reopen: 'reopen',
});

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(): Promise<RecordSummary[]> {
    const rows = await this.prisma.record.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { source: true },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      reviewState: row.reviewState as RecordSummary['reviewState'],
      isInstitutionalRecord: isAccepted(row.reviewState as ReviewState),
      sourceLabel: row.source.label,
      capturedAt: row.capturedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async get(id: string): Promise<RecordDetail> {
    const row = await this.prisma.record.findUnique({
      where: { id },
      include: {
        source: true,
        capturedBy: true,
        auditEvents: { orderBy: { occurredAt: 'asc' }, include: { actor: true } },
      },
    });

    if (row === null) {
      throw new NotFoundException({
        error: { code: 'RECORD_NOT_FOUND', message: `No record with id '${id}'.` },
      });
    }

    // Reconstruct the domain events so the chain is verified with the same code
    // the domain uses, rather than a second implementation that can drift.
    const domainEvents: AuditEvent[] = row.auditEvents.map((event) => ({
      id: toAuditEventId(event.id),
      recordId: toRecordId(event.recordId),
      action: event.action as AuditEvent['action'],
      actor: this.toDomainActor(event.actor),
      occurredAt: event.occurredAt,
      previousHash: event.previousHash,
      hash: event.hash,
      metadata: (event.metadata ?? {}) as Record<string, string>,
    }));

    const verification = verifyChain(domainEvents, sha256);

    if (!verification.valid) {
      // Loud, because this means the audit trail has been altered in the
      // database. It is surfaced to the user rather than logged and hidden —
      // a memory system that quietly serves a broken chain is worse than one
      // that admits it.
      this.logger.error(`Audit chain broken for record ${id}: ${verification.reason}`);
    }

    const state = row.reviewState as ReviewState;

    return {
      id: row.id,
      title: row.title,
      body: row.body,
      reviewState: state,
      isInstitutionalRecord: isAccepted(state),
      sourceLabel: row.source.label,
      capturedAt: row.capturedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      provenance: {
        source: {
          id: row.source.id,
          kind: row.source.kind as RecordDetail['provenance']['source']['kind'],
          label: row.source.label,
          occurredAt: row.source.occurredAt.toISOString(),
        },
        capturedBy: {
          id: row.capturedBy.id,
          kind: row.capturedBy.kind as RecordDetail['provenance']['capturedBy']['kind'],
          displayName: row.capturedBy.displayName,
        },
        capturedAt: row.capturedAt.toISOString(),
        consentGrantId: row.consentGrantId,
      },
      auditTrail: row.auditEvents.map((event): AuditEventView => ({
        id: event.id,
        action: event.action,
        actor: {
          id: event.actor.id,
          kind: event.actor.kind as AuditEventView['actor']['kind'],
          displayName: event.actor.displayName,
        },
        occurredAt: event.occurredAt.toISOString(),
        hash: event.hash,
        previousHash: event.previousHash,
        metadata: (event.metadata ?? {}) as Record<string, string>,
      })),
      permittedActions: this.permittedActionsFor(state),
      auditChainValid: verification.valid,
    };
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(request: CreateRecordRequest, principal: Principal): Promise<RecordDetail> {
    const actor = await this.resolveActor(principal);
    const now = new Date();

    const source = createSource({
      id: toSourceId(randomUUID()),
      kind: request.source.kind as SourceKind,
      label: request.source.label,
      occurredAt: new Date(request.source.occurredAt),
    });

    const provenance = createProvenance({
      source,
      capturedBy: actor,
      // A source dated in the future would otherwise fail the domain's
      // "capture cannot precede its source" invariant with a confusing message.
      // Clamping is wrong here — the right answer is to let the domain reject it.
      capturedAt: now,
    });

    const outcome = captureRecord({
      id: toRecordId(randomUUID()),
      title: request.title,
      body: request.body,
      provenance,
      capturedAt: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.source.create({
        data: {
          id: source.id,
          kind: source.kind,
          label: source.label,
          occurredAt: source.occurredAt,
        },
      });

      await tx.record.create({
        data: {
          id: outcome.record.id,
          title: outcome.record.title,
          body: outcome.record.body,
          reviewState: outcome.record.reviewState,
          sourceId: source.id,
          capturedById: actor.id,
          capturedAt: outcome.record.createdAt,
        },
      });

      await this.appendAudit(tx, outcome, now);
    });

    return this.get(outcome.record.id);
  }

  async review(id: string, action: ReviewAction, principal: Principal): Promise<RecordDetail> {
    const actor = await this.resolveActor(principal);
    const current = await this.loadDomainRecord(id);
    const now = new Date();

    const outcome = this.applyAction(current, action, actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.record.update({
        where: { id: outcome.record.id },
        data: { reviewState: outcome.record.reviewState, body: outcome.record.body },
      });

      await this.appendAudit(tx, outcome, now);
    });

    this.logger.log(
      `Record ${id}: ${current.reviewState} → ${outcome.record.reviewState} ` +
        `by ${principal.subject} (${ACTION_LABELS[action.action]})`,
    );

    return this.get(id);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private applyAction(
    record: InstitutionalRecord,
    action: ReviewAction,
    actor: Actor,
    at: Date,
  ): RecordOutcome {
    switch (action.action) {
      case 'submit':
        return submitForReview(record, actor, at);
      case 'confirm':
        return confirmRecord(record, actor, at);
      case 'correct':
        return correctRecord(record, actor, action.body, at);
      case 'reject':
        return rejectRecord(record, actor, action.reason, at);
      case 'reopen':
        return reopenRecord(record, actor, action.reason, at);
    }
  }

  private permittedActionsFor(state: ReviewState): string[] {
    const next = permittedTransitions(state);
    const actions: string[] = [];

    if (next.includes('in_review')) actions.push(state === 'draft' ? 'submit' : 'reopen');
    if (next.includes('confirmed')) actions.push('confirm');
    if (next.includes('corrected')) actions.push('correct');
    if (next.includes('rejected')) actions.push('reject');

    return actions;
  }

  private toDomainActor(row: { id: string; kind: string; displayName: string }): Actor {
    return createActor({
      id: toActorId(row.id),
      kind: row.kind as Actor['kind'],
      displayName: row.displayName,
    });
  }

  private async loadDomainRecord(id: string): Promise<InstitutionalRecord> {
    const row = await this.prisma.record.findUnique({
      where: { id },
      include: { source: true, capturedBy: true },
    });

    if (row === null) {
      throw new NotFoundException({
        error: { code: 'RECORD_NOT_FOUND', message: `No record with id '${id}'.` },
      });
    }

    const source = createSource({
      id: toSourceId(row.source.id),
      kind: row.source.kind as SourceKind,
      label: row.source.label,
      occurredAt: row.source.occurredAt,
    });

    return {
      id: toRecordId(row.id),
      title: row.title,
      body: row.body,
      reviewState: row.reviewState as ReviewState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      provenance: createProvenance({
        source,
        capturedBy: this.toDomainActor(row.capturedBy),
        capturedAt: row.capturedAt,
        ...(row.consentGrantId !== null ? { consentGrantId: row.consentGrantId } : {}),
      }),
    };
  }

  /** Find or create the Actor row for a principal. */
  private async resolveActor(principal: Principal): Promise<Actor> {
    const existing = await this.prisma.actor.findFirst({
      where: { displayName: principal.displayName, kind: principal.kind },
    });

    if (existing !== null) {
      return this.toDomainActor(existing);
    }

    const created = await this.prisma.actor.create({
      data: {
        id: randomUUID(),
        kind: principal.kind,
        displayName: principal.displayName,
      },
    });

    return this.toDomainActor(created);
  }

  /**
   * Append one event to the record's hash chain.
   *
   * Reads the current tail inside the transaction so two concurrent reviews
   * cannot both chain onto the same predecessor. The unique index on `hash`
   * turns the remaining race into a constraint violation rather than a silently
   * forked chain — a rejected request being far better than an unverifiable log.
   */
  private async appendAudit(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    outcome: RecordOutcome,
    at: Date,
  ): Promise<void> {
    const tail = await tx.auditEvent.findFirst({
      where: { recordId: outcome.record.id },
      orderBy: { occurredAt: 'desc' },
      select: { hash: true },
    });

    const event = createAuditEvent(
      {
        id: toAuditEventId(randomUUID()),
        recordId: outcome.record.id,
        action: outcome.event.action,
        actor: outcome.event.actor,
        occurredAt: at,
        previousHash: tail?.hash ?? null,
        metadata: { ...outcome.event.metadata },
      },
      sha256,
    );

    await tx.auditEvent.create({
      data: {
        id: event.id,
        recordId: event.recordId,
        action: event.action,
        actorId: event.actor.id,
        occurredAt: event.occurredAt,
        previousHash: event.previousHash,
        hash: event.hash,
        metadata: event.metadata,
      },
    });
  }
}
