/**
 * Application layer for evidence review and validation (BUILD_ROADMAP.md
 * Milestone 6) — assigning reviewers, moving evidence through the review
 * lifecycle, clarification requests/responses, and content corrections made
 * while evidence is in the review workflow.
 *
 * Same shape as `EvidenceService`/`SessionConsentConfigurationService`: load
 * the row(s), reconstruct the domain aggregate(s), call into
 * `@witness/domain` for the rule, write the result(s) and audit event(s)
 * back inside a transaction using `expectedVersion` for optimistic
 * concurrency.
 *
 * Two authorisation layers apply to every review-lifecycle write
 * (`beginReview`/`decide`/clarification actions), not one:
 *
 * 1. `AuthorizationGuard` (via `@Requires` on the controller) — does this
 *    principal's role hold the Casbin action at all, in this workspace?
 * 2. `requireActiveAssignmentReviewer` below — is this principal the
 *    *specific* reviewer holding the active `ReviewAssignment` for *this*
 *    evidence? A role grant alone is not enough: `assertReviewMutable`'s
 *    caller-agnostic domain checks only enforce state, not who is allowed to
 *    move it, and the milestone's authorisation matrix explicitly rejects
 *    "validation by unauthorised reviewer" even when that reviewer's role
 *    would otherwise permit `evidence_review:validate` generally. A
 *    principal holding `evidence_review:manage_restricted` (admin tier)
 *    bypasses the ownership check — the same "restricted tier can override"
 *    precedent `evidence:manage_restricted` already established.
 *
 * "One active reviewer per evidence" (BUILD_ROADMAP.md Milestone 6) is
 * enforced here, not in the domain (`isActiveAssignment` is a pure
 * predicate the domain exports precisely because it cannot read the
 * database itself — ADR-0003): `assign` checks for an existing active
 * assignment before calling `assignReviewer`, and the migration's partial
 * unique index is the last line of defence if that check is ever bypassed.
 */

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  assignReviewer,
  beginReview,
  cancelAssignment,
  closeClarification,
  completeAssignment,
  correctEvidence,
  markNeedsClarification,
  reassignFrom,
  rejectEvidence,
  requestClarification,
  respondToClarification,
  resumeReviewAfterClarification,
  startReview,
  toClarificationId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toReviewAssignmentId,
  toSessionParticipantId,
  toUserId,
  toWorkspaceId,
  validateEvidence,
  withdrawClarification,
  type Actor,
  type Clarification,
  type Evidence,
  type EvidenceAttributionMode,
  type EvidenceOutcome,
  type ParticipantIdentityMode,
  type ParticipantIdentityVisibility,
  type PendingAuditEvent,
  type ReviewAssignment,
  type SessionStatus,
} from '@witness/domain';
import type {
  AssignReviewerRequest,
  CancelReviewAssignmentRequest,
  ClarificationView,
  CorrectEvidenceRequest,
  EvidenceDetail,
  EvidenceReviewActionRequest,
  ReassignReviewerRequest,
  RequestClarificationRequest,
  RespondToClarificationRequest,
  ReviewAssignmentView,
  WithdrawClarificationRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Action, Principal } from '../authz/authorization.port.js';
import { toDetail, toDomainEvidence, type EvidenceRow } from './evidence.service.js';

const SESSION_SUBJECT_PREFIX = 'user:';

