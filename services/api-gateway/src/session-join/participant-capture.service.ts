/**
 * Application layer for participant self-capture (Phase 5, Workstreams
 * 1.1-1.4) — the "record a contribution from your own phone, seconds after
 * scanning a QR code" flow.
 *
 * The authorisation model here is deliberately NOT Casbin/`AuthorizationGuard`:
 * a pseudonymous or anonymous joiner (`SessionJoinGovernanceMode`) has no
 * Witness `User` account and therefore no organisation- or workspace-scoped
 * role to resolve a tier from — Casbin tiers model *that* kind of standing,
 * not "this one participant, this one session." Instead, authority here
 * comes from possessing a `ParticipantCaptureToken`, minted once at join for
 * every governance mode uniformly (even `verified_guest`/`invited_only`
 * joiners get one, since holding a Witness account grants no session-scoped
 * capture authority on its own). This mirrors `SessionJoinLink`'s own
 * narrow-token-is-the-authority design, one layer further in.
 *
 * Every write below is a thin, security-relevant wrapper around an
 * *existing*, already-tested service (`EvidenceService.capture`,
 * `ParticipantConsentRecordsService.capture`) — never a reimplementation.
 * The wrapper's only job is to force every participant-identifying field
 * (`sourceParticipantId`, `attributionMode`, consent's own `participantId`)
 * from the resolved token, never from client input, so a forged request
 * body cannot make one participant act as another.
 */

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import type { EvidenceAttributionMode, ParticipantIdentityMode } from '@witness/domain';
import type {
  CaptureParticipantFeedbackRequest,
  CustomerStoryView,
  EvidenceAttachmentView,
  ParticipantCaptureConsentRequest,
  ParticipantCaptureContextView,
  ParticipantCaptureEvidenceRequest,
  ParticipantCaptureEvidenceResult,
  ProductFeedbackView,
  SubmitTestimonialConsentRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';
import type { Principal } from '../authz/authorization.port.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import {
  EvidenceAttachmentService,
  type UploadedAttachmentFile,
} from '../evidence/evidence-attachment.service.js';
import { ParticipantConsentRecordsService } from '../participant-consent-records/participant-consent-records.service.js';
import { ProductFeedbackService } from '../product-feedback/product-feedback.service.js';
import { CustomerStoriesService } from '../customer-stories/customer-stories.service.js';

/** Session-scoped, not tied to the join link's own (often much shorter) expiry. */
export const CAPTURE_TOKEN_TTL_HOURS = 24;

/**
 * Exported so `SessionJoinService.join()` can mint a token as part of its
 * own participant-creation transaction (atomicity: a participant must never
 * exist without a usable capture token, and vice versa) — `mint()` below
 * uses the same generator but through this service's own, separate
 * connection, for callers that don't already hold an open transaction.
 */
export function generateCaptureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function captureTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + CAPTURE_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

/** `named` -> `attributed` is the only mapping that can ever leak a real
 * identity; the other two are structurally incapable of it (domain-enforced
 * by `assertAttributionCompatibility`) — this function only chooses among
 * modes already compatible with the participant's own identityMode. */
function attributionModeFor(identityMode: ParticipantIdentityMode): EvidenceAttributionMode {
  switch (identityMode) {
    case 'named':
      return 'attributed';
    case 'pseudonymous':
      return 'pseudonymous';
    case 'anonymous':
      return 'anonymous';
  }
}

interface ResolvedToken {
  participantId: string;
  sessionId: string;
  workspaceId: string;
  organisationId: string;
  identityMode: ParticipantIdentityMode;
  displayName: string;
}

function participantPrincipal(participantId: string, displayName: string): Principal {
  return {
    subject: `participant_capture:${participantId}`,
    displayName,
    kind: 'human',
    roles: [],
  };
}

