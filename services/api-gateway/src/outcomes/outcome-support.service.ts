/**
 * The database half of "on what basis?" (BUILD_ROADMAP.md Milestone 7).
 *
 * `packages/domain/src/outcome-support.ts` decides whether a piece of
 * evidence is *admissible* — validated, verified, same workspace, same
 * organisation. It cannot decide whether the evidence exists or whether this
 * caller can reach it, because both are database reads the domain may not
 * perform (ADR-0003). That half is here, and the split is the same one
 * `ConsentPolicyService` established for capture in Milestone 5.
 *
 * The order matters and is deliberate. This service resolves the evidence
 * row first, refusing anything outside the caller's session/workspace with
 * `EVIDENCE_NOT_FOUND` rather than a message that would confirm the
 * existence of evidence in another workspace. Only then does it hand the
 * row's facts to the domain, which refuses inadmissible evidence by name.
 * An attacker probing for evidence ids therefore learns nothing from the
 * difference between "does not exist" and "exists but you may not use it".
 *
 * Removal is a genuine delete, like `EvidenceLink`: a support record is an
 * assertion about the present basis for an outcome, not a historical claim,
 * and the audit event records that it was removed. Removing the last support
 * from an already-confirmed decision is refused — the aggregate's
 * confirmation rested on it.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  recordEvidenceSupport,
  recordSynthesisSupport,
  removeOutcomeSupport,
  toActorId,
  toCoDesignSessionId,
  toEvidenceId,
  toOrganisationId,
  toOutcomeSupportId,
  toWorkspaceId,
  type EvidenceReviewStatus,
  type EvidenceVerificationStatus,
  type OutcomeSupport,
  type OutcomeType,
  type SupportingEvidenceRef,
} from '@witness/domain';
import type { OutcomeSupportView, RecordOutcomeSupportRequest } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

export type OutcomeSupportRow = Awaited<
  ReturnType<PrismaService['outcomeSupport']['findUniqueOrThrow']>
>;

/** A support row joined to the evidence title, for display. */
type OutcomeSupportRowWithEvidence = OutcomeSupportRow & {
  evidence?: { title: string } | null;
  recordedBy?: { id: string; kind: string; displayName: string } | null;
};

