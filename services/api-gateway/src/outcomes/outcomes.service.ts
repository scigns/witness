/**
 * Application layer for decisions, commitments and actions (BUILD_ROADMAP.md
 * Milestone 7) — the point at which validated evidence becomes something an
 * institution is accountable for.
 *
 * Same shape as `EvidenceService`/`EvidenceReviewService`: load the row,
 * reconstruct the domain aggregate, call into `@witness/domain` for the rule,
 * write the result and its audit event back inside a transaction using
 * `expectedVersion` for optimistic concurrency.
 *
 * One thing here is genuinely different, and it is the reason this milestone
 * exists. Confirming a decision and activating a commitment are gated on
 * *support* — validated evidence, or a stated institutional synthesis — and
 * the support records are loaded **inside the same transaction that writes
 * the confirmation**, not before it. That is not ceremony: an outcome is
 * unauthoritative right up until the moment it is confirmed, so its support
 * may legitimately be removed concurrently. Reading the count outside the
 * transaction would leave a window in which a decision is confirmed on a
 * basis that no longer exists. `OutcomeSupportService.remove` closes the
 * other side of the same window by refusing to remove the last support from
 * an outcome that is already authoritative.
 *
 * Ownership is two-part throughout, and never a participant.
 * `ownerDescription` is required plain language (a team, an agency, a named
 * post); `ownerUserId` is optional and, when given, must be a Witness user in
 * good standing in the outcome's own organisation — the same org-scoped check
 * `SessionsService.requireFacilitator` applies to facilitators, for the same
 * reason. See `packages/domain/src/commitment.ts` on why recording a session
 * participant as an owner would defeat Milestone 4's anonymity guarantees.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  activateCommitment,
  blockActionItem,
  cancelActionItem,
  canEditActionItem,
  canEditCommitment,
  canEditDecision,
  completeActionItem,
  confirmDecision,
  createActionItem,
  fulfilCommitment,
  isInGoodStanding,
  isOverdueActionItem,
  isOverdueCommitment,
  proposeCommitment,
  proposeDecision,
  recordActionProgress,
  reverseDecision,
  startActionItem,
  supersedeCommitment,
  supersedeDecision,
  toActionItemId,
  toActorId,
  toCoDesignSessionId,
  toCommitmentId,
  toDecisionId,
  toOrganisationId,
  toUserId,
  toWorkspaceId,
  unblockActionItem,
  updateActionItem,
  updateCommitment,
  updateDecision,
  withdrawCommitment,
  type ActionItem,
  type ActionItemOutcome,
  type ActionItemPriority,
  type ActionItemStatus,
  type Actor,
  type Commitment,
  type CommitmentOutcome,
  type CommitmentStatus,
  type Decision,
  type DecisionOutcome,
  type DecisionStatus,
  type MembershipState,
  type OutcomeSupport,
  type OutcomeType,
  type SessionStatus,
} from '@witness/domain';
import type {
  ActionItemDetail,
  ActionItemSummary,
  ActionItemTransitionRequest,
  CommitmentDetail,
  CommitmentSummary,
  CommitmentTransitionRequest,
  CreateActionItemRequest,
  DecisionDetail,
  DecisionSummary,
  DecisionTransitionRequest,
  OutcomeSupportView,
  ProposeCommitmentRequest,
  ProposeDecisionRequest,
  UpdateActionItemRequest,
  UpdateCommitmentRequest,
  UpdateDecisionRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import { OutcomeSupportService, toDomainSupport } from './outcome-support.service.js';

type SessionRow = { id: string; organisationId: string; workspaceId: string; status: string };
type ActorRow = { id: string; kind: string; displayName: string };

/**
 * Rows carry their actor relations optionally: the read paths `include` them
 * so a view can show who proposed or confirmed something, while the domain
 * reconstruction below never needs them (see `bareActor`). Optional rather
 * than required keeps both callers honest without two row types each.
 */
