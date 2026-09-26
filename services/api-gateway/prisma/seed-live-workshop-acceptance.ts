/**
 * Synthetic fixture for the live workshop (Phase 6, Track E) physical
 * acceptance pass — extends the existing "Mobile Acceptance Test Session v2"
 * fixture (created for MOBILE-002) rather than inventing a new session,
 * since its consent configuration already declares the four categories a
 * Track E test needs (`participation`, `evidence_submission`,
 * `audio_recording`, `anonymous_quotation`) as required.
 *
 * Adds, idempotently:
 *
 *   • a `dev@example.com` facilitator identity — the *default* development
 *     identity provider double's identity (`DevelopmentIdentityProviderAdapter`),
 *     so a plain "Sign in" click at `/signin` (no query-param hacking of the
 *     dev-idp authorize URL) lands as this user. Left `invited`; it activates
 *     itself the normal way the first time someone actually signs in with
 *     that email — this script grants nothing beyond that door.
 *   • three agenda items (prompts/rounds) on the fixture session, the first
 *     `current`, matching the prompt/round model already implemented in
 *     `packages/domain/src/agenda-item.ts` and `Evidence.sourceAgendaItemId`.
 *   • one confirmed `KnowledgeAssertion` with a real (if minimal)
 *     `KnowledgeProvenanceChain`/`KnowledgeEntity`/`KnowledgeEntityAttribute`
 *     — created directly via Prisma with the exact same field discipline as
 *     `session-featured-insights.live.test.ts`'s own fixture helper, since
 *     there is no lighter human-manual-assertion endpoint and standing up
 *     the full propose/review candidate pipeline here would exercise
 *     nothing this script needs to prove. This is fixture data for a
 *     facilitator to *feature* during the test, not a claim that any
 *     extraction happened — no AI or extraction pipeline is touched.
 *   • one fresh `SessionJoinLink` (anonymous governance), created through
 *     the real `SessionJoinService.create()` — the same service the HTTP
 *     controller calls — so the resulting raw token is real and immediately
 *     usable, and the join is captured in the audit trail like any other.
 *
 * Idempotent: safe to re-run. Agenda items/assertion/entity are skipped if
 * already present for this session; a fresh join link is minted every run
 * (join links are meant to be short-lived and are cheap to replace).
 *
 * Run with: `pnpm --filter @witness/api exec tsx prisma/seed-live-workshop-acceptance.ts`
 * (needs `DATABASE_URL` in the environment — see the root `.env`).
 */

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../src/infrastructure/prisma.service.js';
import { resolveActor } from '../src/infrastructure/actor.helper.js';
import { SessionService } from '../src/authn/session.service.js';
import { SessionJoinService } from '../src/session-join/session-join.service.js';
import { AgendaItemsService } from '../src/agenda-items/agenda-items.service.js';
import type { Principal } from '../src/authz/authorization.port.js';

const prisma = new PrismaService();

// The fixture session created for MOBILE-002 — already has a correct
// four-category consent configuration and is `open`.
const SESSION_ID = 'd5d8b9d7-980f-456b-a9dd-5191265a64de';
const WORKSPACE_ID = 'c9aefbb7-aff1-48a9-8c0f-cb9e9983399f';
const ORGANISATION_ID = 'ed773bac-46c1-4b0a-9ee7-de446b558bb5';
// The existing session facilitator (`Test Admin`) — a valid User row this
// script can attribute agenda-item/join-link creation to. Signing in as
// this identity is not required for the test; only `dev@example.com` is.
const FACILITATOR_USER_ID = '95c0cba4-7c3d-4bf3-9b25-1c8aa8a48894';

const DEV_IDENTITY_EMAIL = 'dev@example.com';

const FACILITATOR: Principal = {
  subject: `user:${FACILITATOR_USER_ID}`,
  displayName: 'Test Admin',
  kind: 'human',
  roles: [],
};

const AGENDA_PROMPTS = [
  {
    title: 'What are we experiencing?',
    promptText: 'Tell us what you have noticed since the last visit.',
  },
  {
    title: 'Why is this happening?',
    promptText: 'What do you think is causing this?',
  },
  {
    title: 'What are we learning?',
    promptText: 'Looking at what the room has shared so far, what stands out?',
  },
] as const;

async function ensureDevFacilitatorIdentity(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: DEV_IDENTITY_EMAIL } });
  if (existing !== null) {
    process.stdout.write(
      `[fixture] ${DEV_IDENTITY_EMAIL} already exists (${existing.accountState}) — skipping.\n`,
    );
    return;
  }

  const userId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        email: DEV_IDENTITY_EMAIL,
        displayName: 'Development Facilitator',
        accountState: 'invited',
      },
    });
    await tx.organisationMembership.create({
      data: {
        id: randomUUID(),
        organisationId: ORGANISATION_ID,
        userId,
        state: 'active',
      },
    });
    await tx.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'organisation',
        organisationId: ORGANISATION_ID,
        userId,
        role: 'admin',
      },
    });
  });
  process.stdout.write(
    `[fixture] created ${DEV_IDENTITY_EMAIL} (invited) with an organisation-admin role in ` +
      `org ${ORGANISATION_ID} — cascades to workspace ${WORKSPACE_ID}. Activates on first real sign-in.\n`,
  );
}