@Injectable()
export class OutcomeSupportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every support record for one outcome, as the domain sees them. The
   * outcome aggregates' `confirm`/`activate` mutators take this list, which
   * is why it is loaded inside the caller's transaction rather than trusted
   * from a stale read.
   */
  async loadForOutcome(
    outcomeType: OutcomeType,
    outcomeId: string,
  ): Promise<readonly OutcomeSupport[]> {
    const rows = await this.prisma.outcomeSupport.findMany({
      where: { outcomeType, outcomeId },
      orderBy: { recordedAt: 'asc' },
    });
    return rows.map((row) => toDomainSupport(row));
  }

  async listViews(outcomeType: OutcomeType, outcomeId: string): Promise<OutcomeSupportView[]> {
    const rows = await this.prisma.outcomeSupport.findMany({
      where: { outcomeType, outcomeId },
      orderBy: { recordedAt: 'asc' },
      include: { evidence: true, recordedBy: true },
    });
    return rows.map((row) => toSupportView(row));
  }

  /** Support counts for a whole register, so a list view is one query not N. */
  async countsBySession(
    outcomeType: OutcomeType,
    sessionId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.outcomeSupport.findMany({
      where: { outcomeType, sessionId },
      select: { outcomeId: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.outcomeId, (counts.get(row.outcomeId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Attach a basis to an outcome. The outcome itself has already been
   * resolved and scoped by the caller — this method is never reachable with
   * an outcome the caller cannot see.
   */
  async record(
    scope: { organisationId: string; workspaceId: string; sessionId: string },
    outcomeType: OutcomeType,
    outcomeId: string,
    request: RecordOutcomeSupportRequest,
    principal: Principal,
  ): Promise<OutcomeSupportView> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = await (async () => {
      if (request.basis === 'institutional_synthesis') {
        return recordSynthesisSupport({
          id: toOutcomeSupportId(randomUUID()),
          sessionId: toCoDesignSessionId(scope.sessionId),
          outcomeType,
          outcomeId,
          scope: {
            organisationId: toOrganisationId(scope.organisationId),
            workspaceId: toWorkspaceId(scope.workspaceId),
          },
          rationale: request.rationale,
          recordedBy: actor,
          at: now,
        });
      }

      const evidence = await this.requireSupportableEvidence(
        scope.workspaceId,
        scope.sessionId,
        request.evidenceId,
      );

      return recordEvidenceSupport({
        id: toOutcomeSupportId(randomUUID()),
        sessionId: toCoDesignSessionId(scope.sessionId),
        outcomeType,
        outcomeId,
        scope: {
          organisationId: toOrganisationId(scope.organisationId),
          workspaceId: toWorkspaceId(scope.workspaceId),
        },
        evidence,
        note: request.note,
        recordedBy: actor,
        at: now,
      });
    })();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.outcomeSupport.create({
          data: {
            id: outcome.support.id,
            organisationId: outcome.support.organisationId,
            workspaceId: outcome.support.workspaceId,
            sessionId: outcome.support.sessionId,
            outcomeType: outcome.support.outcomeType,
            outcomeId: outcome.support.outcomeId,
            basis: outcome.support.basis,
            evidenceId: outcome.support.evidenceId,
            evidenceVersion: outcome.support.evidenceVersion,
            evidenceVerificationStatus: outcome.support.evidenceVerificationStatus,
            rationale: outcome.support.rationale,
            note: outcome.support.note,
            recordedById: outcome.support.recordedBy.id,
            recordedAt: outcome.support.recordedAt,
          },
        });
        await appendAuditEvent(tx, 'outcome_support', outcome.support.id, outcome.event, now);
      });
    } catch (error) {
      // The partial unique index on (outcome_type, outcome_id, evidence_id)
      // is the backstop for the same evidence being counted twice for one
      // outcome. Recognised structurally rather than by `instanceof
      // Prisma.PrismaClientKnownRequestError`, for the same reason
      // `EvidenceReviewService` does: the service tests run against an
      // in-memory double that never constructs a real Prisma error, and a
      // check the tests cannot exercise is a check nobody has verified.
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException({
          error: {
            code: 'SUPPORT_ALREADY_RECORDED',
            message: 'This evidence is already recorded as supporting this outcome.',
          },
        });
      }
      throw error;
    }

    const row = await this.prisma.outcomeSupport.findUniqueOrThrow({
      where: { id: outcome.support.id },
      include: { evidence: true, recordedBy: true },
    });
    return toSupportView(row);
  }

  /**
   * Detach a basis. `isAuthoritative` says whether the outcome has already
   * been confirmed/activated — if so, its last support may not be removed,
   * because that is precisely what its authority rested on.
   */
  async remove(
    scope: { workspaceId: string; sessionId: string },
    outcomeType: OutcomeType,
    outcomeId: string,
    supportId: string,
    isAuthoritative: boolean,
    principal: Principal,
  ): Promise<void> {
    const row = await this.prisma.outcomeSupport.findUnique({ where: { id: supportId } });

    if (
      row === null ||
      row.workspaceId !== scope.workspaceId ||
      row.sessionId !== scope.sessionId ||
      row.outcomeType !== outcomeType ||
      row.outcomeId !== outcomeId
    ) {
      throw new NotFoundException({
        error: {
          code: 'OUTCOME_SUPPORT_NOT_FOUND',
          message: `No support record '${supportId}' for this outcome.`,
        },
      });
    }

    if (isAuthoritative) {
      const remaining = await this.prisma.outcomeSupport.count({
        where: { outcomeType, outcomeId },
      });
      if (remaining <= 1) {
        throw new ConflictException({
          error: {
            code: 'OUTCOME_SUPPORT_REQUIRED',
            message:
              'This outcome is already authoritative, so its last remaining basis cannot be removed. Record another basis first, or reverse the outcome.',
          },
        });
      }
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const event = removeOutcomeSupport(toDomainSupport(row), actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.outcomeSupport.delete({ where: { id: supportId } });
      await appendAuditEvent(tx, 'outcome_support', supportId, event, now);
    });
  }

  /**
   * Resolve the evidence a caller wants to rely on, refusing anything
   * outside this session with `EVIDENCE_NOT_FOUND` — see the file header on
   * why an out-of-scope id must not be distinguishable from a missing one.
   *
   * Admissibility itself (validated, verified, same workspace and
   * organisation) is left to the domain: this returns the facts, it does not
   * duplicate the rule.
   */
  private async requireSupportableEvidence(
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
  ): Promise<SupportingEvidenceRef> {
    const row = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence '${evidenceId}' in session '${sessionId}'.`,
        },
      });
    }

    return {
      id: toEvidenceId(row.id),
      organisationId: toOrganisationId(row.organisationId),
      workspaceId: toWorkspaceId(row.workspaceId),
      sessionId: toCoDesignSessionId(row.sessionId),
      reviewStatus: row.reviewStatus as EvidenceReviewStatus,
      verificationStatus: row.verificationStatus as EvidenceVerificationStatus,
      version: row.version,
    };
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/**
 * `recordedBy` is reconstructed from the row's actor id alone. The only
 * callers of this function are the support *count* the outcome aggregates
 * gate on and the removal audit event, which carries the removing actor
 * rather than the recording one — neither reads the display name, and
 * joining the actor table on every gating read to populate a field nobody
 * looks at would be a query for nothing. `toSupportView` does join it, and
 * is the function the API surface uses.
 */
export function toDomainSupport(row: OutcomeSupportRow): OutcomeSupport {
  return {
    id: toOutcomeSupportId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    outcomeType: row.outcomeType as OutcomeType,
    outcomeId: row.outcomeId,
    basis: row.basis as OutcomeSupport['basis'],
    evidenceId: row.evidenceId === null ? null : toEvidenceId(row.evidenceId),
    evidenceVersion: row.evidenceVersion,
    evidenceVerificationStatus:
      row.evidenceVerificationStatus === null
        ? null
        : (row.evidenceVerificationStatus as EvidenceVerificationStatus),
    rationale: row.rationale,
    note: row.note,
    recordedBy: {
      id: toActorId(row.recordedById),
      kind: 'human',
      displayName: '',
    },
    recordedAt: row.recordedAt,
    createdAt: row.createdAt,
  };
}

export function toSupportView(row: OutcomeSupportRowWithEvidence): OutcomeSupportView {
  return {
    id: row.id,
    outcomeType: row.outcomeType as OutcomeType,
    outcomeId: row.outcomeId,
    basis: row.basis as OutcomeSupportView['basis'],
    evidenceId: row.evidenceId,
    evidenceVersion: row.evidenceVersion,
    evidenceVerificationStatus:
      row.evidenceVerificationStatus as OutcomeSupportView['evidenceVerificationStatus'],
    ...(row.evidence != null ? { evidenceTitle: row.evidence.title } : {}),
    rationale: row.rationale,
    note: row.note,
    recordedBy: {
      id: row.recordedById,
      kind: (row.recordedBy?.kind ?? 'human') as OutcomeSupportView['recordedBy']['kind'],
      displayName: row.recordedBy?.displayName ?? '',
    },
    recordedAt: row.recordedAt.toISOString(),
  };
}