@Injectable()
export class EvidenceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  // ─── Assignment ───────────────────────────────────────────────────────────

  async getActiveAssignment(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<ReviewAssignmentView | null> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.prisma.reviewAssignment.findFirst({
      where: { evidenceId, status: { in: ['assigned', 'in_progress'] } },
      include: { assignedBy: true },
    });
    return row === null ? null : toAssignmentView(row);
  }

  async assign(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    request: AssignReviewerRequest,
    principal: Principal,
  ): Promise<ReviewAssignmentView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    await this.requireReviewerUser(request.reviewerUserId);

    const existing = await this.prisma.reviewAssignment.findFirst({
      where: { evidenceId, status: { in: ['assigned', 'in_progress'] } },
    });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'REVIEW_ALREADY_ASSIGNED',
          message: 'This evidence already has an active reviewer. Reassign it instead.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = assignReviewer({
      id: toReviewAssignmentId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      evidenceId: toEvidenceId(evidenceId),
      reviewerUserId: toUserId(request.reviewerUserId),
      assignedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewAssignment.create({ data: toAssignmentCreateRow(outcome.assignment, actor) });
      await appendAuditEvent(tx, 'review_assignment', outcome.assignment.id, outcome.event, now);
    });

    return toAssignmentView(await this.requireAssignmentRowWithActor(outcome.assignment.id));
  }

  async reassign(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    assignmentId: string,
    request: ReassignReviewerRequest,
    principal: Principal,
  ): Promise<ReviewAssignmentView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireAssignmentRow(workspaceId, sessionId, evidenceId, assignmentId);
    const assignment = toDomainAssignment(row);
    await this.requireReviewerUser(request.reviewerUserId);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const closed = reassignFrom(assignment, actor, request.reason ?? null, now);
    const created = assignReviewer({
      id: toReviewAssignmentId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      evidenceId: toEvidenceId(evidenceId),
      reviewerUserId: toUserId(request.reviewerUserId),
      reassignedFromId: closed.assignment.id,
      assignedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.reviewAssignment.updateMany({
        where: { id: assignmentId, version: row.version },
        data: toAssignmentUpdateRow(closed.assignment),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This assignment was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'review_assignment', assignmentId, closed.event, now);

      await tx.reviewAssignment.create({ data: toAssignmentCreateRow(created.assignment, actor) });
      await appendAuditEvent(tx, 'review_assignment', created.assignment.id, created.event, now);
    });

    return toAssignmentView(await this.requireAssignmentRowWithActor(created.assignment.id));
  }

  async cancelAssignment(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    assignmentId: string,
    request: CancelReviewAssignmentRequest,
    principal: Principal,
  ): Promise<void> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const row = await this.requireAssignmentRow(workspaceId, sessionId, evidenceId, assignmentId);
    const assignment = toDomainAssignment(row);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = cancelAssignment(assignment, actor, request.reason ?? null, now);

    await this.applyAssignmentOutcome(assignmentId, row.version, outcome, now);
  }

  // ─── Review lifecycle ───────────────────────────────────────────────────────

  async reviewAction(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    action: EvidenceReviewActionRequest,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    await this.requireCasbinAction(principal, workspaceId, reviewActionPermission(action.action));

    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(row);
    const status = session.status as SessionStatus;

    const assignmentRow = await this.requireAssignedReviewer(evidenceId, principal);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    let outcome: EvidenceOutcome;
    switch (action.action) {
      case 'begin_review':
        outcome = beginReview(evidence, status, actor, now);
        break;
      case 'resume_review':
        outcome = resumeReviewAfterClarification(evidence, status, actor, now);
        break;
      case 'validate':
        outcome = validateEvidence(evidence, status, actor, action.reason ?? null, now);
        break;
      case 'reject':
        outcome = rejectEvidence(evidence, status, actor, action.reason, now);
        break;
    }

    let assignmentOutcome: { assignment: ReviewAssignment; event: PendingAuditEvent } | null = null;
    if (assignmentRow !== null) {
      if (action.action === 'begin_review' && assignmentRow.status === 'assigned') {
        assignmentOutcome = startReview(toDomainAssignment(assignmentRow), actor, now);
      } else if (
        (action.action === 'validate' || action.action === 'reject') &&
        assignmentRow.status === 'in_progress'
      ) {
        assignmentOutcome = completeAssignment(toDomainAssignment(assignmentRow), actor, now);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.evidence.updateMany({
        where: { id: evidenceId, version: action.expectedVersion },
        data: toEvidenceUpdateRow(outcome.evidence),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This evidence was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'evidence', evidenceId, outcome.event, now);

      if (assignmentOutcome !== null && assignmentRow !== null) {
        await tx.reviewAssignment.updateMany({
          where: { id: assignmentRow.id, version: assignmentRow.version },
          data: toAssignmentUpdateRow(assignmentOutcome.assignment),
        });
        await appendAuditEvent(
          tx,
          'review_assignment',
          assignmentRow.id,
          assignmentOutcome.event,
          now,
        );
      }
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    return toEvidenceDetail(updated, status, includeRestricted);
  }

  async correct(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    request: CorrectEvidenceRequest,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;

    if (request.sourceParticipantId !== undefined && request.sourceParticipantId !== null) {
      await this.requireParticipantRow(workspaceId, sessionId, request.sourceParticipantId);
    }

    let participantIdentityMode: ParticipantIdentityMode | null = null;
    const nextSourceParticipantId =
      request.sourceParticipantId !== undefined
        ? request.sourceParticipantId
        : evidence.sourceParticipantId;
    if (nextSourceParticipantId !== null) {
      const participant = await this.prisma.sessionParticipant.findUnique({
        where: { id: nextSourceParticipantId },
      });
      participantIdentityMode = (participant?.identityMode ??
        null) as ParticipantIdentityMode | null;
    }

    const outcome = correctEvidence(
      evidence,
      status,
      actor,
      {
        correctionType: request.correctionType,
        reason: request.reason,
        evidenceType: request.evidenceType,
        title: request.title,
        content: request.content,
        language: request.language,
        sessionOffsetSeconds: request.sessionOffsetSeconds,
        sourceParticipantId:
          request.sourceParticipantId !== undefined
            ? request.sourceParticipantId !== null
              ? toSessionParticipantId(request.sourceParticipantId)
              : null
            : undefined,
        participantIdentityMode,
        attributionMode: request.attributionMode as EvidenceAttributionMode | undefined,
        identityVisibility: request.identityVisibility as ParticipantIdentityVisibility | undefined,
        tags: request.tags,
      },
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.evidence.updateMany({
        where: { id: evidenceId, version: request.expectedVersion },
        data: toEvidenceUpdateRow(outcome.evidence),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This evidence was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'evidence', evidenceId, outcome.event, now);
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    return toEvidenceDetail(updated, status, includeRestricted);
  }

  // ─── Clarifications ───────────────────────────────────────────────────────

  async listClarifications(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<ClarificationView[]> {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const rows = await this.prisma.clarification.findMany({
      where: { evidenceId },
      include: { requestedBy: true, respondedBy: true },
      orderBy: { requestedAt: 'asc' },
    });
    return rows.map(toClarificationView);
  }

  /**
   * Open a clarification and move evidence to `needs_clarification` in one
   * transaction — the atomic pairing `markNeedsClarification`'s doc comment
   * in `@witness/domain` requires.
   */
  async requestClarification(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    request: RequestClarificationRequest,
    principal: Principal,
  ): Promise<ClarificationView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const evidenceRow = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(evidenceRow);
    const status = session.status as SessionStatus;

    const assignmentRow = await this.requireAssignedReviewer(evidenceId, principal);
    if (assignmentRow === null) {
      throw new ForbiddenException({
        error: {
          code: 'NO_ACTIVE_ASSIGNMENT',
          message: 'This evidence has no active reviewer assignment.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const evidenceOutcome = markNeedsClarification(evidence, status, actor, now);
    const clarificationOutcome = requestClarification({
      id: toClarificationId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      evidenceId: toEvidenceId(evidenceId),
      reviewAssignmentId: toReviewAssignmentId(assignmentRow.id),
      question: request.question,
      requestedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.evidence.updateMany({
        where: { id: evidenceId, version: evidenceRow.version },
        data: toEvidenceUpdateRow(evidenceOutcome.evidence),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This evidence was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'evidence', evidenceId, evidenceOutcome.event, now);

      await tx.clarification.create({
        data: toClarificationCreateRow(clarificationOutcome.clarification, actor),
      });
      await appendAuditEvent(
        tx,
        'clarification',
        clarificationOutcome.clarification.id,
        clarificationOutcome.event,
        now,
      );
    });

    return toClarificationView(
      await this.requireClarificationRowWithActors(clarificationOutcome.clarification.id),
    );
  }

  async respondToClarification(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    request: RespondToClarificationRequest,
    principal: Principal,
  ): Promise<ClarificationView> {
    const row = await this.requireClarificationRow(
      workspaceId,
      sessionId,
      evidenceId,
      clarificationId,
    );
    const clarification = toDomainClarification(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = respondToClarification(clarification, actor, request.response, now);

    await this.applyClarificationOutcome(clarificationId, row.version, outcome, now);
    return toClarificationView(await this.requireClarificationRowWithActors(clarificationId));
  }

  async withdrawClarification(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    request: WithdrawClarificationRequest,
    principal: Principal,
  ): Promise<ClarificationView> {
    const row = await this.requireClarificationRow(
      workspaceId,
      sessionId,
      evidenceId,
      clarificationId,
    );
    const clarification = toDomainClarification(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = withdrawClarification(clarification, actor, request.reason ?? null, now);

    await this.applyClarificationOutcome(clarificationId, row.version, outcome, now);
    return toClarificationView(await this.requireClarificationRowWithActors(clarificationId));
  }

  /**
   * Close an answered clarification and resume evidence review in one
   * transaction — the atomic pairing `closeClarification`'s doc comment in
   * `@witness/domain` requires.
   */
  async closeClarification(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    principal: Principal,
  ): Promise<ClarificationView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const evidenceRow = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(evidenceRow);
    const clarificationRow = await this.requireClarificationRow(
      workspaceId,
      sessionId,
      evidenceId,
      clarificationId,
    );
    const clarification = toDomainClarification(clarificationRow);
    const status = session.status as SessionStatus;

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const clarificationOutcome = closeClarification(clarification, actor, now);
    const evidenceOutcome = resumeReviewAfterClarification(evidence, status, actor, now);

    await this.prisma.$transaction(async (tx) => {
      const clarificationResult = await tx.clarification.updateMany({
        where: { id: clarificationId, version: clarificationRow.version },
        data: toClarificationUpdateRow(clarificationOutcome.clarification),
      });
      if (clarificationResult.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This clarification was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'clarification', clarificationId, clarificationOutcome.event, now);

      const evidenceResult = await tx.evidence.updateMany({
        where: { id: evidenceId, version: evidenceRow.version },
        data: toEvidenceUpdateRow(evidenceOutcome.evidence),
      });
      if (evidenceResult.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This evidence was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'evidence', evidenceId, evidenceOutcome.event, now);
    });

    return toClarificationView(await this.requireClarificationRowWithActors(clarificationId));
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async applyAssignmentOutcome(
    assignmentId: string,
    expectedVersion: number,
    outcome: { assignment: ReviewAssignment; event: PendingAuditEvent },
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.reviewAssignment.updateMany({
        where: { id: assignmentId, version: expectedVersion },
        data: toAssignmentUpdateRow(outcome.assignment),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This assignment was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'review_assignment', assignmentId, outcome.event, at);
    });
  }

  private async applyClarificationOutcome(
    clarificationId: string,
    expectedVersion: number,
    outcome: { clarification: Clarification; event: PendingAuditEvent },
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.clarification.updateMany({
        where: { id: clarificationId, version: expectedVersion },
        data: toClarificationUpdateRow(outcome.clarification),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message: 'This clarification was changed by someone else since you last loaded it.',
          },
        });
      }
      await appendAuditEvent(tx, 'clarification', clarificationId, outcome.event, at);
    });
  }

  private async requireCasbinAction(
    principal: Principal,
    workspaceId: string,
    action: Action,
  ): Promise<void> {
    const decision = await this.policyEnforcement.decide(principal, action, {
      type: 'workspace',
      workspaceId,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: decision.reason } });
    }
  }

  private async canSeeRestricted(principal: Principal, workspaceId: string): Promise<boolean> {
    const decision = await this.policyEnforcement.decide(
      principal,
      'evidence_review:manage_restricted',
      { type: 'workspace', workspaceId },
    );
    return decision.allowed;
  }

  /**
   * The active `ReviewAssignment` row for this evidence, verifying the
   * calling principal is its reviewer — unless the principal holds
   * `evidence_review:manage_restricted` (admin override) or is
   * authenticated through the unverified development header, which carries
   * no real user id to check ownership against (see file header). Returns
   * `null` only when there genuinely is no active assignment AND the
   * caller holds the restricted-tier override — every other path throws.
   */
  private async requireAssignedReviewer(
    evidenceId: string,
    principal: Principal,
  ): Promise<AssignmentRow | null> {
    const assignmentRow = await this.prisma.reviewAssignment.findFirst({
      where: { evidenceId, status: { in: ['assigned', 'in_progress'] } },
    });

    const workspaceId = (await this.prisma.evidence.findUnique({ where: { id: evidenceId } }))
      ?.workspaceId;
    const canOverride =
      workspaceId !== undefined &&
      (
        await this.policyEnforcement.decide(principal, 'evidence_review:manage_restricted', {
          type: 'workspace',
          workspaceId,
        })
      ).allowed;

    if (assignmentRow === null) {
      if (canOverride) return null;
      throw new ForbiddenException({
        error: {
          code: 'NO_ACTIVE_ASSIGNMENT',
          message: 'This evidence has no active reviewer assignment.',
        },
      });
    }

    if (canOverride) return assignmentRow;

    if (!principal.subject.startsWith(SESSION_SUBJECT_PREFIX)) {
      // Unverified development header — no real user id to check ownership
      // against. The coarse-grained Casbin check already gated this call.
      return assignmentRow;
    }

    const userId = principal.subject.slice(SESSION_SUBJECT_PREFIX.length);
    if (assignmentRow.reviewerUserId !== userId) {
      throw new ForbiddenException({
        error: {
          code: 'NOT_ASSIGNED_REVIEWER',
          message: 'You are not the reviewer assigned to this evidence.',
        },
      });
    }

    return assignmentRow;
  }

  private async requireReviewerUser(userId: string): Promise<void> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'REVIEWER_NOT_FOUND', message: `No user '${userId}'.` },
      });
    }
  }

  private async requireSessionRow(
    workspaceId: string,
    sessionId: string,
  ): Promise<{ id: string; organisationId: string; workspaceId: string; status: string }> {
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

  private async requireParticipantRow(
    workspaceId: string,
    sessionId: string,
    participantId: string,
  ): Promise<{ id: string; identityMode: string }> {
    const row = await this.prisma.sessionParticipant.findUnique({ where: { id: participantId } });
    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_NOT_FOUND',
          message: `No participant '${participantId}' in session '${sessionId}'.`,
        },
      });
    }
    return row;
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

  private async requireAssignmentRow(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    assignmentId: string,
  ): Promise<AssignmentRow> {
    const row = await this.prisma.reviewAssignment.findUnique({ where: { id: assignmentId } });
    if (
      row === null ||
      row.workspaceId !== workspaceId ||
      row.sessionId !== sessionId ||
      row.evidenceId !== evidenceId
    ) {
      throw new NotFoundException({
        error: {
          code: 'REVIEW_ASSIGNMENT_NOT_FOUND',
          message: `No review assignment '${assignmentId}' on evidence '${evidenceId}'.`,
        },
      });
    }
    return row;
  }

  private async requireAssignmentRowWithActor(
    assignmentId: string,
  ): Promise<AssignmentRowWithActor> {
    const row = await this.prisma.reviewAssignment.findUnique({
      where: { id: assignmentId },
      include: { assignedBy: true },
    });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'REVIEW_ASSIGNMENT_NOT_FOUND',
          message: `No review assignment '${assignmentId}'.`,
        },
      });
    }
    return row;
  }

  private async requireClarificationRow(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
  ): Promise<ClarificationRow> {
    const row = await this.prisma.clarification.findUnique({ where: { id: clarificationId } });
    if (
      row === null ||
      row.workspaceId !== workspaceId ||
      row.sessionId !== sessionId ||
      row.evidenceId !== evidenceId
    ) {
      throw new NotFoundException({
        error: {
          code: 'CLARIFICATION_NOT_FOUND',
          message: `No clarification '${clarificationId}' on evidence '${evidenceId}'.`,
        },
      });
    }
    return row;
  }

  private async requireClarificationRowWithActors(
    clarificationId: string,
  ): Promise<ClarificationRowWithActors> {
    const row = await this.prisma.clarification.findUnique({
      where: { id: clarificationId },
      include: { requestedBy: true, respondedBy: true },
    });
    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'CLARIFICATION_NOT_FOUND',
          message: `No clarification '${clarificationId}'.`,
        },
      });
    }
    return row;
  }
}

