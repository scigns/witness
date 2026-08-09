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

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

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

    const supportId = toOutcomeSupportId(randomUUID());

    try {
      await this.prisma.$transaction(async (tx) => {
        // The evidence is resolved *inside* the write transaction. Reading it
        // beforehand would let a concurrent review action withdraw or reject
        // the same evidence between the read and the insert, freezing
        // `validated`/`verified` into a support record for evidence that was
        // no longer admissible when the row landed.
        const outcome =
          request.basis === 'institutional_synthesis'
            ? recordSynthesisSupport({
                id: supportId,
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
              })
            : recordEvidenceSupport({
                id: supportId,
                sessionId: toCoDesignSessionId(scope.sessionId),
                outcomeType,
                outcomeId,
                scope: {
                  organisationId: toOrganisationId(scope.organisationId),
                  workspaceId: toWorkspaceId(scope.workspaceId),
                },
                evidence: await requireSupportableEvidence(
                  tx,
                  scope.workspaceId,
                  scope.sessionId,
                  request.evidenceId,
                ),
                note: request.note,
                recordedBy: actor,
                at: now,
              });

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
      where: { id: supportId },
      include: { evidence: true, recordedBy: true },
    });
    return toSupportView(row);
  }

  /**
   * Detach a basis.
   *
   * Everything that decides whether this removal is allowed — the support row
   * itself, whether the outcome is already authoritative, and how many bases
   * would be left — is read inside the transaction that deletes, and the
   * outcome row is claimed by a compare-and-swap on its version first.
   *
   * The claim is what makes the count trustworthy. Without it, two concurrent
   * removals of *different* support records on a confirmed decision both read
   * `remaining === 2`, both pass the check, and both commit — leaving a
   * confirmed outcome resting on nothing, which is precisely the state this
   * milestone exists to make unreachable. With it, the second removal finds
   * the version moved and is rejected as a stale write, the same optimistic
   * concurrency every other write in this codebase uses.
   */
  async remove(
    scope: { workspaceId: string; sessionId: string },
    outcomeType: OutcomeType,
    outcomeId: string,
    supportId: string,
    principal: Principal,
  ): Promise<void> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const isAuthoritative = await claimOutcome(tx, outcomeType, outcomeId);

      const row = await tx.outcomeSupport.findUnique({ where: { id: supportId } });

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
        const remaining = await tx.outcomeSupport.count({ where: { outcomeType, outcomeId } });
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

      const event = removeOutcomeSupport(toDomainSupport(row), actor);
      await tx.outcomeSupport.delete({ where: { id: supportId } });
      await appendAuditEvent(tx, 'outcome_support', supportId, event, now);
    });
  }
}

/**
 * Resolve the evidence a caller wants to rely on, refusing anything outside
 * this session with `EVIDENCE_NOT_FOUND` — see the file header on why an
 * out-of-scope id must not be distinguishable from a missing one.
 *
 * Takes the transaction client, following `loadSupports` in
 * `outcomes.service.ts`, so the facts frozen into a support record are read in
 * the same transaction that writes it.
 *
 * Admissibility itself (validated, verified, same workspace and organisation)
 * is left to the domain: this returns the facts, it does not duplicate the
 * rule.
 */
async function requireSupportableEvidence(
  tx: PrismaTransaction,
  workspaceId: string,
  sessionId: string,
  evidenceId: string,
): Promise<SupportingEvidenceRef> {
  const row = await tx.evidence.findUnique({ where: { id: evidenceId } });

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

/**
 * Claim the outcome for the duration of this transaction and report whether it
 * is already authoritative, by bumping its optimistic-concurrency version.
 *
 * A version bump is the honest record of what happened — the outcome's set of
 * bases changed — and it is also the serialisation point: two concurrent
 * removals contend on the same conditional update, so the second is rejected
 * as stale rather than both proceeding on a count neither of them still holds.
 *
 * An action is never authoritative: it carries out a decision rather than
 * making a claim of its own, so nothing rests on its bases
 * (`packages/domain/src/action-item.ts`).
 */
async function claimOutcome(
  tx: PrismaTransaction,
  outcomeType: OutcomeType,
  outcomeId: string,
): Promise<boolean> {
  const claim = async (
    current: { status: string; version: number } | null,
    bump: (version: number) => Promise<{ count: number }>,
    authoritativeStatus: string | null,
  ): Promise<boolean> => {
    if (current === null) {
      throw new NotFoundException({
        error: {
          code: 'OUTCOME_NOT_FOUND',
          message: `No ${outcomeType} '${outcomeId}'.`,
        },
      });
    }

    const claimed = await bump(current.version);
    if (claimed.count === 0) {
      throw new ConflictException({
        error: {
          code: 'STALE_VERSION',
          message:
            'This outcome was changed by someone else while this removal was in flight. Reload and try again.',
        },
      });
    }

    return authoritativeStatus !== null && current.status === authoritativeStatus;
  };

  switch (outcomeType) {
    case 'decision':
      return claim(
        await tx.decision.findUnique({
          where: { id: outcomeId },
          select: { status: true, version: true },
        }),
        (version) =>
          tx.decision.updateMany({
            where: { id: outcomeId, version },
            data: { version: version + 1 },
          }),
        'confirmed',
      );
    case 'commitment':
      return claim(
        await tx.commitment.findUnique({
          where: { id: outcomeId },
          select: { status: true, version: true },
        }),
        (version) =>
          tx.commitment.updateMany({
            where: { id: outcomeId, version },
            data: { version: version + 1 },
          }),
        'active',
      );
    case 'action_item':
      return claim(
        await tx.actionItem.findUnique({
          where: { id: outcomeId },
          select: { status: true, version: true },
        }),
        (version) =>
          tx.actionItem.updateMany({
            where: { id: outcomeId, version },
            data: { version: version + 1 },
          }),
        null,
      );
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
