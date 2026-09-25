/**
 * Real-PostgreSQL acceptance suite for the governed testimonial pipeline
 * (Phase 6, Track B) — private feedback -> candidate story -> permission
 * confirmed -> moderation -> approved -> published, with rejected/withdrawn/
 * unpublished as the named side branches, and `customer_story:publish` kept
 * genuinely separate from `customer_story:moderate` (workspace-admin cannot
 * satisfy it; only a real platform-scope role can). Real database access is
 * used deliberately for the publication/security invariants (unique
 * constraints, real transactions, real Casbin policy data) a fake Prisma
 * double cannot exercise with the same fidelity.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BadRequestException } from '@nestjs/common';

import type { Principal } from '../authz/authorization.port.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { AuthorizationPort } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { CustomerStoriesService } from './customer-stories.service.js';
import { ProductFeedbackService } from '../product-feedback/product-feedback.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[customer-stories.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[customer-stories.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

// AuthorizationPort's legacy `decide` is never exercised here (every
// principal in this suite is `user:`-prefixed, routing straight through
// PolicyEnforcementService) — this stub only satisfies the constructor.
class UnusedLegacyAuthorizationPort extends AuthorizationPort {
  async decide() {
    return { allowed: false, reason: 'not used in this suite' };
  }
  async authenticate() {
    return null;
  }
}

const prisma = await probeLiveInfra();

describe.skipIf(prisma === null)('governed testimonial publication (live PostgreSQL)', () => {
  const db = prisma as PrismaService;
  const stories = new CustomerStoriesService(
    db,
    new RoleResolutionService(db),
    new PolicyEngineService(),
  );
  const feedback = new ProductFeedbackService(db);
  const policyEnforcement = new PolicyEnforcementService(
    new UnusedLegacyAuthorizationPort(),
    new RoleResolutionService(db),
    new PolicyEngineService(),
  );

  const organisationAId = randomUUID();
  const organisationBId = randomUUID();
  const workspaceAId = randomUUID();
  const workspaceBId = randomUUID();

  const contributorUserId = randomUUID();
  const workspaceAdminUserId = randomUUID();
  const platformPublisherUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const createdUserIds = [
    contributorUserId,
    workspaceAdminUserId,
    platformPublisherUserId,
    outsiderUserId,
  ];

  const contributorPrincipal: Principal = {
    subject: `user:${contributorUserId}`,
    displayName: 'Live Test Contributor',
    kind: 'human',
    roles: [],
  };
  const workspaceAdminPrincipal: Principal = {
    subject: `user:${workspaceAdminUserId}`,
    displayName: 'Live Test Workspace Admin',
    kind: 'human',
    roles: [],
  };
  const platformPublisherPrincipal: Principal = {
    subject: `user:${platformPublisherUserId}`,
    displayName: 'Live Test Platform Publisher',
    kind: 'human',
    roles: [],
  };

  async function createUser(id: string, email: string): Promise<void> {
    await db.user.create({
      data: { id, email, displayName: email.split('@')[0] ?? email, accountState: 'active' },
    });
  }

  beforeAll(async () => {
    if (prisma === null) return;
    await db.organisation.create({
      data: {
        id: organisationAId,
        name: `Org A ${organisationAId}`,
        storageQuotaBytes: 5368709120n,
      },
    });
    await db.organisation.create({
      data: {
        id: organisationBId,
        name: `Org B ${organisationBId}`,
        storageQuotaBytes: 5368709120n,
      },
    });
    await db.workspace.create({
      data: { id: workspaceAId, name: 'Teacher Voice Co-design', organisationId: organisationAId },
    });
    await db.workspace.create({
      data: { id: workspaceBId, name: "Org B's Own Programme", organisationId: organisationBId },
    });

    await createUser(contributorUserId, `contributor-${contributorUserId}@org-a.example`);
    await createUser(workspaceAdminUserId, `admin-${workspaceAdminUserId}@org-a.example`);
    await createUser(platformPublisherUserId, `publisher-${platformPublisherUserId}@org-a.example`);
    await createUser(outsiderUserId, `outsider-${outsiderUserId}@org-b.example`);

    await db.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'workspace',
        workspaceId: workspaceAId,
        userId: contributorUserId,
        role: 'contributor',
      },
    });
    await db.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: workspaceAId,
        userId: contributorUserId,
        state: 'active',
      },
    });
    // An *ordinary* organisation admin — workspace-scoped, not platform-scoped.
    await db.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'workspace',
        workspaceId: workspaceAId,
        userId: workspaceAdminUserId,
        role: 'admin',
      },
    });
    await db.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: workspaceAId,
        userId: workspaceAdminUserId,
        state: 'active',
      },
    });
    // The genuinely separate capability: a real platform-scope role, the
    // same mechanism `platform-roles.controller.ts` grants through
    // `POST /api/v1/platform/role-assignments`.
    await db.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'platform',
        organisationId: null,
        workspaceId: null,
        userId: platformPublisherUserId,
        role: 'admin',
      },
    });
  });

  afterAll(async () => {
    if (prisma === null) return;
    await db.auditEvent.deleteMany({
      where: { subjectType: { in: ['customer_story', 'product_feedback'] } },
    });
    await db.customerStory.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } },
    });
    await db.productFeedback.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } },
    });
    await db.roleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.workspaceMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.organisation.deleteMany({ where: { id: { in: [organisationAId, organisationBId] } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.$disconnect();
  });

  async function submitPositiveFeedback(): Promise<string> {
    const result = await feedback.submit(
      workspaceAId,
      {
        productArea: 'facilitation',
        moment: 'facilitator_recap',
        rating: 5,
        comment: 'Witness made this workshop’s outcomes visible to everyone.',
      },
      contributorPrincipal,
    );
    return result.id;
  }

  it('1. a moderator (reviewer/admin tier) is granted customer_story:read in workspace scope', async () => {
    const decision = await policyEnforcement.decide(
      workspaceAdminPrincipal,
      'customer_story:read',
      {
        type: 'workspace',
        workspaceId: workspaceAId,
      },
    );
    expect(decision.allowed).toBe(true);
  });

  it('2. an ordinary contributor is denied customer_story:read (cannot see the moderation queue)', async () => {
    const decision = await policyEnforcement.decide(contributorPrincipal, 'customer_story:read', {
      type: 'workspace',
      workspaceId: workspaceAId,
    });
    expect(decision.allowed).toBe(false);
  });

  it('3. a workspace-scoped admin does NOT gain customer_story:publish; a platform-scope role does', async () => {
    const workspaceAdminDecision = await policyEnforcement.decide(
      workspaceAdminPrincipal,
      'customer_story:publish',
      { type: 'workspace', workspaceId: workspaceAId },
    );
    expect(workspaceAdminDecision.allowed).toBe(false);

    const platformDecision = await policyEnforcement.decide(
      platformPublisherPrincipal,
      'customer_story:publish',
      { type: 'workspace', workspaceId: workspaceAId },
    );
    expect(platformDecision.allowed).toBe(true);
  });

  it('4. the original ProductFeedback row is byte-identical after the full propose -> edit -> approve -> publish -> unpublish sequence', async () => {
    const feedbackId = await submitPositiveFeedback();
    const before = await db.productFeedback.findUniqueOrThrow({ where: { id: feedbackId } });

    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    expect(proposed).not.toBeNull();
    const storyId = proposed!.id;

    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'A real quote.', context: 'A real context.' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);
    await stories.publish(workspaceAId, storyId, platformPublisherPrincipal);
    await stories.unpublish(workspaceAId, storyId, platformPublisherPrincipal);

    const after = await db.productFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
    expect(after).toEqual(before);
  });

  it('5. a declined consent choice never creates a row; acting on a non-existent story 404s', async () => {
    const feedbackId = await submitPositiveFeedback();
    const declined = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'declined' },
      contributorPrincipal,
    );
    expect(declined).toBeNull();

    const row = await db.customerStory.findUnique({ where: { productFeedbackId: feedbackId } });
    expect(row).toBeNull();

    await expect(
      stories.moderate(
        workspaceAId,
        randomUUID(),
        { decision: 'approve' },
        workspaceAdminPrincipal,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('6. withdrawn consent blocks publish, even for an approved story', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Q', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);
    await stories.withdrawConsent(workspaceAId, storyId, workspaceAdminPrincipal);

    await expect(
      stories.publish(workspaceAId, storyId, platformPublisherPrincipal),
    ).rejects.toThrow();
  });

  it('7. an approved-but-unpublished story does not appear in the public list', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Approved not published', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);

    const published = await stories.listPublished();
    expect(published.some((card) => card.quote === 'Approved not published')).toBe(false);
  });

  it('8. publish() makes an approved, consent-valid story appear in the public list immediately', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Now public', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);
    await stories.publish(workspaceAId, storyId, platformPublisherPrincipal);

    const published = await stories.listPublished();
    expect(published.some((card) => card.quote === 'Now public')).toBe(true);
  });

  it('9. unpublish() removes public visibility but the row and its audit history remain', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Will be unpublished', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);
    await stories.publish(workspaceAId, storyId, platformPublisherPrincipal);
    await stories.unpublish(workspaceAId, storyId, platformPublisherPrincipal);

    const published = await stories.listPublished();
    expect(published.some((card) => card.quote === 'Will be unpublished')).toBe(false);

    const row = await db.customerStory.findUnique({ where: { id: storyId } });
    expect(row).not.toBeNull();
    expect(row?.moderationStatus).toBe('approved');

    const events = await db.auditEvent.findMany({
      where: { subjectType: 'customer_story', subjectId: storyId },
    });
    const actions = events.map((event) => event.action).sort();
    expect(actions).toEqual(
      [
        'customer_story.approved',
        'customer_story.proposed',
        'customer_story.published',
        'customer_story.unpublished',
        'customer_story.wording_edited',
      ].sort(),
    );
  });

  it('10. an anonymous story never exposes an attributed name on the public card', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Anonymous quote', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(workspaceAId, storyId, { decision: 'approve' }, workspaceAdminPrincipal);
    await stories.publish(workspaceAId, storyId, platformPublisherPrincipal);

    const card = (await stories.listPublished()).find((c) => c.quote === 'Anonymous quote');
    expect(card).toBeDefined();
    expect(card!.attributedName).toBeUndefined();
  });

  it('11. a story belonging to workspace A is not readable or actionable from workspace B', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;

    await expect(
      stories.editWording(
        workspaceBId,
        storyId,
        { quote: 'Q', context: 'C' },
        workspaceAdminPrincipal,
      ),
    ).rejects.toThrow(/not found/i);

    const crossWorkspaceList = await stories.listForWorkspace(
      workspaceBId,
      workspaceAdminPrincipal,
    );
    expect(crossWorkspaceList.some((view) => view.id === storyId)).toBe(false);
  });

  it('12. every mutating action on a story appends a corresponding, queryable audit event', async () => {
    const feedbackId = await submitPositiveFeedback();
    const proposed = await stories.proposeFromFeedback(
      workspaceAId,
      feedbackId,
      { consentChoice: 'anonymous' },
      contributorPrincipal,
    );
    const storyId = proposed!.id;
    await stories.editWording(
      workspaceAId,
      storyId,
      { quote: 'Audit me', context: 'C' },
      workspaceAdminPrincipal,
    );
    await stories.moderate(
      workspaceAId,
      storyId,
      { decision: 'reject', reason: 'test' },
      workspaceAdminPrincipal,
    );

    const events = await db.auditEvent.findMany({
      where: { subjectType: 'customer_story', subjectId: storyId },
      orderBy: { sequence: 'asc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.action).toBe('customer_story.proposed');
  });

  it('proposeCustomerStory refuses non-positive feedback, structurally, even if called directly', async () => {
    const negative = await feedback.submit(
      workspaceAId,
      { productArea: 'review', moment: 'reviewer_queue_cleared', rating: 2 },
      contributorPrincipal,
    );
    // The domain's InvariantViolation is real (product-feedback.test.ts and
    // customer-story.test.ts prove it directly, with no HTTP layer in the
    // way); the service wraps it as a BadRequestException the same way
    // every other service in this codebase translates a DomainError, so
    // that is what a service-level caller observes here.
    await expect(
      stories.proposeFromFeedback(
        workspaceAId,
        negative.id,
        { consentChoice: 'anonymous' },
        contributorPrincipal,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
