import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CustomerStory as CustomerStoryRow,
  ProductFeedback as ProductFeedbackRow,
} from '@prisma/client';

import {
  DomainError,
  approveCustomerStory,
  editCustomerStoryWording,
  proposeCustomerStory,
  publishCustomerStory,
  rejectCustomerStory,
  toActorId,
  toCustomerStoryId,
  toOrganisationId,
  toProductFeedbackId,
  toSessionParticipantId,
  toWorkspaceId,
  unpublishCustomerStory,
  withdrawCustomerStoryConsent,
  type CustomerStory as CustomerStoryDomain,
  type ProductFeedback as ProductFeedbackDomain,
} from '@witness/domain';
import type {
  CustomerStoryView,
  EditCustomerStoryWordingRequest,
  ModerateCustomerStoryRequest,
  PublishedStoryCard,
  SubmitTestimonialConsentRequest,
} from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const SESSION_SUBJECT_PREFIX = 'user:';

/**
 * `moderatedBy`/`submittedBy`'s `displayName` is left blank here — every
 * domain function that reads an `Actor` off a rehydrated row only ever
 * checks `isHuman` (the `kind` field), never the display name, so a full
 * join to fetch it would be plumbing with no behavioural effect. Views that
 * need a human-readable name (`CustomerStoryView.moderatedByName`) fetch it
 * separately, at the call site, rather than growing this rehydration path.
 */
function toDomain(row: CustomerStoryRow): CustomerStoryDomain {
  return {
    id: toCustomerStoryId(row.id),
    productFeedbackId: toProductFeedbackId(row.productFeedbackId),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    consentChoice: row.consentChoice as CustomerStoryDomain['consentChoice'],
    organisationAttributionConsent: row.organisationAttributionConsent,
    attributedName: row.attributedName,
    consentGivenAt: row.consentGivenAt,
    consentWithdrawnAt: row.consentWithdrawnAt,
    roleLabel: row.roleLabel,
    rawQuote: row.rawQuote,
    quote: row.quote,
    context: row.context,
    organisationLabel: row.organisationLabel,
    moderationStatus: row.moderationStatus as CustomerStoryDomain['moderationStatus'],
    moderationReason: row.moderationReason,
    moderatedBy:
      row.moderatedById === null
        ? null
        : { id: toActorId(row.moderatedById), kind: 'human', displayName: '' },
    moderatedAt: row.moderatedAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    version: row.version,
  };
}

function toFeedbackDomain(row: ProductFeedbackRow): ProductFeedbackDomain {
  return {
    id: toProductFeedbackId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: null,
    sourceParticipantId:
      row.sourceParticipantId === null ? null : toSessionParticipantId(row.sourceParticipantId),
    productArea: row.productArea as ProductFeedbackDomain['productArea'],
    moment: row.moment as ProductFeedbackDomain['moment'],
    rating: row.rating,
    comment: row.comment,
    submittedBy: { id: toActorId(row.submittedById), kind: 'human', displayName: '' },
    createdAt: row.createdAt,
  };
}

type CustomerStoryRowWithModerator = CustomerStoryRow & {
  moderatedBy?: { displayName: string } | null;
};

function toView(row: CustomerStoryRowWithModerator, canPublish: boolean): CustomerStoryView {
  return {
    id: row.id,
    productFeedbackId: row.productFeedbackId,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    consentChoice: row.consentChoice as CustomerStoryView['consentChoice'],
    organisationAttributionConsent: row.organisationAttributionConsent,
    attributedName: row.attributedName,
    consentGivenAt: row.consentGivenAt.toISOString(),
    consentWithdrawnAt: row.consentWithdrawnAt?.toISOString() ?? null,
    roleLabel: row.roleLabel,
    rawQuote: row.rawQuote,
    quote: row.quote,
    context: row.context,
    organisationLabel: row.organisationLabel,
    moderationStatus: row.moderationStatus as CustomerStoryView['moderationStatus'],
    moderationReason: row.moderationReason,
    moderatedByName: row.moderatedBy?.displayName ?? null,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    canPublish,
  };
}

function toPublishedCard(row: CustomerStoryRow): PublishedStoryCard {
  return {
    organisationLabel:
      row.organisationAttributionConsent && row.organisationLabel !== null
        ? row.organisationLabel
        : 'A Witness customer',
    quote: row.quote ?? '',
    context: row.context ?? '',
    role: row.roleLabel,
    ...(row.consentChoice === 'named' && row.attributedName !== null
      ? { attributedName: row.attributedName }
      : {}),
  };
}

function asDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw new BadRequestException({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

@Injectable()
export class CustomerStoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleResolution: RoleResolutionService,
    private readonly policyEngine: PolicyEngineService,
  ) {}

  /** Whether `principal` holds the platform-scope `customer_story:publish` capability. */
  private async canPublish(principal: Principal): Promise<boolean> {
    if (!principal.subject.startsWith(SESSION_SUBJECT_PREFIX)) return false;
    const userId = principal.subject.slice(SESSION_SUBJECT_PREFIX.length);
    const tiers = await this.roleResolution.platformGrantTiers(userId);
    for (const tier of tiers) {
      if (await this.policyEngine.grants(tier, 'customer_story:publish')) return true;
    }
    return false;
  }

  async listForWorkspace(workspaceId: string, principal: Principal): Promise<CustomerStoryView[]> {
    const [rows, canPublish] = await Promise.all([
      this.prisma.customerStory.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        include: { moderatedBy: { select: { displayName: true } } },
      }),
      this.canPublish(principal),
    ]);
    return rows.map((row) => toView(row, canPublish));
  }

  async listPublished(): Promise<PublishedStoryCard[]> {
    const rows = await this.prisma.customerStory.findMany({
      where: { moderationStatus: 'approved', publishedAt: { not: null }, consentWithdrawnAt: null },
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map(toPublishedCard);
  }

  async proposeFromFeedback(
    workspaceId: string,
    feedbackId: string,
    request: SubmitTestimonialConsentRequest,
    principal: Principal,
  ): Promise<CustomerStoryView | null> {
    return this.proposeInternal(workspaceId, feedbackId, request, null, principal);
  }

  async proposeFromFeedbackForParticipant(
    workspaceId: string,
    feedbackId: string,
    sourceParticipantId: string,
    request: SubmitTestimonialConsentRequest,
    principal: Principal,
  ): Promise<CustomerStoryView | null> {
    return this.proposeInternal(workspaceId, feedbackId, request, sourceParticipantId, principal);
  }

  private async proposeInternal(
    workspaceId: string,
    feedbackId: string,
    request: SubmitTestimonialConsentRequest,
    sourceParticipantId: string | null,
    principal: Principal,
  ): Promise<CustomerStoryView | null> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const feedbackRow = await tx.productFeedback.findFirst({
        where: { id: feedbackId, workspaceId },
      });
      if (feedbackRow === null) {
        throw new NotFoundException({
          error: { code: 'FEEDBACK_NOT_FOUND', message: 'Feedback not found.' },
        });
      }

      const actor = await resolveActor(tx as PrismaService, principal);
      // Ownership: only the person who submitted the feedback may consent to
      // a testimonial derived from it — participant flow checks
      // sourceParticipantId (the capture-token identity), authenticated flow
      // checks the resolved actor.
      const owns =
        sourceParticipantId !== null
          ? feedbackRow.sourceParticipantId === sourceParticipantId
          : feedbackRow.submittedById === actor.id;
      if (!owns) {
        throw new ForbiddenException({
          error: {
            code: 'TESTIMONIAL_CONSENT_NOT_OWNER',
            message: 'Only the person who gave this feedback may consent to a testimonial from it.',
          },
        });
      }

      const existing = await tx.customerStory.findUnique({
        where: { productFeedbackId: feedbackId },
      });
      if (existing !== null) {
        throw new BadRequestException({
          error: {
            code: 'TESTIMONIAL_CONSENT_ALREADY_RECORDED',
            message: 'A testimonial consent choice has already been recorded for this feedback.',
          },
        });
      }

      let outcome: ReturnType<typeof proposeCustomerStory>;
      try {
        outcome = proposeCustomerStory({
          id: toCustomerStoryId(randomUUID()),
          feedback: toFeedbackDomain(feedbackRow),
          consentChoice: request.consentChoice,
          organisationAttributionConsent: request.organisationAttributionConsent ?? false,
          attributedName: request.attributedName ?? null,
          at: now,
        });
      } catch (error) {
        asDomainError(error);
      }

      if (outcome === null) return null;
      const { story } = outcome;

      await tx.customerStory.create({
        data: {
          id: story.id,
          productFeedbackId: story.productFeedbackId,
          organisationId: story.organisationId,
          workspaceId: story.workspaceId,
          consentChoice: story.consentChoice,
          organisationAttributionConsent: story.organisationAttributionConsent,
          attributedName: story.attributedName,
          consentGivenAt: story.consentGivenAt,
          roleLabel: story.roleLabel,
          rawQuote: story.rawQuote,
          moderationStatus: story.moderationStatus,
          createdAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        {
          action: 'customer_story.proposed',
          actor,
          metadata: { productFeedbackId: story.productFeedbackId },
        },
        now,
      );

      const row = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(row, false);
    });
  }

  private async loadOwnStory(
    tx: PrismaService,
    workspaceId: string,
    storyId: string,
  ): Promise<CustomerStoryRow> {
    const row = await tx.customerStory.findFirst({ where: { id: storyId, workspaceId } });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_STORY_NOT_FOUND', message: 'Customer story not found.' },
      });
    }
    return row;
  }

  async editWording(
    workspaceId: string,
    storyId: string,
    request: EditCustomerStoryWordingRequest,
    principal: Principal,
  ): Promise<CustomerStoryView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadOwnStory(tx as PrismaService, workspaceId, storyId);
      const actor = await resolveActor(tx as PrismaService, principal);

      let outcome: ReturnType<typeof editCustomerStoryWording>;
      try {
        outcome = editCustomerStoryWording(
          toDomain(row),
          actor,
          {
            quote: request.quote,
            context: request.context,
            organisationLabel: request.organisationLabel ?? null,
          },
          now,
        );
      } catch (error) {
        asDomainError(error);
      }
      const { story } = outcome;

      await tx.customerStory.update({
        where: { id: story.id },
        data: {
          quote: story.quote,
          context: story.context,
          organisationLabel: story.organisationLabel,
          version: story.version,
        },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        { action: 'customer_story.wording_edited', actor, metadata: { storyId: story.id } },
        now,
      );

      const updated = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(updated, await this.canPublish(principal));
    });
  }

  async moderate(
    workspaceId: string,
    storyId: string,
    request: ModerateCustomerStoryRequest,
    principal: Principal,
  ): Promise<CustomerStoryView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadOwnStory(tx as PrismaService, workspaceId, storyId);
      const actor = await resolveActor(tx as PrismaService, principal);

      let outcome: ReturnType<typeof approveCustomerStory> | ReturnType<typeof rejectCustomerStory>;
      try {
        outcome =
          request.decision === 'approve'
            ? approveCustomerStory(toDomain(row), actor, now)
            : rejectCustomerStory(toDomain(row), actor, request.reason, now);
      } catch (error) {
        asDomainError(error);
      }
      const { story } = outcome;

      await tx.customerStory.update({
        where: { id: story.id },
        data: {
          moderationStatus: story.moderationStatus,
          moderationReason: story.moderationReason,
          moderatedById: actor.id,
          moderatedAt: story.moderatedAt,
          version: story.version,
        },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        {
          action:
            request.decision === 'approve' ? 'customer_story.approved' : 'customer_story.rejected',
          actor,
          metadata: { storyId: story.id },
        },
        now,
      );

      const updated = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(updated, await this.canPublish(principal));
    });
  }

  async publish(
    workspaceId: string,
    storyId: string,
    principal: Principal,
  ): Promise<CustomerStoryView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadOwnStory(tx as PrismaService, workspaceId, storyId);
      const actor = await resolveActor(tx as PrismaService, principal);

      let outcome: ReturnType<typeof publishCustomerStory>;
      try {
        outcome = publishCustomerStory(toDomain(row), actor, now);
      } catch (error) {
        asDomainError(error);
      }
      const { story } = outcome;

      await tx.customerStory.update({
        where: { id: story.id },
        data: { publishedAt: story.publishedAt, version: story.version },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        { action: 'customer_story.published', actor, metadata: { storyId: story.id } },
        now,
      );

      const updated = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(updated, true);
    });
  }

  async unpublish(
    workspaceId: string,
    storyId: string,
    principal: Principal,
  ): Promise<CustomerStoryView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadOwnStory(tx as PrismaService, workspaceId, storyId);
      const actor = await resolveActor(tx as PrismaService, principal);

      let outcome: ReturnType<typeof unpublishCustomerStory>;
      try {
        outcome = unpublishCustomerStory(toDomain(row), actor, now);
      } catch (error) {
        asDomainError(error);
      }
      const { story } = outcome;

      await tx.customerStory.update({
        where: { id: story.id },
        data: { publishedAt: story.publishedAt, version: story.version },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        { action: 'customer_story.unpublished', actor, metadata: { storyId: story.id } },
        now,
      );

      const updated = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(updated, true);
    });
  }

  async withdrawConsent(
    workspaceId: string,
    storyId: string,
    principal: Principal,
  ): Promise<CustomerStoryView> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadOwnStory(tx as PrismaService, workspaceId, storyId);
      const actor = await resolveActor(tx as PrismaService, principal);

      let outcome: ReturnType<typeof withdrawCustomerStoryConsent>;
      try {
        outcome = withdrawCustomerStoryConsent(toDomain(row), actor, now);
      } catch (error) {
        asDomainError(error);
      }
      const { story } = outcome;

      await tx.customerStory.update({
        where: { id: story.id },
        data: { consentWithdrawnAt: story.consentWithdrawnAt, version: story.version },
      });
      await appendAuditEvent(
        tx,
        'customer_story',
        story.id,
        { action: 'customer_story.consent_withdrawn', actor, metadata: { storyId: story.id } },
        now,
      );

      const updated = await tx.customerStory.findUniqueOrThrow({
        where: { id: story.id },
        include: { moderatedBy: { select: { displayName: true } } },
      });
      return toView(updated, await this.canPublish(principal));
    });
  }
}
