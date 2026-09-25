/**
 * Synthetic development fixtures.
 *
 * Every person, meeting and decision below is invented. Witness records real
 * deliberation by real people; seeding development databases with production
 * data would violate the consent framework the product exists to enforce
 * (docs/governance/CONSENT_FRAMEWORK.md). The fixtures are deliberately
 * plausible so that the UI is exercised with realistic text lengths.
 *
 * Idempotent: safe to run repeatedly. Records are keyed on fixed UUIDs and
 * skipped if already present.
 */

import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hash = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

const canonicalise = (event: {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorId: string;
  occurredAt: Date;
  previousHash: string | null;
  metadata: Record<string, string>;
}): string =>
  [
    event.id,
    event.subjectType,
    event.subjectId,
    event.action,
    event.actorId,
    event.occurredAt.toISOString(),
    event.previousHash ?? '',
    Object.keys(event.metadata)
      .sort()
      .map((key) => `${key}=${event.metadata[key] ?? ''}`)
      .join(','),
  ].join('|');

const ACTORS = [
  {
    id: '0195a1f0-0000-7000-8000-000000000001',
    kind: 'human',
    displayName: 'Mele Tupou (Policy Officer)',
  },
  {
    id: '0195a1f0-0000-7000-8000-000000000002',
    kind: 'human',
    displayName: 'Dr Anaru Whitiora (Committee Secretary)',
  },
] as const;

const FIXTURES = [
  {
    recordId: '0195a1f0-0000-7000-8000-000000000101',
    sourceId: '0195a1f0-0000-7000-8000-000000000201',
    sourceKind: 'meeting',
    sourceLabel: 'Community Water Committee — 14 March 2026',
    occurredAt: '2026-03-14T09:00:00Z',
    title: 'Bore maintenance deferred pending the budget review',
    body:
      'The committee agreed to defer maintenance on the eastern bore until the outcome of the ' +
      'quarterly budget review is known. Two members recorded objections on the grounds that the ' +
      'bore has failed twice in eighteen months and that a third failure during the dry season ' +
      'would leave four settlements without a supply. The chair undertook to bring costed options ' +
      'to the next meeting rather than a single recommendation.',
    actorIndex: 0,
    state: 'confirmed' as const,
  },
  {
    recordId: '0195a1f0-0000-7000-8000-000000000102',
    sourceId: '0195a1f0-0000-7000-8000-000000000202',
    sourceKind: 'meeting',
    sourceLabel: 'Community Water Committee — 14 March 2026',
    occurredAt: '2026-03-14T09:00:00Z',
    title: 'Commitment: costed maintenance options by the April meeting',
    body:
      'The chair committed to circulating three costed options for eastern bore maintenance no ' +
      'later than seven days before the April meeting, each stating its consequence for the ' +
      'settlements affected if deferred a further quarter.',
    actorIndex: 1,
    state: 'in_review' as const,
  },
  {
    recordId: '0195a1f0-0000-7000-8000-000000000103',
    sourceId: '0195a1f0-0000-7000-8000-000000000203',
    sourceKind: 'document',
    sourceLabel: 'Submission from the Eastern Settlements Association, 2 March 2026',
    occurredAt: '2026-03-02T00:00:00Z',
    title: 'Submission opposing any further deferral of bore maintenance',
    body:
      'The association submitted that the consultation of 2024 produced an undertaking to renew ' +
      'the eastern bore within two years, and that the undertaking has not been recorded in any ' +
      'subsequent committee paper. The submission asks the committee to locate the original ' +
      'undertaking before deciding.',
    actorIndex: 0,
    state: 'draft' as const,
  },
] as const;

