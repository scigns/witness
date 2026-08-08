/**
 * Application layer for structured live evidence capture (BUILD_ROADMAP.md
 * Milestone 5) — capture, draft editing, submission, withdrawal, listing
 * and history of one session's evidence.
 *
 * Same shape as `ParticipantsService`/`SessionConsentConfigurationService`:
 * load the row(s), reconstruct the domain aggregate, call into
 * `@witness/domain` for the rule, write the result and its audit event back
 * inside a transaction using `expectedVersion` for optimistic concurrency.
 *
 * The one thing genuinely new here: this is the first consumer of
 * `ConsentPolicyService` outside the consent module itself. `resolveConsentBasis`
 * below is the ONLY place this service asks a consent question — every
 * write that captures or edits participant-backed evidence goes through it,
 * and it never duplicates `ConsentPolicyService`'s own logic (the milestone's
 * explicit instruction). A refused or missing consent answer throws
 * `ForbiddenException` before the domain layer is ever called, so a
 * consent failure never becomes a stored `InvariantViolation` — it is a
 * request that should never have reached the domain in the first place.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  canBeginReview,
  canCorrectEvidence,
  canDecideEvidence,
  canEditEvidence,
  canSubmitEvidence,
  canWithdrawEvidence,
  captureEvidence,
  requiredConsentCategoryForCapture,
  submitEvidence,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toSessionParticipantId,
  toWorkspaceId,
  updateEvidenceDraft,
  withdrawEvidence,
  type Evidence,
  type EvidenceAttributionMode,
  type EvidenceOutcome,
  type ParticipantIdentityMode,
  type ParticipantIdentityVisibility,
  type SessionStatus,
} from '@witness/domain';
import type {
  CaptureEvidenceRequest,
  EvidenceDetail,
  EvidenceReviewActionRequest,
  EvidenceReviewStatus,
  EvidenceSummary,
  EvidenceTransitionRequest,
  UpdateEvidenceDraftRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { Principal } from '../authz/authorization.port.js';

export interface EvidenceListFilter {
  reviewStatus?: string | undefined;
  evidenceType?: string | undefined;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEnforcement: PolicyEnforcementService,
    private readonly consentPolicy: ConsentPolicyService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(
    workspaceId: string,
    sessionId: string,
    filter: EvidenceListFilter = {},
  ): Promise<EvidenceSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const rows = await this.prisma.evidence.findMany({
      where: {
        sessionId,
        ...(filter.reviewStatus !== undefined ? { reviewStatus: filter.reviewStatus } : {}),
        ...(filter.evidenceType !== undefined ? { evidenceType: filter.evidenceType } : {}),
      },
      orderBy: { capturedAt: 'asc' },
      take: 1000,
    });

    return rows.map((row) => toSummary(row));
  }

  async get(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(row, session.status as SessionStatus, includeRestricted);
  }

  async history(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<
    { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[]
  > {
    await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);

    const events = await this.prisma.auditEvent.findMany({
      where: { subjectType: 'evidence', subjectId: evidenceId },
      orderBy: { occurredAt: 'asc' },
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      occurredAt: event.occurredAt.toISOString(),
      metadata: (event.metadata ?? {}) as Record<string, string>,
    }));
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async capture(
    workspaceId: string,
    sessionId: string,
    request: CaptureEvidenceRequest,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const now = new Date();

    let participantIdentityMode: ParticipantIdentityMode | null = null;
    let consentBasis: readonly string[] = [];

    if (request.sourceParticipantId !== undefined) {
      const participant = await this.requireParticipantRow(
        workspaceId,
        sessionId,
        request.sourceParticipantId,
      );
      participantIdentityMode = participant.identityMode as ParticipantIdentityMode;
      consentBasis = await this.resolveConsentBasis(
        sessionId,
        request.sourceParticipantId,
        request.attributionMode,
        request.evidenceType,
        now,
      );
    }

    const actor = await resolveActor(this.prisma, principal);

    const outcome = captureEvidence(session.status as SessionStatus, {
      id: toEvidenceId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      evidenceType: request.evidenceType,
      title: request.title,
      content: request.content,
      language: request.language,
      sessionOffsetSeconds: request.sessionOffsetSeconds,
      sourceParticipantId:
        request.sourceParticipantId !== undefined
          ? toSessionParticipantId(request.sourceParticipantId)
          : null,
      participantIdentityMode,
      attributionMode: request.attributionMode as EvidenceAttributionMode,
      identityVisibility: request.identityVisibility as ParticipantIdentityVisibility | undefined,
      consentBasis,
      tags: request.tags,
      submitImmediately: request.submitImmediately,
      capturedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.evidence.create({ data: toCreateRow(outcome.evidence) });
      await appendAuditEvent(tx, 'evidence', outcome.evidence.id, outcome.event, now);
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, outcome.evidence.id);
    return toDetail(row, session.status as SessionStatus, includeRestricted);
  }

  async updateDraft(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    request: UpdateEvidenceDraftRequest,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const nextSourceParticipantId =
      request.sourceParticipantId !== undefined
        ? request.sourceParticipantId
        : evidence.sourceParticipantId;

    let participantIdentityMode: ParticipantIdentityMode | null = null;
    let consentBasis: readonly string[] | undefined;

    if (nextSourceParticipantId !== null) {
      const nextAttributionMode =
        (request.attributionMode as EvidenceAttributionMode | undefined) ??
        evidence.attributionMode;
      const participant = await this.requireParticipantRow(
        workspaceId,
        sessionId,
        nextSourceParticipantId,
      );
      participantIdentityMode = participant.identityMode as ParticipantIdentityMode;
      consentBasis = await this.resolveConsentBasis(
        sessionId,
        nextSourceParticipantId,
        nextAttributionMode,
        request.evidenceType ?? evidence.evidenceType,
        now,
      );
    } else if (request.sourceParticipantId === null) {
      consentBasis = [];
    }

    const outcome = updateEvidenceDraft(
      evidence,
      session.status as SessionStatus,
      actor,
      {
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
        consentBasis,
        tags: request.tags,
      },
      now,
    );

    await this.applyOutcome(evidenceId, request.expectedVersion, outcome, now);

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    return toDetail(updated, session.status as SessionStatus, includeRestricted);
  }

  async transition(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    action: EvidenceTransitionRequest,
    principal: Principal,
  ): Promise<EvidenceDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    const evidence = toDomainEvidence(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;

    const outcome =
      action.action === 'submit'
        ? submitEvidence(evidence, status, actor, now)
        : withdrawEvidence(evidence, status, actor, action.reason ?? null, now);

    await this.applyOutcome(evidenceId, action.expectedVersion, outcome, now);

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    const updated = await this.requireEvidenceRow(workspaceId, sessionId, evidenceId);
    return toDetail(updated, status, includeRestricted);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * The domain half of attribution compatibility (`assertAttributionCompatibility`)
   * runs inside `captureEvidence`/`updateEvidenceDraft` itself; this is the
   * consent half, which needs a database read the domain layer may not
   * perform (ADR-0003). Every participant-backed capture needs
   * `mayParticipate`; quotation evidence additionally needs the specific
   * attributed/anonymous quotation category `requiredConsentCategoryForCapture`
   * names. A refused or missing answer fails closed — `ForbiddenException`,
   * never a silently-narrowed capture.
   */
  private async resolveConsentBasis(
    sessionId: string,
    participantId: string,
    attributionMode: string,
    evidenceType: string,
    now: Date,
  ): Promise<readonly string[]> {
    const participation = await this.consentPolicy.mayParticipate(sessionId, participantId, now);
    if (!participation.allowed) {
      throw new ForbiddenException({
        error: { code: 'CONSENT_NOT_GRANTED', message: participation.reason },
      });
    }

    const basis: string[] = ['participation'];

    const category = requiredConsentCategoryForCapture({
      attributionMode: attributionMode as EvidenceAttributionMode,
      evidenceType,
    });
    if (category === null) return basis;

    const answer =
      attributionMode === 'attributed'
        ? await this.consentPolicy.mayAttributeQuotation(sessionId, participantId, now)
        : await this.consentPolicy.mayQuoteAnonymously(sessionId, participantId, now);

    if (!answer.allowed) {
      throw new ForbiddenException({
        error: { code: 'CONSENT_NOT_GRANTED', message: answer.reason },
      });
    }

    basis.push(category);
    return basis;
  }

  private async applyOutcome(
    evidenceId: string,
    expectedVersion: number,
    outcome: EvidenceOutcome,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.evidence.updateMany({
        where: { id: evidenceId, version: expectedVersion },
        data: toUpdateRow(outcome.evidence),
      });

      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This evidence was changed by someone else since you last loaded it. Reload and try again.',
          },
        });
      }

      await appendAuditEvent(tx, 'evidence', evidenceId, outcome.event, at);
    });
  }

  private async canSeeRestricted(principal: Principal, workspaceId: string): Promise<boolean> {
    const decision = await this.policyEnforcement.decide(principal, 'evidence:manage_restricted', {
      type: 'workspace',
      workspaceId,
    });
    return decision.allowed;
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
  ): Promise<{ id: string; identityMode: string; withdrawnAt: Date | null }> {
    const row = await this.prisma.sessionParticipant.findUnique({ where: { id: participantId } });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_NOT_FOUND',
          message: `No participant '${participantId}' in session '${sessionId}'.`,
        },
      });
    }

    if (row.withdrawnAt !== null) {
      throw new BadRequestException({
        error: {
          code: 'PARTICIPANT_WITHDRAWN',
          message: `Participant '${participantId}' has withdrawn from this session and cannot be a source of new evidence.`,
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
}

export type EvidenceRow = Awaited<ReturnType<PrismaService['evidence']['findUniqueOrThrow']>>;

export function toDomainEvidence(row: EvidenceRow): Evidence {
  return {
    id: toEvidenceId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    evidenceType: row.evidenceType,
    title: row.title,
    content: row.content,
    language: row.language,
    capturedAt: row.capturedAt,
    sessionOffsetSeconds: row.sessionOffsetSeconds,
    sourceParticipantId:
      row.sourceParticipantId !== null ? toSessionParticipantId(row.sourceParticipantId) : null,
    attributionMode: row.attributionMode as Evidence['attributionMode'],
    identityVisibility: row.identityVisibility as Evidence['identityVisibility'],
    consentBasis: row.consentBasis,
    reviewStatus: row.reviewStatus as Evidence['reviewStatus'],
    verificationStatus: row.verificationStatus as Evidence['verificationStatus'],
    tags: row.tags,
    supersededByEvidenceId:
      row.supersededByEvidenceId !== null ? toEvidenceId(row.supersededByEvidenceId) : null,
    withdrawnAt: row.withdrawnAt,
    withdrawalReason: row.withdrawalReason,
    reviewDecisionReason: row.reviewDecisionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCreateRow(evidence: Evidence) {
  return {
    id: evidence.id,
    organisationId: evidence.organisationId,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    ...toUpdateRow(evidence),
    createdAt: evidence.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(evidence: Evidence) {
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
 * Privacy-safe by construction — `sourceParticipantId` is present only when
 * `attributionMode` is `attributed`. For `pseudonymous`/`anonymous` evidence
 * the participant link exists in the database (so consent and moderation
 * can still trace it) but is never sent to any client, the same
 * "structurally absent, not merely redacted" convention every other
 * restricted field in this schema follows.
 */
function toSummary(row: EvidenceRow): EvidenceSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    evidenceType: row.evidenceType,
    title: row.title,
    attributionMode: row.attributionMode as EvidenceSummary['attributionMode'],
    identityVisibility: row.identityVisibility as EvidenceSummary['identityVisibility'],
    reviewStatus: row.reviewStatus as EvidenceReviewStatus,
    verificationStatus: row.verificationStatus as EvidenceSummary['verificationStatus'],
    tags: [...row.tags],
    capturedAt: row.capturedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    withdrawn: row.withdrawnAt !== null,
    ...(row.attributionMode === 'attributed' && row.sourceParticipantId !== null
      ? { sourceParticipantId: row.sourceParticipantId }
      : {}),
  };
}

export function toDetail(
  row: EvidenceRow,
  sessionStatus: SessionStatus,
  includeRestricted: boolean,
): EvidenceDetail {
  const summary = toSummary(row);
  const evidence = toDomainEvidence(row);

  const permittedActions: EvidenceTransitionRequest['action'][] = [];
  if (canSubmitEvidence(evidence, sessionStatus)) permittedActions.push('submit');
  if (canWithdrawEvidence(evidence, sessionStatus)) permittedActions.push('withdraw');

  /**
   * State-derived only — same convention `permittedActions` above already
   * uses. Whether the *current caller specifically* holds the active
   * `ReviewAssignment` (and so may actually call `begin_review`/`validate`/
   * `reject`) is `EvidenceReviewService`'s per-request authorisation check,
   * not something this state machine can know from the evidence row alone.
   */
  const permittedReviewActions: EvidenceReviewActionRequest['action'][] = [];
  if (canBeginReview(evidence, sessionStatus)) permittedReviewActions.push('begin_review');
  if (canDecideEvidence(evidence, sessionStatus)) {
    permittedReviewActions.push('validate', 'reject');
  }
  if (evidence.reviewStatus === 'needs_clarification' && sessionStatus !== 'archived') {
    permittedReviewActions.push('resume_review');
  }

  return {
    ...summary,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    content: row.content,
    language: row.language,
    sessionOffsetSeconds: row.sessionOffsetSeconds,
    supersededByEvidenceId: row.supersededByEvidenceId,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    permittedActions,
    permittedReviewActions,
    canEdit: canEditEvidence(evidence, sessionStatus),
    canCorrect: canCorrectEvidence(evidence, sessionStatus),
    reviewDecisionReason: row.reviewDecisionReason,
    ...(includeRestricted
      ? { consentBasis: [...row.consentBasis], withdrawalReason: row.withdrawalReason }
      : {}),
  };
}