async function ensureAgendaItems(agendaItems: AgendaItemsService): Promise<string> {
  const existing = await prisma.agendaItem.findMany({
    where: { sessionId: SESSION_ID },
    orderBy: { sortOrder: 'asc' },
  });
  if (existing.length > 0) {
    const current = existing.find((item) => item.status === 'current') ?? existing[0]!;
    process.stdout.write(
      `[fixture] ${existing.length} agenda item(s) already exist — skipping creation.\n`,
    );
    return current.id;
  }

  const createdIds: string[] = [];
  for (const prompt of AGENDA_PROMPTS) {
    const created = await agendaItems.create(
      WORKSPACE_ID,
      {
        title: prompt.title,
        promptText: prompt.promptText,
        sessionId: SESSION_ID,
      },
      FACILITATOR,
    );
    createdIds.push(created.id);
  }
  await agendaItems.transitionStatus(WORKSPACE_ID, createdIds[0]!, 'current', FACILITATOR);
  process.stdout.write(
    `[fixture] created ${createdIds.length} agenda items; "${AGENDA_PROMPTS[0]!.title}" is current.\n`,
  );
  return createdIds[0]!;
}

async function ensureFeaturableAssertion(): Promise<string> {
  // Matched by this fixture's own entity label, not "any confirmed
  // assertion in the workspace" — other, unrelated synthetic assertions may
  // already exist here (e.g. from other feature testing) and would
  // otherwise short-circuit this fixture with a poorly-labelled candidate
  // (no entity attributes) that reads as "This theme" in the UI.
  const existingEntity = await prisma.knowledgeEntity.findFirst({
    where: { workspaceId: WORKSPACE_ID, canonicalLabel: 'Bore access delays' },
  });
  const existing =
    existingEntity === null
      ? null
      : await prisma.knowledgeAssertion.findFirst({
          where: {
            workspaceId: WORKSPACE_ID,
            lifecycleState: { notIn: ['rejected', 'superseded'] },
            entityAttributes: { some: { entityId: existingEntity.id } },
          },
        });
  if (existing !== null) {
    process.stdout.write(
      `[fixture] a confirmed assertion already exists (${existing.id}) — skipping creation.\n`,
    );
    return existing.id;
  }

  const facilitatorActor = await resolveActor(prisma, FACILITATOR);

  const evidenceId = randomUUID();
  await prisma.evidence.create({
    data: {
      id: evidenceId,
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      evidenceType: 'audio_note',
      title: 'Facilitator observation — bore access delays',
      content: 'Several households mentioned delays accessing the bore this week.',
      capturedAt: new Date(),
      attributionMode: 'facilitator_observation',
      identityVisibility: 'visible_to_all_participants',
    },
  });

  const provenanceChainId = randomUUID();
  await prisma.knowledgeProvenanceChain.create({
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
  await prisma.knowledgeEntity.create({
    data: {
      id: entityId,
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      entityType: 'topic',
      topicScheme: 'theme',
      canonicalLabel: 'Bore access delays',
      ontologyVersion: '0.1.0',
      createdById: facilitatorActor.id,
    },
  });

  const assertionId = randomUUID();
  await prisma.knowledgeAssertion.create({
    data: {
      id: assertionId,
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      assertionType: 'attribute',
      provenanceChainId,
      confidence: 0.9,
      lifecycleState: 'approved',
      validFrom: new Date(),
      createdById: facilitatorActor.id,
    },
  });

  await prisma.knowledgeEntityAttribute.create({
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

  process.stdout.write(
    `[fixture] created confirmed KnowledgeAssertion ${assertionId} ("Bore access delays").\n`,
  );
  return assertionId;
}

async function mintJoinLink(joinService: SessionJoinService): Promise<string> {
  const link = await joinService.create(
    WORKSPACE_ID,
    SESSION_ID,
    { governanceMode: 'anonymous', expiresInMinutes: 12 * 60 },
    FACILITATOR,
  );
  return link.token;
}

async function main(): Promise<void> {
  const session = await prisma.coDesignSession.findUnique({ where: { id: SESSION_ID } });
  if (session === null) {
    throw new Error(
      `Fixture session ${SESSION_ID} does not exist. This script extends the existing ` +
        'MOBILE_ACCEPTANCE.md fixture session — it does not create one from scratch.',
    );
  }

  await ensureDevFacilitatorIdentity();

  const agendaItems = new AgendaItemsService(prisma);
  const joinService = new SessionJoinService(prisma, new SessionService(prisma));

  const currentAgendaItemId = await ensureAgendaItems(agendaItems);
  const assertionId = await ensureFeaturableAssertion();
  const rawToken = await mintJoinLink(joinService);

  process.stdout.write(
    [
      '',
      '─── Live workshop acceptance fixture ready ───────────────────────────',
      `organisationId:        ${ORGANISATION_ID}`,
      `workspaceId:           ${WORKSPACE_ID}`,
      `sessionId:             ${SESSION_ID}`,
      `current agenda item:   ${currentAgendaItemId}`,
      `featurable assertion:  ${assertionId}`,
      `facilitator sign-in:   ${DEV_IDENTITY_EMAIL} (via /signin, default dev identity)`,
      `facilitator live URL:  /workspaces/${WORKSPACE_ID}/live`,
      `participant join path: /join/${rawToken}`,
      'join link expires:     12 hours from now',
      '────────────────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