// ─── Modern domain model (organisation/workspace/session/evidence) ──────────
//
// The fixtures above only ever exercised the original Milestone 1 `Record`/
// `Source` vocabulary. Everything built since — organisations, workspaces,
// role-based access, co-design sessions, consent, evidence — had no
// synthetic fixtures at all, so exercising it locally meant hand-building
// rows through the API one call at a time. This section is deliberately
// modest (one organisation, one workspace, one session, one piece of
// evidence) rather than exhaustive: it exists to make `pnpm dev` show a
// real programme immediately, not to be a full acceptance-scenario fixture
// set. Extend it as new domain areas need a seeded example.
const ORG_ID = '0195a1f0-0000-7000-9000-000000000001';
const WORKSPACE_ID = '0195a1f0-0000-7000-9000-000000000002';
const SESSION_ID = '0195a1f0-0000-7000-9000-000000000003';
const CONSENT_TEMPLATE_ID = '0195a1f0-0000-7000-9000-000000000004';
const CONSENT_CONFIG_ID = '0195a1f0-0000-7000-9000-000000000005';
const EVIDENCE_ID = '0195a1f0-0000-7000-9000-000000000006';

const USERS = [
  {
    id: '0195a1f0-0000-7000-9000-000000000011',
    email: 'admin@northshore-council.example.invalid',
    displayName: 'Admin User',
    role: 'admin',
  },
  {
    id: '0195a1f0-0000-7000-9000-000000000012',
    email: 'facilitator@northshore-council.example.invalid',
    displayName: 'Facilitator User',
    role: 'facilitator',
  },
  {
    id: '0195a1f0-0000-7000-9000-000000000013',
    email: 'reviewer@northshore-council.example.invalid',
    displayName: 'Reviewer User',
    role: 'reviewer',
  },
  {
    id: '0195a1f0-0000-7000-9000-000000000014',
    email: 'steward@northshore-council.example.invalid',
    displayName: 'Knowledge Steward User',
    role: 'steward',
  },
] as const;

// `.invalid` is reserved by RFC 2606 for exactly this — a domain name
// guaranteed to never resolve or collide with a real one.
async function seedModernFixtures(): Promise<void> {
  const existingOrg = await prisma.organisation.findUnique({ where: { id: ORG_ID } });
  if (existingOrg !== null) {
    process.stdout.write('  = Northshore Regional Council programme (already present)\n');
    return;
  }

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountState: 'active',
      },
    });
  }

  await prisma.organisation.create({
    data: {
      id: ORG_ID,
      name: 'Northshore Regional Council (synthetic)',
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      profile: 'general',
    },
  });

  for (const user of USERS) {
    await prisma.organisationMembership.create({
      data: { id: randomUUID(), organisationId: ORG_ID, userId: user.id, state: 'active' },
    });
    await prisma.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'organisation',
        organisationId: ORG_ID,
        userId: user.id,
        role: user.role,
      },
    });
  }

  await prisma.workspace.create({
    data: {
      id: WORKSPACE_ID,
      organisationId: ORG_ID,
      name: 'Coastal Infrastructure Renewal Programme (synthetic)',
      description: 'A synthetic programme for local development — not a real consultation.',
      status: 'active',
    },
  });

  const facilitator = USERS.find((u) => u.role === 'facilitator')!;

  await prisma.consentTemplate.create({
    data: {
      id: CONSENT_TEMPLATE_ID,
      familyId: 'northshore-standard-consent',
      organisationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Standard co-design consent (synthetic)',
      purpose: 'Synthetic development fixture for consent-gated capture.',
      version: 1,
      status: 'active',
      plainLanguageSummary:
        'We may record what you say, quote you if you agree, and use what you share to inform this programme.',
      supportedLanguages: ['en'],
      categories: [
        { category: 'participation', required: true },
        { category: 'audio_recording', required: true },
        { category: 'attributed_quotation', required: false },
        { category: 'anonymous_quotation', required: false },
        { category: 'internal_use', required: true },
      ],
    },
  });

  await prisma.coDesignSession.create({
    data: {
      id: SESSION_ID,
      organisationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      title: 'Community workshop — coastal path renewal (synthetic)',
      purpose: 'Gather community input on the proposed coastal path renewal options.',
      sessionType: 'workshop',
      deliveryMode: 'in_person',
      primaryFacilitatorId: facilitator.id,
      status: 'open',
      participantVisibility: 'facilitators_only',
      consentConfigurationState: 'configured',
      openedAt: new Date(),
    },
  });

  await prisma.sessionConsentConfiguration.create({
    data: {
      id: CONSENT_CONFIG_ID,
      organisationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      consentTemplateId: CONSENT_TEMPLATE_ID,
      templateVersion: 1,
      requiredCategories: ['participation', 'audio_recording', 'internal_use'],
      optionalCategories: ['attributed_quotation', 'anonymous_quotation'],
      effectiveDate: new Date(),
      status: 'active',
    },
  });

  await prisma.evidence.create({
    data: {
      id: EVIDENCE_ID,
      organisationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      evidenceType: 'concern',
      title: 'Concern about path closure during peak season (synthetic)',
      content:
        'A resident raised concern that closing the coastal path during the summer peak season ' +
        'would disproportionately affect local tourism operators, and asked whether staged works ' +
        'outside peak months had been costed as an alternative.',
      capturedAt: new Date(),
      attributionMode: 'facilitator_observation',
      identityVisibility: 'visible_to_all_participants',
      consentBasis: ['participation', 'internal_use'],
      reviewStatus: 'submitted',
    },
  });

  process.stdout.write(
    '  + Northshore Regional Council programme: 1 organisation, 1 workspace, 4 users ' +
      '(admin/facilitator/reviewer/steward), 1 session, 1 evidence record\n',
  );
}