type DecisionRow = Awaited<ReturnType<PrismaService['decision']['findUniqueOrThrow']>> & {
  proposedBy?: ActorRow | null;
  confirmedBy?: ActorRow | null;
};
type CommitmentRow = Awaited<ReturnType<PrismaService['commitment']['findUniqueOrThrow']>> & {
  proposedBy?: ActorRow | null;
  activatedBy?: ActorRow | null;
};
type ActionItemRow = Awaited<ReturnType<PrismaService['actionItem']['findUniqueOrThrow']>> & {
  createdBy?: ActorRow | null;
};

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const STALE_VERSION = {
  error: {
    code: 'STALE_VERSION',
    message:
      'This outcome was changed by someone else since you last loaded it. Reload and try again.',
  },
};

@Injectable()
export class OutcomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: OutcomeSupportService,
  ) {}

  // ─── Decisions ────────────────────────────────────────────────────────────

  async listDecisions(workspaceId: string, sessionId: string): Promise<DecisionSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    const rows = await this.prisma.decision.findMany({
      where: { sessionId },
      orderBy: { proposedAt: 'asc' },
      take: 1000,
    });
    const counts = await this.support.countsBySession('decision', sessionId);
    return rows.map((row) => toDecisionSummary(row, counts.get(row.id) ?? 0));
  }

  async getDecision(
    workspaceId: string,
    sessionId: string,
    decisionId: string,
  ): Promise<DecisionDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireDecisionRow(workspaceId, sessionId, decisionId);
    const supports = await this.support.listViews('decision', decisionId);
    return toDecisionDetail(row, session.status as SessionStatus, supports);
  }

  async decisionHistory(workspaceId: string, sessionId: string, decisionId: string) {
    await this.requireDecisionRow(workspaceId, sessionId, decisionId);
    return this.history('decision', decisionId);
  }

  async proposeDecision(
    workspaceId: string,
    sessionId: string,
    request: ProposeDecisionRequest,
    principal: Principal,
  ): Promise<DecisionDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = proposeDecision(session.status as SessionStatus, {
      id: toDecisionId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      title: request.title,
      statement: request.statement,
      proposedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.decision.create({
        data: {
          id: outcome.decision.id,
          organisationId: outcome.decision.organisationId,
          workspaceId: outcome.decision.workspaceId,
          sessionId: outcome.decision.sessionId,
          title: outcome.decision.title,
          statement: outcome.decision.statement,
          status: outcome.decision.status,
          proposedById: outcome.decision.proposedBy.id,
          proposedAt: outcome.decision.proposedAt,
          createdAt: outcome.decision.createdAt,
          updatedAt: outcome.decision.updatedAt,
          version: outcome.decision.version,
        },
      });
      await appendAuditEvent(tx, 'decision', outcome.decision.id, outcome.event, now);
    });

    return this.getDecision(workspaceId, sessionId, outcome.decision.id);
  }

  async updateDecision(
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    request: UpdateDecisionRequest,
    principal: Principal,
  ): Promise<DecisionDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireDecisionRow(workspaceId, sessionId, decisionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateDecision(
      toDomainDecision(row),
      session.status as SessionStatus,
      actor,
      { title: request.title, statement: request.statement },
      now,
    );

    await this.applyDecision(decisionId, request.expectedVersion, () => outcome, now);
    return this.getDecision(workspaceId, sessionId, decisionId);
  }

  async transitionDecision(
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    request: DecisionTransitionRequest,
    principal: Principal,
  ): Promise<DecisionDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireDecisionRow(workspaceId, sessionId, decisionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;
    const decision = toDomainDecision(row);

    if (request.action === 'supersede') {
      await this.requireDecisionRow(workspaceId, sessionId, request.supersededByDecisionId);
    }

    await this.applyDecision(
      decisionId,
      request.expectedVersion,
      async (tx) => {
        switch (request.action) {
          case 'confirm': {
            const supports = await loadSupports(tx, 'decision', decisionId);
            return confirmDecision(decision, status, supports, actor, now);
          }
          case 'supersede':
            return supersedeDecision(
              decision,
              status,
              toDecisionId(request.supersededByDecisionId),
              actor,
              request.reason ?? null,
              now,
            );
          case 'reverse':
            return reverseDecision(decision, status, actor, request.reason, now);
        }
      },
      now,
    );

    return this.getDecision(workspaceId, sessionId, decisionId);
  }

  // ─── Commitments ──────────────────────────────────────────────────────────

  async listCommitments(workspaceId: string, sessionId: string): Promise<CommitmentSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    const rows = await this.prisma.commitment.findMany({
      where: { sessionId },
      orderBy: { proposedAt: 'asc' },
      take: 1000,
    });
    const counts = await this.support.countsBySession('commitment', sessionId);
    const now = new Date();
    return rows.map((row) => toCommitmentSummary(row, counts.get(row.id) ?? 0, now));
  }

  async getCommitment(
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
  ): Promise<CommitmentDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireCommitmentRow(workspaceId, sessionId, commitmentId);
    const supports = await this.support.listViews('commitment', commitmentId);
    return toCommitmentDetail(row, session.status as SessionStatus, supports, new Date());
  }

  async commitmentHistory(workspaceId: string, sessionId: string, commitmentId: string) {
    await this.requireCommitmentRow(workspaceId, sessionId, commitmentId);
    return this.history('commitment', commitmentId);
  }

  async proposeCommitment(
    workspaceId: string,
    sessionId: string,
    request: ProposeCommitmentRequest,
    principal: Principal,
  ): Promise<CommitmentDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    if (request.ownerUserId !== undefined) {
      await this.requireEligibleOwner(session.organisationId, request.ownerUserId);
    }
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = proposeCommitment(session.status as SessionStatus, {
      id: toCommitmentId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      title: request.title,
      description: request.description,
      ownerDescription: request.ownerDescription,
      ownerUserId: request.ownerUserId === undefined ? null : toUserId(request.ownerUserId),
      dueDate: request.dueDate === undefined ? null : new Date(request.dueDate),
      proposedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.commitment.create({
        data: {
          id: outcome.commitment.id,
          organisationId: outcome.commitment.organisationId,
          workspaceId: outcome.commitment.workspaceId,
          sessionId: outcome.commitment.sessionId,
          title: outcome.commitment.title,
          description: outcome.commitment.description,
          status: outcome.commitment.status,
          ownerDescription: outcome.commitment.ownerDescription,
          ownerUserId: outcome.commitment.ownerUserId,
          dueDate: outcome.commitment.dueDate,
          proposedById: outcome.commitment.proposedBy.id,
          proposedAt: outcome.commitment.proposedAt,
          createdAt: outcome.commitment.createdAt,
          updatedAt: outcome.commitment.updatedAt,
          version: outcome.commitment.version,
        },
      });
      await appendAuditEvent(tx, 'commitment', outcome.commitment.id, outcome.event, now);
    });

    return this.getCommitment(workspaceId, sessionId, outcome.commitment.id);
  }

  async updateCommitment(
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    request: UpdateCommitmentRequest,
    principal: Principal,
  ): Promise<CommitmentDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireCommitmentRow(workspaceId, sessionId, commitmentId);
    if (request.ownerUserId !== undefined && request.ownerUserId !== null) {
      await this.requireEligibleOwner(session.organisationId, request.ownerUserId);
    }
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateCommitment(
      toDomainCommitment(row),
      session.status as SessionStatus,
      actor,
      {
        title: request.title,
        description: request.description,
        ownerDescription: request.ownerDescription,
        ownerUserId: toOwnerPatch(request.ownerUserId),
        dueDate: toDatePatch(request.dueDate),
      },
      now,
    );

    await this.applyCommitment(commitmentId, request.expectedVersion, () => outcome, now);
    return this.getCommitment(workspaceId, sessionId, commitmentId);
  }

  async transitionCommitment(
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    request: CommitmentTransitionRequest,
    principal: Principal,
  ): Promise<CommitmentDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireCommitmentRow(workspaceId, sessionId, commitmentId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;
    const commitment = toDomainCommitment(row);

    if (request.action === 'supersede') {
      await this.requireCommitmentRow(workspaceId, sessionId, request.supersededByCommitmentId);
    }

    await this.applyCommitment(
      commitmentId,
      request.expectedVersion,
      async (tx) => {
        switch (request.action) {
          case 'activate': {
            const supports = await loadSupports(tx, 'commitment', commitmentId);
            return activateCommitment(commitment, status, supports, actor, now);
          }
          case 'fulfil':
            return fulfilCommitment(commitment, status, actor, request.note ?? null, now);
          case 'withdraw':
            return withdrawCommitment(commitment, status, actor, request.reason, now);
          case 'supersede':
            return supersedeCommitment(
              commitment,
              status,
              toCommitmentId(request.supersededByCommitmentId),
              actor,
              request.reason ?? null,
              now,
            );
        }
      },
      now,
    );

    return this.getCommitment(workspaceId, sessionId, commitmentId);
  }

  // ─── Action items ─────────────────────────────────────────────────────────

  async listActionItems(workspaceId: string, sessionId: string): Promise<ActionItemSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    const rows = await this.prisma.actionItem.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const counts = await this.support.countsBySession('action_item', sessionId);
    const now = new Date();
    return rows.map((row) => toActionItemSummary(row, counts.get(row.id) ?? 0, now));
  }

  async getActionItem(
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
  ): Promise<ActionItemDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireActionItemRow(workspaceId, sessionId, actionItemId);
    const supports = await this.support.listViews('action_item', actionItemId);
    return toActionItemDetail(row, session.status as SessionStatus, supports, new Date());
  }

  async actionItemHistory(workspaceId: string, sessionId: string, actionItemId: string) {
    await this.requireActionItemRow(workspaceId, sessionId, actionItemId);
    return this.history('action_item', actionItemId);
  }

  async createActionItem(
    workspaceId: string,
    sessionId: string,
    request: CreateActionItemRequest,
    principal: Principal,
  ): Promise<ActionItemDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    if (request.ownerUserId !== undefined) {
      await this.requireEligibleOwner(session.organisationId, request.ownerUserId);
    }
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createActionItem(session.status as SessionStatus, {
      id: toActionItemId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      title: request.title,
      description: request.description,
      ownerDescription: request.ownerDescription,
      ownerUserId: request.ownerUserId === undefined ? null : toUserId(request.ownerUserId),
      priority: request.priority as ActionItemPriority | undefined,
      dueDate: request.dueDate === undefined ? null : new Date(request.dueDate),
      createdBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.actionItem.create({
        data: {
          id: outcome.actionItem.id,
          organisationId: outcome.actionItem.organisationId,
          workspaceId: outcome.actionItem.workspaceId,
          sessionId: outcome.actionItem.sessionId,
          title: outcome.actionItem.title,
          description: outcome.actionItem.description,
          status: outcome.actionItem.status,
          priority: outcome.actionItem.priority,
          ownerDescription: outcome.actionItem.ownerDescription,
          ownerUserId: outcome.actionItem.ownerUserId,
          dueDate: outcome.actionItem.dueDate,
          percentComplete: outcome.actionItem.percentComplete,
          createdById: outcome.actionItem.createdBy.id,
          createdAt: outcome.actionItem.createdAt,
          updatedAt: outcome.actionItem.updatedAt,
          version: outcome.actionItem.version,
        },
      });
      await appendAuditEvent(tx, 'action_item', outcome.actionItem.id, outcome.event, now);
    });

    return this.getActionItem(workspaceId, sessionId, outcome.actionItem.id);
  }

  async updateActionItem(
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    request: UpdateActionItemRequest,
    principal: Principal,
  ): Promise<ActionItemDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireActionItemRow(workspaceId, sessionId, actionItemId);
    if (request.ownerUserId !== undefined && request.ownerUserId !== null) {
      await this.requireEligibleOwner(session.organisationId, request.ownerUserId);
    }
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateActionItem(
      toDomainActionItem(row),
      session.status as SessionStatus,
      actor,
      {
        title: request.title,
        description: request.description,
        ownerDescription: request.ownerDescription,
        ownerUserId: toOwnerPatch(request.ownerUserId),
        priority: request.priority as ActionItemPriority | undefined,
        dueDate: toDatePatch(request.dueDate),
      },
      now,
    );

    await this.applyActionItem(actionItemId, request.expectedVersion, outcome, now);
    return this.getActionItem(workspaceId, sessionId, actionItemId);
  }

  async transitionActionItem(
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    request: ActionItemTransitionRequest,
    principal: Principal,
  ): Promise<ActionItemDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireActionItemRow(workspaceId, sessionId, actionItemId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;
    const actionItem = toDomainActionItem(row);

    const outcome = ((): ActionItemOutcome => {
      switch (request.action) {
        case 'start':
          return startActionItem(actionItem, status, actor, now);
        case 'record_progress':
          return recordActionProgress(
            actionItem,
            status,
            actor,
            { percentComplete: request.percentComplete, note: request.note },
            now,
          );
        case 'block':
          return blockActionItem(actionItem, status, actor, request.reason, now);
        case 'unblock':
          return unblockActionItem(actionItem, status, actor, now);
        case 'complete':
          return completeActionItem(actionItem, status, actor, request.note ?? null, now);
        case 'cancel':
          return cancelActionItem(actionItem, status, actor, request.reason, now);
      }
    })();

    await this.applyActionItem(actionItemId, request.expectedVersion, outcome, now);
    return this.getActionItem(workspaceId, sessionId, actionItemId);
  }

  // ─── Support ──────────────────────────────────────────────────────────────

  /**
   * Resolve an outcome for the support endpoints, confirming it exists in this
   * workspace and session and returning the scope its support records inherit.
   *
   * Scoping only. Whether the outcome is already authoritative — which decides
   * whether its last basis may be detached — is deliberately *not* returned
   * here: `OutcomeSupportService.remove` re-reads it inside its own
   * transaction, because a status read out here would be stale by the time the
   * delete lands.
   */
  async resolveOutcomeForSupport(
    workspaceId: string,
    sessionId: string,
    outcomeType: OutcomeType,
    outcomeId: string,
  ): Promise<{ scope: { organisationId: string; workspaceId: string; sessionId: string } }> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const scope = { organisationId: session.organisationId, workspaceId, sessionId };

    switch (outcomeType) {
      case 'decision':
        await this.requireDecisionRow(workspaceId, sessionId, outcomeId);
        return { scope };
      case 'commitment':
        await this.requireCommitmentRow(workspaceId, sessionId, outcomeId);
        return { scope };
      case 'action_item':
        await this.requireActionItemRow(workspaceId, sessionId, outcomeId);
        return { scope };
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async history(
    subjectType: 'decision' | 'commitment' | 'action_item',
    subjectId: string,
  ): Promise<
    { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[]
  > {
    const events = await this.prisma.auditEvent.findMany({
      where: { subjectType, subjectId },
      orderBy: { occurredAt: 'asc' },
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      occurredAt: event.occurredAt.toISOString(),
      metadata: (event.metadata ?? {}) as Record<string, string>,
    }));
  }

  /**
   * `build` runs inside the transaction so a support-gated mutator
   * (`confirmDecision`) sees the supports as they are at write time — see the
   * file header on why reading them earlier would leave a window.
   */
  private async applyDecision(
    decisionId: string,
    expectedVersion: number,
    build: (tx: PrismaTransaction) => DecisionOutcome | Promise<DecisionOutcome>,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const outcome = await build(tx);
      const result = await tx.decision.updateMany({
        where: { id: decisionId, version: expectedVersion },
        data: {
          title: outcome.decision.title,
          statement: outcome.decision.statement,
          status: outcome.decision.status,
          confirmedById: outcome.decision.confirmedBy?.id ?? null,
          confirmedAt: outcome.decision.confirmedAt,
          supersededByDecisionId: outcome.decision.supersededByDecisionId,
          supersededAt: outcome.decision.supersededAt,
          reversedAt: outcome.decision.reversedAt,
          closeReason: outcome.decision.closeReason,
          updatedAt: outcome.decision.updatedAt,
          version: outcome.decision.version,
        },
      });

      if (result.count === 0) throw new ConflictException(STALE_VERSION);

      await appendAuditEvent(tx, 'decision', decisionId, outcome.event, at);
    });
  }

  private async applyCommitment(
    commitmentId: string,
    expectedVersion: number,
    build: (tx: PrismaTransaction) => CommitmentOutcome | Promise<CommitmentOutcome>,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const outcome = await build(tx);
      const result = await tx.commitment.updateMany({
        where: { id: commitmentId, version: expectedVersion },
        data: {
          title: outcome.commitment.title,
          description: outcome.commitment.description,
          status: outcome.commitment.status,
          ownerDescription: outcome.commitment.ownerDescription,
          ownerUserId: outcome.commitment.ownerUserId,
          dueDate: outcome.commitment.dueDate,
          activatedById: outcome.commitment.activatedBy?.id ?? null,
          activatedAt: outcome.commitment.activatedAt,
          fulfilledAt: outcome.commitment.fulfilledAt,
          fulfilmentNote: outcome.commitment.fulfilmentNote,
          supersededByCommitmentId: outcome.commitment.supersededByCommitmentId,
          closedAt: outcome.commitment.closedAt,
          closeReason: outcome.commitment.closeReason,
          updatedAt: outcome.commitment.updatedAt,
          version: outcome.commitment.version,
        },
      });

      if (result.count === 0) throw new ConflictException(STALE_VERSION);

      await appendAuditEvent(tx, 'commitment', commitmentId, outcome.event, at);
    });
  }

  private async applyActionItem(
    actionItemId: string,
    expectedVersion: number,
    outcome: ActionItemOutcome,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.actionItem.updateMany({
        where: { id: actionItemId, version: expectedVersion },
        data: {
          title: outcome.actionItem.title,
          description: outcome.actionItem.description,
          status: outcome.actionItem.status,
          priority: outcome.actionItem.priority,
          ownerDescription: outcome.actionItem.ownerDescription,
          ownerUserId: outcome.actionItem.ownerUserId,
          dueDate: outcome.actionItem.dueDate,
          percentComplete: outcome.actionItem.percentComplete,
          progressNote: outcome.actionItem.progressNote,
          blockedReason: outcome.actionItem.blockedReason,
          startedAt: outcome.actionItem.startedAt,
          completedAt: outcome.actionItem.completedAt,
          closedAt: outcome.actionItem.closedAt,
          closeReason: outcome.actionItem.closeReason,
          updatedAt: outcome.actionItem.updatedAt,
          version: outcome.actionItem.version,
        },
      });

      if (result.count === 0) throw new ConflictException(STALE_VERSION);

      await appendAuditEvent(tx, 'action_item', actionItemId, outcome.event, at);
    });
  }

  /**
   * A named `ownerUserId` must be a member in good standing of the outcome's
   * own organisation — the same check, and the same reasoning, as
   * `SessionsService.requireFacilitator`. Without it a commitment could name
   * an owner from another organisation, which is both a data-integrity
   * problem and a quiet cross-organisation reference.
   */
  private async requireEligibleOwner(organisationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
      select: { state: true },
    });

    if (membership === null || !isInGoodStanding(membership.state as MembershipState)) {
      throw new NotFoundException({
        error: {
          code: 'OWNER_NOT_ELIGIBLE',
          message:
            `User '${userId}' is not a member in good standing of organisation ` +
            `'${organisationId}', and cannot be recorded as an owner there.`,
        },
      });
    }
  }

  private async requireSessionRow(workspaceId: string, sessionId: string): Promise<SessionRow> {
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

  private async requireDecisionRow(
    workspaceId: string,
    sessionId: string,
    decisionId: string,
  ): Promise<DecisionRow> {
    const row = await this.prisma.decision.findUnique({
      where: { id: decisionId },
      include: { proposedBy: true, confirmedBy: true },
    });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'DECISION_NOT_FOUND',
          message: `No decision '${decisionId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }

  private async requireCommitmentRow(
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
  ): Promise<CommitmentRow> {
    const row = await this.prisma.commitment.findUnique({
      where: { id: commitmentId },
      include: { proposedBy: true, activatedBy: true },
    });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'COMMITMENT_NOT_FOUND',
          message: `No commitment '${commitmentId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }

  private async requireActionItemRow(
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
  ): Promise<ActionItemRow> {
    const row = await this.prisma.actionItem.findUnique({
      where: { id: actionItemId },
      include: { createdBy: true },
    });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'ACTION_ITEM_NOT_FOUND',
          message: `No action '${actionItemId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }
}

async function loadSupports(
  tx: PrismaTransaction,
  outcomeType: OutcomeType,
  outcomeId: string,
): Promise<readonly OutcomeSupport[]> {
  const rows = await tx.outcomeSupport.findMany({
    where: { outcomeType, outcomeId },
    orderBy: { recordedAt: 'asc' },
  });
  return rows.map((row) => toDomainSupport(row));
}

/**
 * `undefined` means "leave alone" and `null` means "clear"; the wire uses the
 * same distinction, so this only narrows the branded type.
 */
function toOwnerPatch(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : toUserId(value);
}

function toDatePatch(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

/**
 * An actor for the wire. `actorId` is always known; the joined row is present
 * only on the read paths that `include` it, so a missing relation degrades to
 * the id rather than throwing — a view is never the place a missing join
 * becomes a 500.
 */
function actorView(actorId: string, row: ActorRow | null | undefined) {
  return {
    id: actorId,
    kind: (row?.kind ?? 'human') as 'human' | 'system',
    displayName: row?.displayName ?? '',
  };
}

// ─── Row → domain ─────────────────────────────────────────────────────────────

export function toDomainDecision(row: DecisionRow): Decision {
  return {
    id: toDecisionId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    title: row.title,
    statement: row.statement,
    status: row.status as DecisionStatus,
    proposedBy: bareActor(row.proposedById),
    proposedAt: row.proposedAt,
    confirmedBy: row.confirmedById === null ? null : bareActor(row.confirmedById),
    confirmedAt: row.confirmedAt,
    supersededByDecisionId:
      row.supersededByDecisionId === null ? null : toDecisionId(row.supersededByDecisionId),
    supersededAt: row.supersededAt,
    reversedAt: row.reversedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function toDomainCommitment(row: CommitmentRow): Commitment {
  return {
    id: toCommitmentId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    title: row.title,
    description: row.description,
    status: row.status as CommitmentStatus,
    ownerDescription: row.ownerDescription,
    ownerUserId: row.ownerUserId === null ? null : toUserId(row.ownerUserId),
    dueDate: row.dueDate,
    proposedBy: bareActor(row.proposedById),
    proposedAt: row.proposedAt,
    activatedBy: row.activatedById === null ? null : bareActor(row.activatedById),
    activatedAt: row.activatedAt,
    fulfilledAt: row.fulfilledAt,
    fulfilmentNote: row.fulfilmentNote,
    supersededByCommitmentId:
      row.supersededByCommitmentId === null ? null : toCommitmentId(row.supersededByCommitmentId),
    closedAt: row.closedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function toDomainActionItem(row: ActionItemRow): ActionItem {
  return {
    id: toActionItemId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    title: row.title,
    description: row.description,
    status: row.status as ActionItemStatus,
    priority: row.priority as ActionItemPriority,
    ownerDescription: row.ownerDescription,
    ownerUserId: row.ownerUserId === null ? null : toUserId(row.ownerUserId),
    dueDate: row.dueDate,
    percentComplete: row.percentComplete,
    progressNote: row.progressNote,
    blockedReason: row.blockedReason,
    createdBy: bareActor(row.createdById),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    closedAt: row.closedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/**
 * Actors are reconstructed from the row's id alone for the domain call. The
 * mutators only ever carry the *acting* actor into the audit event, and that
 * one is resolved properly by `resolveActor`; the stored ids are never read
 * back for their display name here, only re-persisted unchanged.
 */
function bareActor(id: string): Actor {
  return { id: toActorId(id), kind: 'human', displayName: '' };
}

// ─── Row → view ───────────────────────────────────────────────────────────────

function decisionActions(
  row: DecisionRow,
  sessionStatus: SessionStatus,
): DecisionTransitionRequest['action'][] {
  if (sessionStatus === 'archived') return [];
  if (row.status === 'proposed') return ['confirm'];
  if (row.status === 'confirmed') return ['supersede', 'reverse'];
  return [];
}

export function toDecisionSummary(row: DecisionRow, supportCount: number): DecisionSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    status: row.status as DecisionStatus,
    proposedAt: row.proposedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    supportCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDecisionDetail(
  row: DecisionRow,
  sessionStatus: SessionStatus,
  supports: OutcomeSupportView[],
): DecisionDetail {
  return {
    ...toDecisionSummary(row, supports.length),
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    statement: row.statement,
    proposedBy: actorView(row.proposedById, row.proposedBy),
    confirmedBy: row.confirmedById === null ? null : actorView(row.confirmedById, row.confirmedBy),
    supersededByDecisionId: row.supersededByDecisionId,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    closeReason: row.closeReason,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    permittedActions: decisionActions(row, sessionStatus),
    canEdit: canEditDecision(toDomainDecision(row), sessionStatus),
    supports,
  };
}

function commitmentActions(
  row: CommitmentRow,
  sessionStatus: SessionStatus,
): CommitmentTransitionRequest['action'][] {
  if (sessionStatus === 'archived') return [];
  if (row.status === 'proposed') return ['activate', 'withdraw'];
  if (row.status === 'active') return ['fulfil', 'withdraw', 'supersede'];
  return [];
}

export function toCommitmentSummary(
  row: CommitmentRow,
  supportCount: number,
  now: Date,
): CommitmentSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    status: row.status as CommitmentStatus,
    ownerDescription: row.ownerDescription,
    ownerUserId: row.ownerUserId,
    dueDate: row.dueDate?.toISOString() ?? null,
    overdue: isOverdueCommitment(toDomainCommitment(row), now),
    supportCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCommitmentDetail(
  row: CommitmentRow,
  sessionStatus: SessionStatus,
  supports: OutcomeSupportView[],
  now: Date,
): CommitmentDetail {
  return {
    ...toCommitmentSummary(row, supports.length, now),
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    description: row.description,
    proposedBy: actorView(row.proposedById, row.proposedBy),
    proposedAt: row.proposedAt.toISOString(),
    activatedBy: row.activatedById === null ? null : actorView(row.activatedById, row.activatedBy),
    activatedAt: row.activatedAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    fulfilmentNote: row.fulfilmentNote,
    supersededByCommitmentId: row.supersededByCommitmentId,
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    permittedActions: commitmentActions(row, sessionStatus),
    canEdit: canEditCommitment(toDomainCommitment(row), sessionStatus),
    supports,
  };
}

function actionItemActions(
  row: ActionItemRow,
  sessionStatus: SessionStatus,
): ActionItemTransitionRequest['action'][] {
  if (sessionStatus === 'archived') return [];
  switch (row.status as ActionItemStatus) {
    case 'open':
      return ['start', 'complete', 'cancel'];
    case 'in_progress':
      return ['record_progress', 'block', 'complete', 'cancel'];
    case 'blocked':
      return ['record_progress', 'unblock', 'complete', 'cancel'];
    default:
      return [];
  }
}

export function toActionItemSummary(
  row: ActionItemRow,
  supportCount: number,
  now: Date,
): ActionItemSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    status: row.status as ActionItemStatus,
    priority: row.priority as ActionItemPriority,
    ownerDescription: row.ownerDescription,
    ownerUserId: row.ownerUserId,
    dueDate: row.dueDate?.toISOString() ?? null,
    overdue: isOverdueActionItem(toDomainActionItem(row), now),
    percentComplete: row.percentComplete,
    supportCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toActionItemDetail(
  row: ActionItemRow,
  sessionStatus: SessionStatus,
  supports: OutcomeSupportView[],
  now: Date,
): ActionItemDetail {
  return {
    ...toActionItemSummary(row, supports.length, now),
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    description: row.description,
    progressNote: row.progressNote,
    blockedReason: row.blockedReason,
    createdBy: actorView(row.createdById, row.createdBy),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    permittedActions: actionItemActions(row, sessionStatus),
    canEdit: canEditActionItem(toDomainActionItem(row), sessionStatus),
    supports,
  };
}