@Injectable()
export class ParticipantCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly participantConsent: ParticipantConsentRecordsService,
    private readonly attachments: EvidenceAttachmentService,
    private readonly productFeedback: ProductFeedbackService,
    private readonly customerStories: CustomerStoriesService,
  ) {}

  async mint(participantId: string, now: Date): Promise<string> {
    const token = generateCaptureToken();
    await this.prisma.participantCaptureToken.create({
      data: {
        id: randomUUID(),
        tokenHash: token.hash,
        participantId,
        expiresAt: captureTokenExpiry(now),
      },
    });
    return token.raw;
  }

  async context(rawToken: string): Promise<ParticipantCaptureContextView> {
    const resolved = await this.resolveToken(rawToken);

    const [session, configuration, participant] = await Promise.all([
      this.prisma.coDesignSession.findUniqueOrThrow({
        where: { id: resolved.sessionId },
        include: { primaryFacilitator: { select: { displayName: true } } },
      }),
      this.prisma.sessionConsentConfiguration.findUnique({
        where: { sessionId: resolved.sessionId },
      }),
      this.prisma.sessionParticipant.findUniqueOrThrow({ where: { id: resolved.participantId } }),
    ]);

    return {
      sessionId: session.id,
      sessionTitle: session.title,
      sessionStatus: session.status,
      facilitatorDisplayName: session.primaryFacilitator.displayName,
      participantId: participant.id,
      displayName: participant.displayName,
      identityMode: participant.identityMode as ParticipantIdentityMode,
      consentStatusSummary:
        participant.consentStatusSummary as ParticipantCaptureContextView['consentStatusSummary'],
      requiredConsentCategories: configuration?.requiredCategories ?? [],
    };
  }

  async captureEvidence(
    rawToken: string,
    request: ParticipantCaptureEvidenceRequest,
  ): Promise<ParticipantCaptureEvidenceResult> {
    const resolved = await this.resolveToken(rawToken);
    const principal = participantPrincipal(resolved.participantId, resolved.displayName);

    const detail = await this.evidence.capture(
      resolved.workspaceId,
      resolved.sessionId,
      {
        evidenceType: request.evidenceType,
        title: request.title,
        content: request.content,
        language: request.language,
        sessionOffsetSeconds: request.sessionOffsetSeconds,
        // Never client-supplied: this is the entire security property this
        // service exists to guarantee — a forged request body cannot make
        // one participant's token file evidence attributed to another.
        sourceParticipantId: resolved.participantId,
        attributionMode: attributionModeFor(resolved.identityMode),
        tags: request.tags,
        submitImmediately: true,
        clientRequestId: request.clientRequestId,
      },
      principal,
    );

    return { evidenceId: detail.id, reviewStatus: detail.reviewStatus };
  }

  /**
   * Attach the recorded audio (or a document/image) to evidence this same
   * token already created. `evidenceId` is caller-supplied — the security
   * property is verifying it actually belongs to the resolved participant
   * (`requireOwnEvidence`) before ever reaching `EvidenceAttachmentService`,
   * so a forged `evidenceId` cannot attach a file to someone else's evidence.
   */
  async uploadAttachment(
    rawToken: string,
    evidenceId: string,
    file: UploadedAttachmentFile | undefined,
  ): Promise<EvidenceAttachmentView> {
    const resolved = await this.resolveToken(rawToken);
    await this.requireOwnEvidence(resolved.participantId, evidenceId);
    const principal = participantPrincipal(resolved.participantId, resolved.displayName);

    return this.attachments.upload(
      resolved.workspaceId,
      resolved.sessionId,
      evidenceId,
      file,
      principal,
    );
  }

  async captureConsent(rawToken: string, request: ParticipantCaptureConsentRequest): Promise<void> {
    const resolved = await this.resolveToken(rawToken);
    const principal = participantPrincipal(resolved.participantId, resolved.displayName);

    await this.participantConsent.capture(
      resolved.workspaceId,
      resolved.sessionId,
      resolved.participantId,
      {
        categoryDecisions: request.categoryDecisions,
        captureMethod: 'participant_self_service',
      },
      principal,
    );
  }

  /**
   * A participant may only ever give feedback tagged
   * `participant_capture_success`, scoped to their own resolved session and
   * identity — never client-supplied, the same discipline `captureEvidence`
   * applies to `sourceParticipantId`.
   */
  async captureFeedback(
    rawToken: string,
    request: CaptureParticipantFeedbackRequest,
  ): Promise<ProductFeedbackView> {
    const resolved = await this.resolveToken(rawToken);
    const principal = participantPrincipal(resolved.participantId, resolved.displayName);

    return this.productFeedback.submitForParticipant(
      resolved.workspaceId,
      resolved.sessionId,
      resolved.participantId,
      { rating: request.rating, comment: request.comment ?? null },
      principal,
    );
  }

  /**
   * `feedbackId` is caller-supplied — `requireOwnFeedback` verifies it
   * actually belongs to the resolved participant before ever reaching
   * `CustomerStoriesService`, mirroring `requireOwnEvidence` above, so a
   * forged `feedbackId` cannot consent to a testimonial on someone else's
   * feedback.
   */
  async captureTestimonialConsent(
    rawToken: string,
    feedbackId: string,
    request: SubmitTestimonialConsentRequest,
  ): Promise<CustomerStoryView | null> {
    const resolved = await this.resolveToken(rawToken);
    await this.requireOwnFeedback(resolved.participantId, feedbackId);
    const principal = participantPrincipal(resolved.participantId, resolved.displayName);

    return this.customerStories.proposeFromFeedbackForParticipant(
      resolved.workspaceId,
      feedbackId,
      resolved.participantId,
      request,
      principal,
    );
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async requireOwnFeedback(participantId: string, feedbackId: string): Promise<void> {
    const row = await this.prisma.productFeedback.findUnique({
      where: { id: feedbackId },
      select: { sourceParticipantId: true },
    });
    if (row === null || row.sourceParticipantId !== participantId) {
      throw new NotFoundException({
        error: {
          code: 'FEEDBACK_NOT_FOUND',
          message: `No feedback '${feedbackId}' available to this capture token.`,
        },
      });
    }
  }

  private async requireOwnEvidence(participantId: string, evidenceId: string): Promise<void> {
    const row = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      select: { sourceParticipantId: true },
    });
    if (row === null || row.sourceParticipantId !== participantId) {
      throw new NotFoundException({
        error: {
          code: 'EVIDENCE_NOT_FOUND',
          message: `No evidence '${evidenceId}' available to this capture token.`,
        },
      });
    }
  }

  private async resolveToken(rawToken: string): Promise<ResolvedToken> {
    const tokenHash = sha256(rawToken);
    const row = await this.prisma.participantCaptureToken.findUnique({
      where: { tokenHash },
      include: { participant: true },
    });

    if (row === null) {
      throw new UnauthorizedException({
        error: { code: 'CAPTURE_TOKEN_INVALID', message: 'This capture link is invalid.' },
      });
    }
    if (row.revokedAt !== null) {
      throw new UnauthorizedException({
        error: { code: 'CAPTURE_TOKEN_REVOKED', message: 'This capture link is no longer active.' },
      });
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        error: { code: 'CAPTURE_TOKEN_EXPIRED', message: 'This capture link has expired.' },
      });
    }
    if (row.participant.withdrawnAt !== null) {
      throw new ForbiddenException({
        error: {
          code: 'PARTICIPANT_WITHDRAWN',
          message: 'This participant has withdrawn from the session.',
        },
      });
    }

    return {
      participantId: row.participant.id,
      sessionId: row.participant.sessionId,
      workspaceId: row.participant.workspaceId,
      organisationId: row.participant.organisationId,
      identityMode: row.participant.identityMode as ParticipantIdentityMode,
      displayName: row.participant.displayName,
    };
  }
}