function reviewActionPermission(action: EvidenceReviewActionRequest['action']): Action {
  switch (action) {
    case 'begin_review':
    case 'resume_review':
      return 'evidence_review:start';
    case 'validate':
      return 'evidence_review:validate';
    case 'reject':
      return 'evidence_review:reject';
  }
}

type AssignmentRow = Awaited<ReturnType<PrismaService['reviewAssignment']['findFirstOrThrow']>>;
type AssignmentRowWithActor = AssignmentRow & {
  assignedBy: { id: string; kind: string; displayName: string };
};
type ClarificationRow = Awaited<ReturnType<PrismaService['clarification']['findFirstOrThrow']>>;
type ClarificationRowWithActors = ClarificationRow & {
  requestedBy: { id: string; kind: string; displayName: string };
  respondedBy: { id: string; kind: string; displayName: string } | null;
};

function toDomainAssignment(row: AssignmentRow): ReviewAssignment {
  return {
    id: toReviewAssignmentId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    evidenceId: toEvidenceId(row.evidenceId),
    reviewerUserId: toUserId(row.reviewerUserId),
    assignedBy: { id: row.assignedById } as unknown as Actor,
    assignedAt: row.assignedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as ReviewAssignment['status'],
    reassignedFromId:
      row.reassignedFromId !== null ? toReviewAssignmentId(row.reassignedFromId) : null,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toAssignmentCreateRow(assignment: ReviewAssignment, assignedBy: Actor) {
  return {
    id: assignment.id,
    organisationId: assignment.organisationId,
    workspaceId: assignment.workspaceId,
    sessionId: assignment.sessionId,
    evidenceId: assignment.evidenceId,
    reviewerUserId: assignment.reviewerUserId,
    assignedById: assignedBy.id,
    assignedAt: assignment.assignedAt,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    status: assignment.status,
    reassignedFromId: assignment.reassignedFromId,
    closeReason: assignment.closeReason,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    version: assignment.version,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toAssignmentUpdateRow(assignment: ReviewAssignment) {
  return {
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    status: assignment.status,
    reassignedFromId: assignment.reassignedFromId,
    closeReason: assignment.closeReason,
    updatedAt: assignment.updatedAt,
    version: assignment.version,
  };
}

function toAssignmentView(row: AssignmentRowWithActor): ReviewAssignmentView {
  return {
    id: row.id,
    evidenceId: row.evidenceId,
    reviewerUserId: row.reviewerUserId,
    assignedBy: {
      id: row.assignedBy.id,
      kind: row.assignedBy.kind as ReviewAssignmentView['assignedBy']['kind'],
      displayName: row.assignedBy.displayName,
    },
    assignedAt: row.assignedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    status: row.status as ReviewAssignmentView['status'],
    reassignedFromId: row.reassignedFromId,
    closeReason: row.closeReason,
    version: row.version,
  };
}

function toDomainClarification(row: ClarificationRow): Clarification {
  return {
    id: toClarificationId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    evidenceId: toEvidenceId(row.evidenceId),
    reviewAssignmentId: toReviewAssignmentId(row.reviewAssignmentId),
    question: row.question,
    requestedBy: { id: row.requestedById } as unknown as Actor,
    requestedAt: row.requestedAt,
    response: row.response,
    respondedBy:
      row.respondedById !== null ? ({ id: row.respondedById } as unknown as Actor) : null,
    respondedAt: row.respondedAt,
    status: row.status as Clarification['status'],
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toClarificationCreateRow(clarification: Clarification, requestedBy: Actor) {
  return {
    id: clarification.id,
    organisationId: clarification.organisationId,
    workspaceId: clarification.workspaceId,
    sessionId: clarification.sessionId,
    evidenceId: clarification.evidenceId,
    reviewAssignmentId: clarification.reviewAssignmentId,
    question: clarification.question,
    requestedById: requestedBy.id,
    requestedAt: clarification.requestedAt,
    response: clarification.response,
    respondedById: clarification.respondedBy?.id ?? null,
    respondedAt: clarification.respondedAt,
    status: clarification.status,
    closeReason: clarification.closeReason,
    createdAt: clarification.createdAt,
    updatedAt: clarification.updatedAt,
    version: clarification.version,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toClarificationUpdateRow(clarification: Clarification) {
  return {
    response: clarification.response,
    respondedById: clarification.respondedBy?.id ?? null,
    respondedAt: clarification.respondedAt,
    status: clarification.status,
    closeReason: clarification.closeReason,
    updatedAt: clarification.updatedAt,
    version: clarification.version,
  };
}

function toClarificationView(row: ClarificationRowWithActors): ClarificationView {
  return {
    id: row.id,
    evidenceId: row.evidenceId,
    reviewAssignmentId: row.reviewAssignmentId,
    question: row.question,
    requestedBy: {
      id: row.requestedBy.id,
      kind: row.requestedBy.kind as ClarificationView['requestedBy']['kind'],
      displayName: row.requestedBy.displayName,
    },
    requestedAt: row.requestedAt.toISOString(),
    response: row.response,
    respondedBy:
      row.respondedBy !== null
        ? {
            id: row.respondedBy.id,
            kind: row.respondedBy.kind as ClarificationView['requestedBy']['kind'],
            displayName: row.respondedBy.displayName,
          }
        : null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    status: row.status as ClarificationView['status'],
    closeReason: row.closeReason,
    version: row.version,
  };
}

function toEvidenceUpdateRow(evidence: Evidence) {
  return {
    evidenceType: evidence.evidenceType,
    title: evidence.title,
    content: evidence.content,
    language: evidence.language,
    capturedAt: evidence.capturedAt,
    sessionOffsetSeconds: evidence.sessionOffsetSeconds,
    sourceParticipantId: evidence.sourceParticipantId,
    attributionMode: evidence.attributionMode,
    identityVisibility: evidence.identityVisibility,
    consentBasis: [...evidence.consentBasis],
    reviewStatus: evidence.reviewStatus,
    verificationStatus: evidence.verificationStatus,
    tags: [...evidence.tags],
    supersededByEvidenceId: evidence.supersededByEvidenceId,
    withdrawnAt: evidence.withdrawnAt,
    withdrawalReason: evidence.withdrawalReason,
    reviewDecisionReason: evidence.reviewDecisionReason,
    updatedAt: evidence.updatedAt,
    version: evidence.version,
  };
}

/**
 * Reuses `EvidenceService`'s own `toDetail` — one place that builds an
 * `EvidenceDetail` from a row, the same "single row → view mapping"
 * convention `EvidenceLinkService` follows for `toRef`/`toView`.
 */
function toEvidenceDetail(
  row: EvidenceRow,
  sessionStatus: SessionStatus,
  includeRestricted: boolean,
): EvidenceDetail {
  return toDetail(row, sessionStatus, includeRestricted);
}
