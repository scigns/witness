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