async function main(): Promise<void> {
  process.stdout.write('Seeding synthetic development fixtures...\n');

  for (const actor of ACTORS) {
    await prisma.actor.upsert({
      where: { id: actor.id },
      update: {},
      create: { id: actor.id, kind: actor.kind, displayName: actor.displayName },
    });
  }

  for (const fixture of FIXTURES) {
    const existing = await prisma.record.findUnique({ where: { id: fixture.recordId } });

    if (existing !== null) {
      process.stdout.write(`  = ${fixture.title.slice(0, 50)}... (already present)\n`);
      continue;
    }

    const actor = ACTORS[fixture.actorIndex]!;
    const capturedAt = new Date('2026-03-14T11:00:00Z');

    await prisma.source.create({
      data: {
        id: fixture.sourceId,
        kind: fixture.sourceKind,
        label: fixture.sourceLabel,
        occurredAt: new Date(fixture.occurredAt),
      },
    });

    await prisma.record.create({
      data: {
        id: fixture.recordId,
        title: fixture.title,
        body: fixture.body,
        reviewState: fixture.state,
        sourceId: fixture.sourceId,
        capturedById: actor.id,
        capturedAt,
      },
    });

    // Build the audit chain that would have produced this state, so the seeded
    // data verifies exactly as live data does. A fixture whose audit chain does
    // not verify would make the chain-verification indicator meaningless the
    // first time anyone looked at it.
    const journey: Array<{
      action: string;
      metadata: Record<string, string>;
      offsetMinutes: number;
    }> = [
      {
        action: 'record.captured',
        metadata: { sourceKind: fixture.sourceKind, sourceLabel: fixture.sourceLabel },
        offsetMinutes: 0,
      },
    ];

    if (fixture.state !== 'draft') {
      journey.push({
        action: 'record.submitted_for_review',
        metadata: { from: 'draft', to: 'in_review' },
        offsetMinutes: 30,
      });
    }

    if (fixture.state === 'confirmed') {
      journey.push({
        action: 'record.confirmed',
        metadata: { from: 'in_review', to: 'confirmed' },
        offsetMinutes: 120,
      });
    }

    let previousHash: string | null = null;

    for (const step of journey) {
      const id = randomUUID();
      const occurredAt = new Date(capturedAt.getTime() + step.offsetMinutes * 60_000);
      const computed = hash(
        canonicalise({
          id,
          subjectType: 'record',
          subjectId: fixture.recordId,
          action: step.action,
          actorId: actor.id,
          occurredAt,
          previousHash,
          metadata: step.metadata,
        }),
      );

      await prisma.auditEvent.create({
        data: {
          id,
          subjectType: 'record',
          subjectId: fixture.recordId,
          action: step.action,
          actorId: actor.id,
          occurredAt,
          previousHash,
          hash: computed,
          metadata: step.metadata,
        },
      });

      previousHash = computed;
    }

    process.stdout.write(`  + ${fixture.title.slice(0, 50)}... (${fixture.state})\n`);
  }

  await seedModernFixtures();

  process.stdout.write('\nSeed complete. All fixtures are synthetic.\n');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
