/**
 * Real-PostgreSQL suite for facilitator curation of "what we're hearing" and
 * the participant-safe read/response path (Phase 6, Track E — "close the
 * co-design loop"). Real database access is deliberate for the same reason
 * as the other live suites in this service: the unique "one active feature
 * per (session, assertion)" behaviour, the workspace/session boundary
 * checks, and the governed shape of the participant-facing view are exactly
 * the things a fake Prisma double would let slip through unnoticed.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BadRequestException, ConflictException } from '@nestjs/common';

import type { Principal } from '../authz/authorization.port.js';
import { AuthorizationPort } from '../authz/authorization.port.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { SessionJoinService } from '../session-join/session-join.service.js';
import { SessionFeaturedInsightsService } from './session-featured-insights.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[session-featured-insights.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[session-featured-insights.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

// AuthorizationPort's legacy `decide` is never exercised here (every
// principal in this suite is `user:`-prefixed, routing straight through
// PolicyEnforcementService) — this stub only satisfies the constructor,
// same convention as customer-stories.live.test.ts.
class UnusedLegacyAuthorizationPort extends AuthorizationPort {
  async decide() {
    return { allowed: false, reason: 'not used in this suite' };
  }
  async authenticate() {
    return null;
  }
}

function fakeHttpRequest(): {
  headers: Record<string, string>;
  socket: { remoteAddress?: string };
} {
  return { headers: {}, socket: { remoteAddress: '203.0.113.9' } };
}

const prisma = await probeLiveInfra();

describe.skipIf(prisma === null)(
  'live workshop featured insights & participant responses (live PostgreSQL) — Phase 6, Track E',
  () => {
    const db = prisma as PrismaService;
    const policyEngine = new PolicyEngineService();
    const policyEnforcement = new PolicyEnforcementService(
      new UnusedLegacyAuthorizationPort(),
      new RoleResolutionService(db),
      policyEngine,
    );
    const insights = new SessionFeaturedInsightsService(db);
    const joinService = new SessionJoinService(db, new SessionService(db));

    const organisationId = randomUUID();
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const facilitatorUserId = randomUUID();
    const contributorUserId = randomUUID();
    const createdUserIds = [facilitatorUserId, contributorUserId];
    const createdProvenanceChainIds: string[] = [];

    const FACILITATOR: Principal = {
      subject: `user:${facilitatorUserId}`,
      displayName: 'Live Test Facilitator',
      kind: 'human',
      roles: [],
    };
    const CONTRIBUTOR: Principal = {
      subject: `user:${contributorUserId}`,
      displayName: 'Live Test Contributor',
      kind: 'human',
      roles: [],
    };

    async function createOpenSession(inWorkspaceId: string): Promise<string> {
      const sessionId = randomUUID();
      await db.coDesignSession.create({
        data: {
          id: sessionId,
          organisationId,
          workspaceId: inWorkspaceId,
          title: 'Bore Maintenance Programme — live workshop',
          purpose: 'Prove the featured-insight and participant-response paths end to end.',
          sessionType: 'co_design_workshop',
          deliveryMode: 'in_person',
          primaryFacilitatorId: facilitatorUserId,
          status: 'draft',
          participantVisibility: 'facilitators_only',
        },
      });
      await db.coDesignSession.update({ where: { id: sessionId }, data: { status: 'open' } });
      return sessionId;
    }

    async function createCurrentAgendaItem(
      inWorkspaceId: string,
      sessionId: string,
    ): Promise<string> {
      const id = randomUUID();
      await db.agendaItem.create({
        data: {
          id,
          workspaceId: inWorkspaceId,
          sessionId,
          title: 'What are we experiencing?',
          promptText: 'Tell us what you have noticed since the last visit.',
          facilitatorId: facilitatorUserId,
          status: 'current',
          sortOrder: 1,
        },
      });
      return id;
    }

    async function joinAnonymously(
      sessionId: string,
    ): Promise<{ participantId: string; captureToken: string }> {
      const link = await joinService.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );
      const result = await joinService.join(
        link.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest() as never,
      );
      return { participantId: result.participantId, captureToken: result.captureToken };
    }

    /**
     * Creates a confirmed (post-human-confirmation) `KnowledgeAssertion` with
     * the minimal real provenance chain and entity/attribute it requires —
     * `sourceEvidenceIds` has a non-empty CHECK constraint, so a real
     * `Evidence` row is created first, same as production data would have.
     */
    async function createConfirmedAssertion(
      inWorkspaceId: string,
      sessionId: string,
      options: { lifecycleState?: string; perspectiveTags?: string[] } = {},
    ): Promise<{ assertionId: string; evidenceId: string }> {
      const facilitatorActor = await resolveActor(db, FACILITATOR);

      const evidenceId = randomUUID();
      await db.evidence.create({
        data: {
          id: evidenceId,
          organisationId,
          workspaceId: inWorkspaceId,
          sessionId,
          evidenceType: 'audio_note',
          title: 'Water access delays reported',
          content: 'Multiple households reported delays accessing the bore this week.',
          capturedAt: new Date(),
          attributionMode: 'facilitator_observation',
          identityVisibility: 'visible_to_all_participants',
        },
      });

      const provenanceChainId = randomUUID();
      createdProvenanceChainIds.push(provenanceChainId);
      await db.knowledgeProvenanceChain.create({
        data: {
          id: provenanceChainId,
          sourceEvidenceIds: [evidenceId],
          extractionMethod: 'human_manual',
          consentBasis: ['evidence_submission'],
          confirmedByActorId: facilitatorActor.id,
          confirmedAt: new Date(),
        },
      });

      const entityId = randomUUID();
      await db.knowledgeEntity.create({
        data: {
          id: entityId,
          organisationId,
          workspaceId: inWorkspaceId,
          entityType: 'topic',
          topicScheme: 'theme',
          canonicalLabel: 'Water access delays',
          ontologyVersion: '0.1.0',
          createdById: facilitatorActor.id,
        },
      });

      const assertionId = randomUUID();
      await db.knowledgeAssertion.create({
        data: {
          id: assertionId,
          organisationId,
          workspaceId: inWorkspaceId,
          assertionType: 'attribute',
          provenanceChainId,
          confidence: 0.9,
          lifecycleState: options.lifecycleState ?? 'approved',
          perspectiveTags: options.perspectiveTags ?? [],
          validFrom: new Date(),
          createdById: facilitatorActor.id,
        },
      });

      await db.knowledgeEntityAttribute.create({
        data: {
          id: randomUUID(),
          entityId,
          attributeKey: 'reported_frequency',
          attributeValue: 'weekly',
          assertionId,
          validFrom: new Date(),
          createdById: facilitatorActor.id,
        },
      });

      return { assertionId, evidenceId };
    }

    beforeAll(async () => {
      if (prisma === null) return;
      await policyEngine.onModuleInit();
      await db.organisation.create({
        data: {
          id: organisationId,
          name: `Live Insights Org ${organisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: 'Bore Maintenance Programme', organisationId },
      });
      await db.workspace.create({
        data: { id: otherWorkspaceId, name: 'A Different Programme', organisationId },
      });
      await db.user.create({
        data: {
          id: facilitatorUserId,
          email: `facilitator-${facilitatorUserId}@live-insights.example`,
          displayName: 'Live Test Facilitator',
          accountState: 'active',
        },
      });
      await db.user.create({
        data: {
          id: contributorUserId,
          email: `contributor-${contributorUserId}@live-insights.example`,
          displayName: 'Live Test Contributor',
          accountState: 'active',
        },
      });
      await db.roleAssignment.create({
        data: {
          id: randomUUID(),
          scopeType: 'workspace',
          workspaceId,
          userId: facilitatorUserId,
          role: 'admin',
        },
      });
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId: facilitatorUserId, state: 'active' },
      });
      await db.roleAssignment.create({
        data: {
          id: randomUUID(),
          scopeType: 'workspace',
          workspaceId,
          userId: contributorUserId,
          role: 'contributor',
        },
      });
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId: contributorUserId, state: 'active' },
      });
    });

    afterAll(async () => {
      if (prisma === null) return;
      const workspaceIds = [workspaceId, otherWorkspaceId];
      await db.auditEvent.deleteMany({
        where: {
          subjectType: { in: ['session_featured_insight', 'participant_knowledge_response'] },
        },
      });
      await db.participantKnowledgeResponse.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await db.sessionFeaturedInsight.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.knowledgeEntityAttribute.deleteMany({
        where: { entity: { workspaceId: { in: workspaceIds } } },
      });
      await db.knowledgeAssertion.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.knowledgeEntity.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.knowledgeProvenanceChain.deleteMany({
        where: { id: { in: createdProvenanceChainIds } },
      });
      await db.evidence.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.agendaItem.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.sessionJoinAttempt.deleteMany({
        where: { joinLink: { workspaceId: { in: workspaceIds } } },
      });
      await db.sessionJoinLink.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.sessionParticipant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.coDesignSession.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.roleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.workspaceMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      await db.organisation.deleteMany({ where: { id: organisationId } });
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await db.$disconnect();
    });

    it('1. a facilitator can curate (feature) a confirmed assertion for a session', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);

      const view = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );

      expect(view.knowledgeAssertionId).toBe(assertionId);
      expect(view.statement).toContain('Water access delays');
      expect(view.badge).toBe('community_validated');
      expect(view.responseTally).toEqual({
        reflects: 0,
        needs_nuance: 0,
        missing_context: 0,
        sees_differently: 0,
      });

      const row = await db.sessionFeaturedInsight.findUniqueOrThrow({ where: { id: view.id } });
      expect(row.removedAt).toBeNull();
      expect(row.sessionId).toBe(sessionId);
    });

    it('2. a facilitator can remove (unfeature) a previously curated insight, and it drops off the active list', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      const view = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );

      await insights.remove(workspaceId, sessionId, view.id, FACILITATOR);

      const active = await insights.listForWorkspace(workspaceId, sessionId);
      expect(active.some((item) => item.id === view.id)).toBe(false);

      const row = await db.sessionFeaturedInsight.findUniqueOrThrow({ where: { id: view.id } });
      expect(row.removedAt).not.toBeNull();

      // Retained, not deleted — the fact this was once shown to the room is
      // part of the session's record.
      await expect(insights.remove(workspaceId, sessionId, view.id, FACILITATOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('3. session/workspace boundaries are enforced: a cross-workspace assertion or session is rejected', async () => {
      const sessionInA = await createOpenSession(workspaceId);
      const sessionInB = await createOpenSession(otherWorkspaceId);
      const { assertionId: assertionInA } = await createConfirmedAssertion(workspaceId, sessionInA);

      // Assertion belongs to workspace A; curating it against workspace B's
      // own session must 404, not silently succeed cross-tenant.
      await expect(
        insights.curate(
          otherWorkspaceId,
          sessionInB,
          { knowledgeAssertionId: assertionInA },
          FACILITATOR,
        ),
      ).rejects.toThrow(/not found/i);

      // A session id that does not belong to the given workspace 404s too.
      await expect(insights.listForWorkspace(otherWorkspaceId, sessionInA)).rejects.toThrow(
        /not found/i,
      );
    });

    it('4. a rejected or superseded assertion cannot be featured, even though it is confirmed', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId, {
        lifecycleState: 'rejected',
      });

      await expect(
        insights.curate(workspaceId, sessionId, { knowledgeAssertionId: assertionId }, FACILITATOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. the same assertion cannot be featured twice while its first feature is still active', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );

      await expect(
        insights.curate(workspaceId, sessionId, { knowledgeAssertionId: assertionId }, FACILITATOR),
      ).rejects.toThrow();
    });

    it('6. the participant-safe view exposes only statement/badge/tally — never a curator or facilitator identity', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      const curated = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );
      const { participantId } = await joinAnonymously(sessionId);

      const participantView = await insights.listForParticipant(sessionId, participantId);
      expect(participantView).toHaveLength(1);
      const item = participantView[0]!;

      expect(Object.keys(item).sort()).toEqual(
        [
          'badge',
          'displayOrder',
          'id',
          'knowledgeAssertionId',
          'myResponseType',
          'responseTally',
          'statement',
        ].sort(),
      );
      expect(item.id).toBe(curated.id);
      expect(item.myResponseType).toBeNull();
      // No curatedBy/facilitator identity anywhere in the participant payload.
      expect(JSON.stringify(item)).not.toContain(facilitatorUserId);
    });

    it('7. a participant response is persisted through the governed path and never mutates the canonical assertion', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      const curated = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );
      const { participantId } = await joinAnonymously(sessionId);
      const participantPrincipal: Principal = {
        subject: `participant_capture:${participantId}`,
        displayName: 'Anonymous participant',
        kind: 'human',
        roles: [],
      };

      const before = await db.knowledgeAssertion.findUniqueOrThrow({ where: { id: assertionId } });

      await insights.submitResponse(
        sessionId,
        curated.id,
        participantId,
        { responseType: 'reflects', comment: 'This matches what I heard too.' },
        participantPrincipal,
      );

      const responseRow = await db.participantKnowledgeResponse.findFirstOrThrow({
        where: { sessionId, knowledgeAssertionId: assertionId },
      });
      expect(responseRow.sourceParticipantId).toBe(participantId);
      expect(responseRow.responseType).toBe('reflects');

      const after = await db.knowledgeAssertion.findUniqueOrThrow({ where: { id: assertionId } });
      expect(after).toEqual(before);

      const updatedView = (await insights.listForParticipant(sessionId, participantId))[0]!;
      expect(updatedView.myResponseType).toBe('reflects');
      expect(updatedView.responseTally.reflects).toBe(1);
    });

    it('8. an invalid response type is rejected by the domain invariant, not silently accepted', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      const curated = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );
      const { participantId } = await joinAnonymously(sessionId);
      const participantPrincipal: Principal = {
        subject: `participant_capture:${participantId}`,
        displayName: 'Anonymous participant',
        kind: 'human',
        roles: [],
      };

      await expect(
        insights.submitResponse(
          sessionId,
          curated.id,
          participantId,
          { responseType: 'not_a_real_type' as never },
          participantPrincipal,
        ),
      ).rejects.toThrow();
    });

    it('9. a response against a removed (unfeatured) insight is rejected — no responding to something the room no longer sees', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      const curated = await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );
      await insights.remove(workspaceId, sessionId, curated.id, FACILITATOR);
      const { participantId } = await joinAnonymously(sessionId);
      const participantPrincipal: Principal = {
        subject: `participant_capture:${participantId}`,
        displayName: 'Anonymous participant',
        kind: 'human',
        roles: [],
      };

      await expect(
        insights.submitResponse(
          sessionId,
          curated.id,
          participantId,
          { responseType: 'reflects' },
          participantPrincipal,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it('10. curation and participant-response reading require session_featured_insight:manage / participant_knowledge_response:read — an ordinary contributor is denied both', async () => {
      const manageDecisionForFacilitator = await policyEnforcement.decide(
        FACILITATOR,
        'session_featured_insight:manage',
        { type: 'workspace', workspaceId },
      );
      expect(manageDecisionForFacilitator.allowed).toBe(true);

      const manageDecisionForContributor = await policyEnforcement.decide(
        CONTRIBUTOR,
        'session_featured_insight:manage',
        { type: 'workspace', workspaceId },
      );
      expect(manageDecisionForContributor.allowed).toBe(false);

      const readDecisionForContributor = await policyEnforcement.decide(
        CONTRIBUTOR,
        'participant_knowledge_response:read',
        { type: 'workspace', workspaceId },
      );
      expect(readDecisionForContributor.allowed).toBe(false);
    });

    it('11. the room-view aggregate preserves the current agenda-item (prompt) relationship and never exposes participant identities', async () => {
      const sessionId = await createOpenSession(workspaceId);
      const agendaItemId = await createCurrentAgendaItem(workspaceId, sessionId);
      const { assertionId } = await createConfirmedAssertion(workspaceId, sessionId);
      await insights.curate(
        workspaceId,
        sessionId,
        { knowledgeAssertionId: assertionId },
        FACILITATOR,
      );

      const a = await joinAnonymously(sessionId);
      const b = await joinAnonymously(sessionId);
      await db.evidence.create({
        data: {
          id: randomUUID(),
          organisationId,
          workspaceId,
          sessionId,
          sourceAgendaItemId: agendaItemId,
          sourceParticipantId: a.participantId,
          evidenceType: 'audio_note',
          title: 'A contribution during the current prompt',
          content: 'placeholder',
          capturedAt: new Date(),
          attributionMode: 'anonymous',
          identityVisibility: 'visible_to_all_participants',
        },
      });
      await db.evidence.create({
        data: {
          id: randomUUID(),
          organisationId,
          workspaceId,
          sessionId,
          sourceAgendaItemId: agendaItemId,
          sourceParticipantId: b.participantId,
          evidenceType: 'audio_note',
          title: 'Another contribution during the same prompt',
          content: 'placeholder',
          capturedAt: new Date(),
          attributionMode: 'anonymous',
          identityVisibility: 'visible_to_all_participants',
        },
      });

      const room = await insights.roomView(workspaceId, sessionId);

      expect(room.activeAgendaItem?.id).toBe(agendaItemId);
      expect(room.activeAgendaItem?.status).toBe('current');
      expect(room.participantCount).toBeGreaterThanOrEqual(2);
      expect(room.contributedCount).toBeGreaterThanOrEqual(2);
      expect(room.totalContributions).toBeGreaterThanOrEqual(2);
      expect(room.insights).toHaveLength(1);
      expect(room.insights[0]!.knowledgeAssertionId).toBe(assertionId);

      // Aggregate counts only — no participant id/displayName anywhere in
      // the facilitator's own room-view payload.
      expect(JSON.stringify(room)).not.toContain(a.participantId);
      expect(JSON.stringify(room)).not.toContain(b.participantId);
    });
  },
);
