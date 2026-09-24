/**
 * Real-PostgreSQL suite for participant self-capture (Phase 5, Workstreams
 * 1.1-1.4) — proves the capture-token mechanism end to end against the
 * *real* `EvidenceService`/`ParticipantConsentRecordsService`, not a fake:
 * consent-gates-capture (never assume consent from attendance alone),
 * token expiry/revocation/withdrawal rejection, and that a capture token
 * can never be used to act as a different participant. Real database
 * access is deliberate for the same reason as the other Phase 5 live
 * suites — a fake Prisma double cannot exercise the advisory-lock and
 * unique-constraint behaviour these paths rely on with the same fidelity.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { DevelopmentAuthorizationAdapter } from '../authz/development.adapter.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { ConsentTemplatesService } from '../consent-templates/consent-templates.service.js';
import { SessionConsentConfigurationService } from '../session-consent-configuration/session-consent-configuration.service.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { ParticipantConsentRecordsService } from '../participant-consent-records/participant-consent-records.service.js';
import { ParticipantCaptureService } from './participant-capture.service.js';
import { SessionJoinService } from './session-join.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[participant-capture.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[participant-capture.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

function fakeHttpRequest(): {
  headers: Record<string, string>;
  socket: { remoteAddress?: string };
} {
  return { headers: {}, socket: { remoteAddress: '203.0.113.9' } };
}

describe.skipIf(prisma === null)(
  'participant self-capture (live PostgreSQL) — Workstream 1.1-1.4',
  () => {
    const db = prisma as PrismaService;
    const policyEngine = new PolicyEngineService();
    const policyEnforcement = new PolicyEnforcementService(
      new DevelopmentAuthorizationAdapter('development'),
      new RoleResolutionService(db),
      policyEngine,
    );
    const consentPolicy = new ConsentPolicyService(db);
    const evidenceService = new EvidenceService(db, policyEnforcement, consentPolicy);
    const participantConsentService = new ParticipantConsentRecordsService(db, policyEnforcement);
    const consentTemplatesService = new ConsentTemplatesService(db);
    const sessionConsentConfigService = new SessionConsentConfigurationService(db);
    const capture = new ParticipantCaptureService(db, evidenceService, participantConsentService);
    const joinService = new SessionJoinService(db, new SessionService(db));

    const organisationId = randomUUID();
    const workspaceId = randomUUID();
    const facilitatorUserId = randomUUID();

    const FACILITATOR: Principal = {
      subject: `user:${facilitatorUserId}`,
      displayName: 'Live Test Facilitator',
      kind: 'human',
      roles: [],
    };

    async function createOpenSessionWithConsent(): Promise<string> {
      const sessionId = randomUUID();
      await db.coDesignSession.create({
        data: {
          id: sessionId,
          organisationId,
          workspaceId,
          title: 'Teacher Voice Co-design — capture session',
          purpose: 'Prove participant self-capture end to end.',
          sessionType: 'co_design_workshop',
          deliveryMode: 'in_person',
          primaryFacilitatorId: facilitatorUserId,
          status: 'draft',
          participantVisibility: 'facilitators_only',
        },
      });

      const template = await consentTemplatesService.create(
        organisationId,
        {
          name: `Capture consent template ${sessionId}`,
          purpose: 'Gate self-capture on real consent.',
          plainLanguageSummary: 'We will record your contribution and use it as you allow below.',
          supportedLanguages: ['en'],
          categories: [
            { category: 'participation', required: true },
            { category: 'evidence_submission', required: true },
            { category: 'anonymous_quotation', required: false },
          ],
        },
        FACILITATOR,
      );
      await consentTemplatesService.applyAction(
        organisationId,
        template.id,
        { action: 'activate', expectedRevision: template.revision },
        FACILITATOR,
      );

      await sessionConsentConfigService.configure(
        workspaceId,
        sessionId,
        {
          consentTemplateId: template.id,
          requiredCategories: ['participation', 'evidence_submission'],
          optionalCategories: ['anonymous_quotation'],
        },
        FACILITATOR,
      );

      await db.coDesignSession.update({ where: { id: sessionId }, data: { status: 'open' } });
      return sessionId;
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

    beforeAll(async () => {
      if (prisma === null) return;
      await policyEngine.onModuleInit();
      await db.organisation.create({
        data: {
          id: organisationId,
          name: `Capture Org ${organisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: 'Teacher Voice Co-design', organisationId },
      });
      await db.user.create({
        data: {
          id: facilitatorUserId,
          email: `facilitator-${randomUUID()}@capture-org.example`,
          displayName: 'Live Test Facilitator',
          accountState: 'active',
        },
      });
    });

    afterAll(async () => {
      if (prisma === null) return;
      await db.auditEvent.deleteMany({ where: { subjectId: workspaceId } });
      await db.participantCaptureToken.deleteMany({
        where: { participant: { workspaceId } },
      });
      await db.evidence.deleteMany({ where: { workspaceId } });
      await db.participantConsentRecord.deleteMany({ where: { workspaceId } });
      await db.sessionJoinAttempt.deleteMany({ where: { joinLink: { workspaceId } } });
      await db.sessionJoinLink.deleteMany({ where: { workspaceId } });
      await db.sessionParticipant.deleteMany({ where: { workspaceId } });
      await db.sessionConsentConfiguration.deleteMany({ where: { workspaceId } });
      await db.coDesignSession.deleteMany({ where: { workspaceId } });
      await db.consentTemplate.deleteMany({ where: { organisationId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.organisation.deleteMany({ where: { id: organisationId } });
      // Scoped to this file's own facilitator, never a shared `.example`
      // filter — that broad filter races other live-test files' fixtures
      // under concurrent `test:live` execution.
      await db.user.deleteMany({ where: { id: facilitatorUserId } });
      await db.$disconnect();
    });

    it('THREAT: capture is blocked until the participant has actually granted consent (never assumed from joining alone)', async () => {
      const sessionId = await createOpenSessionWithConsent();
      const { captureToken } = await joinAnonymously(sessionId);

      await expect(
        capture.captureEvidence(captureToken, {
          evidenceType: 'audio_note',
          title: 'My contribution',
          content: 'placeholder — audio attached separately',
          clientRequestId: randomUUID(),
        }),
      ).rejects.toThrow();
    });

    it('happy path: grant consent through the token, then capture succeeds and is attributed to the right participant', async () => {
      const sessionId = await createOpenSessionWithConsent();
      const { participantId, captureToken } = await joinAnonymously(sessionId);

      const context = await capture.context(captureToken);
      expect(context.sessionId).toBe(sessionId);
      expect(context.participantId).toBe(participantId);
      expect(context.identityMode).toBe('anonymous');

      await capture.captureConsent(captureToken, {
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'evidence_submission', granted: true },
          { category: 'anonymous_quotation', granted: true },
        ],
      });

      const result = await capture.captureEvidence(captureToken, {
        evidenceType: 'audio_note',
        title: 'My contribution',
        content: 'placeholder — audio attached separately',
        clientRequestId: randomUUID(),
      });
      expect(result.reviewStatus).toBe('submitted');

      const evidenceRow = await db.evidence.findUniqueOrThrow({ where: { id: result.evidenceId } });
      expect(evidenceRow.sourceParticipantId).toBe(participantId);
      expect(evidenceRow.attributionMode).toBe('anonymous');
    });

    it('THREAT: an idempotent retry (same clientRequestId) never creates a second evidence row', async () => {
      const sessionId = await createOpenSessionWithConsent();
      const { captureToken } = await joinAnonymously(sessionId);
      await capture.captureConsent(captureToken, {
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'evidence_submission', granted: true },
          { category: 'anonymous_quotation', granted: true },
        ],
      });
      const clientRequestId = randomUUID();

      const first = await capture.captureEvidence(captureToken, {
        evidenceType: 'audio_note',
        title: 'Retry test',
        content: 'placeholder',
        clientRequestId,
      });
      const second = await capture.captureEvidence(captureToken, {
        evidenceType: 'audio_note',
        title: 'Retry test',
        content: 'placeholder',
        clientRequestId,
      });

      expect(second.evidenceId).toBe(first.evidenceId);
      const count = await db.evidence.count({ where: { sessionId, clientRequestId } });
      expect(count).toBe(1);
    });

    it("THREAT: two participants in the same session cannot cross-attribute evidence via each other's token", async () => {
      const sessionId = await createOpenSessionWithConsent();
      const a = await joinAnonymously(sessionId);
      const b = await joinAnonymously(sessionId);
      expect(a.participantId).not.toBe(b.participantId);

      for (const p of [a, b]) {
        await capture.captureConsent(p.captureToken, {
          categoryDecisions: [
            { category: 'participation', granted: true },
            { category: 'evidence_submission', granted: true },
            { category: 'anonymous_quotation', granted: true },
          ],
        });
      }

      const resultA = await capture.captureEvidence(a.captureToken, {
        evidenceType: 'audio_note',
        title: 'From A',
        content: 'placeholder',
        clientRequestId: randomUUID(),
      });
      const resultB = await capture.captureEvidence(b.captureToken, {
        evidenceType: 'audio_note',
        title: 'From B',
        content: 'placeholder',
        clientRequestId: randomUUID(),
      });

      const rowA = await db.evidence.findUniqueOrThrow({ where: { id: resultA.evidenceId } });
      const rowB = await db.evidence.findUniqueOrThrow({ where: { id: resultB.evidenceId } });
      expect(rowA.sourceParticipantId).toBe(a.participantId);
      expect(rowB.sourceParticipantId).toBe(b.participantId);
      expect(rowA.sourceParticipantId).not.toBe(rowB.sourceParticipantId);
    });

    it('THREAT: an invalid capture token is rejected', async () => {
      await expect(
        capture.captureEvidence('not-a-real-token', {
          evidenceType: 'audio_note',
          title: 'x',
          content: 'x',
          clientRequestId: randomUUID(),
        }),
      ).rejects.toThrow();
    });

    it('THREAT: an expired capture token is rejected even though the row still exists', async () => {
      const sessionId = await createOpenSessionWithConsent();
      const { captureToken } = await joinAnonymously(sessionId);
      await db.participantCaptureToken.updateMany({
        where: { participant: { sessionId } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(capture.context(captureToken)).rejects.toThrow();
    });

    it('THREAT: a withdrawn participant cannot continue capturing even with a still-valid token', async () => {
      const sessionId = await createOpenSessionWithConsent();
      const { participantId, captureToken } = await joinAnonymously(sessionId);
      await db.sessionParticipant.update({
        where: { id: participantId },
        data: { withdrawnAt: new Date() },
      });

      await expect(capture.context(captureToken)).rejects.toThrow();
    });
  },
);
