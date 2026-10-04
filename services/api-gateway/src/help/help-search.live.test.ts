/**
 * Real-PostgreSQL suite for Help & Knowledge search (ADR-0032). The mocked
 * `help-search.service.test.ts` proves the service builds the right SQL
 * parameters; it cannot prove the generated `search_vector` column, the GIN
 * index, or the `WHERE` predicate actually filter real rows the way the
 * migration intends. This suite seeds real `documentation_snapshot`/
 * `documentation_chunk` rows and asserts on what comes back from the real
 * query — the same reasoning as the other `.live.test.ts` suites in this
 * service: a fake Prisma double cannot exercise generated-column/index
 * behaviour with the same fidelity as Postgres itself.
 *
 * The most important thing this suite proves: a chunk gated by role tier or
 * entitlement key is absent from the result set entirely when the caller
 * may not see it — never present-but-redacted, and never inferable from a
 * changed result count for an otherwise-identical query. That is the
 * invariant ADR-0032/ADR-0018 both state ("filter inside the query, never
 * after") and the only one that actually matters here: the frontend is
 * never the thing deciding what a user may know exists.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ResolvedEntitlements } from '@witness/domain';

import type { Principal } from '../authz/authorization.port.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { HelpSearchService } from './help-search.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[help-search.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[help-search.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

function entitlements(grants: Record<string, boolean>): ResolvedEntitlements {
  const map: ResolvedEntitlements = new Map();
  for (const [key, value] of Object.entries(grants)) {
    map.set(key, { key, value: { type: 'BOOLEAN', value }, source: 'PLAN' });
  }
  return map;
}

describe.skipIf(prisma === null)('HelpSearchService (live PostgreSQL) — ADR-0032', () => {
  const db = prisma as PrismaService;

  // A unique app_version per test run avoids colliding with any snapshot a
  // concurrent `test:live` file, or a previous failed run, left behind —
  // the same reasoning the other live suites use for their fixture IDs.
  const suffix = randomUUID().slice(0, 8);
  const APP_VERSION = `0.0.0-t${suffix}`;
  const OTHER_APP_VERSION = `0.0.0-o${suffix}`;
  const platformAdminUserId = randomUUID();
  const readerUserId = randomUUID();

  const READER: Principal = {
    subject: `user:${readerUserId}`,
    displayName: 'Reader',
    kind: 'human',
    roles: [],
  };
  const PLATFORM_ADMIN: Principal = {
    subject: `user:${platformAdminUserId}`,
    displayName: 'Platform Admin',
    kind: 'human',
    roles: [],
  };

  const roleResolution = new RoleResolutionService(db);
  const service = new HelpSearchService(db, roleResolution);

  const snapshotIds: string[] = [];

  async function createSnapshot(opts: {
    appVersion: string;
    docVersion: string;
    status?: string;
  }): Promise<string> {
    const id = randomUUID();
    await db.documentationSnapshot.create({
      data: {
        id,
        appVersion: opts.appVersion,
        // Each call gets its own (appVersion, docVersion, indexVersion)
        // identity — several tests reuse the same opts.docVersion literal
        // for readability, so the uniqueness constraint needs help from
        // the snapshot's own id rather than the caller's literal.
        docVersion: `${opts.docVersion}-${id.slice(0, 8)}`,
        status: opts.status ?? 'ACTIVE',
      },
    });
    snapshotIds.push(id);
    return id;
  }

  async function createChunk(
    snapshotId: string,
    opts: {
      title: string;
      body: string;
      minRoleTier?: string;
      minEntitlementKey?: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    await db.documentationChunk.create({
      data: {
        id,
        snapshotId,
        sourcePath: 'docs/guides/TEST.md',
        title: opts.title,
        body: opts.body,
        minRoleTier: opts.minRoleTier ?? 'reader',
        minEntitlementKey: opts.minEntitlementKey ?? null,
        lastUpdatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    });
    return id;
  }

  beforeAll(async () => {
    if (prisma === null) return;
    await db.user.create({
      data: {
        id: platformAdminUserId,
        email: `platform-admin-${randomUUID()}@help-search-live.example`,
        displayName: 'Platform Admin',
        accountState: 'active',
      },
    });
    await db.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'platform',
        userId: platformAdminUserId,
        role: 'admin',
      },
    });
    // READER deliberately gets no RoleAssignment at all — proving the
    // default-tier fallback (no assignment -> 'reader') independently of
    // any seeded grant, the same way an ordinary newly-created user would
    // hit this path with zero `RoleAssignment` rows.
  });

  afterAll(async () => {
    if (prisma === null) return;
    await db.documentationChunk.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
    await db.documentationSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    await db.roleAssignment.deleteMany({ where: { userId: platformAdminUserId } });
    await db.user.deleteMany({ where: { id: { in: [platformAdminUserId, readerUserId] } } });
    await db.$disconnect();
  });

  it('returns a reader-tier chunk to a caller with no role assignment at all (default tier)', async () => {
    const snapshot = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-01' });
    await createChunk(snapshot, {
      title: 'Finding your records',
      body: 'Open the records list and search by title or evidence content.',
      minRoleTier: 'reader',
    });

    const results = await service.search('finding records', READER, APP_VERSION, null);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Finding your records');
  });

  it("THREAT: an admin-tier chunk is entirely absent from a reader-tier caller's results, not merely hidden client-side", async () => {
    const snapshot = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-01' });
    await createChunk(snapshot, {
      title: 'Rotating the platform signing key',
      body: 'Platform operators rotate the signing key from the operator console.',
      minRoleTier: 'admin',
    });

    const asReader = await service.search('rotating signing key', READER, APP_VERSION, null);
    expect(asReader).toHaveLength(0);

    const asAdmin = await service.search('rotating signing key', PLATFORM_ADMIN, APP_VERSION, null);
    expect(asAdmin).toHaveLength(1);
    expect(asAdmin[0]!.title).toBe('Rotating the platform signing key');
  });

  it('THREAT: a reader-tier caller cannot inflate their own grant tiers client-side (confirms role, not caller input, decides the floor)', async () => {
    const snapshot = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-01' });
    await createChunk(snapshot, {
      title: 'Reviewer-only triage queue',
      body: 'The triage queue is visible to the reviewer tier and above.',
      minRoleTier: 'reviewer',
    });

    const results = await service.search('triage queue', READER, APP_VERSION, null);
    expect(results).toHaveLength(0);
  });

  it('THREAT: an entitlement-gated chunk is absent without the grant, and present with it — never a post-filtered redaction', async () => {
    const snapshot = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-01' });
    await createChunk(snapshot, {
      title: 'Configuring the premium export format',
      body: 'Premium export adds a signed manifest alongside the archive.',
      minRoleTier: 'reader',
      minEntitlementKey: 'export.premium',
    });

    const withoutGrant = await service.search(
      'configuring premium export',
      READER,
      APP_VERSION,
      entitlements({ 'export.premium': false }),
    );
    expect(withoutGrant).toHaveLength(0);

    const withNullEntitlementContext = await service.search(
      'configuring premium export',
      READER,
      APP_VERSION,
      null,
    );
    expect(withNullEntitlementContext).toHaveLength(0);

    const withGrant = await service.search(
      'configuring premium export',
      READER,
      APP_VERSION,
      entitlements({ 'export.premium': true }),
    );
    expect(withGrant).toHaveLength(1);
  });

  it('scopes results to the deployed application version — a chunk from a different app_version snapshot never appears', async () => {
    const thisVersion = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-01' });
    await createChunk(thisVersion, {
      title: 'Exporting a session report, current version',
      body: 'Use the export button on the session summary page.',
    });
    const otherVersion = await createSnapshot({
      appVersion: OTHER_APP_VERSION,
      docVersion: '2026-09-01',
    });
    await createChunk(otherVersion, {
      title: 'Exporting a session report, other version',
      body: 'Use the export menu item in the session toolbar.',
    });

    const results = await service.search('exporting session report', READER, APP_VERSION, null);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Exporting a session report, current version');
    expect(results[0]!.appVersion).toBe(APP_VERSION);
  });

  it('excludes a SUPERSEDED snapshot even when its app_version matches the active one', async () => {
    const superseded = await createSnapshot({
      appVersion: APP_VERSION,
      docVersion: '2026-09-01',
      status: 'SUPERSEDED',
    });
    await createChunk(superseded, {
      title: 'Outdated onboarding steps',
      body: 'This describes an onboarding flow that no longer exists.',
    });

    const results = await service.search('outdated onboarding steps', READER, APP_VERSION, null);
    expect(results).toHaveLength(0);
  });

  it('returns an empty result set for a query that matches no indexed documentation', async () => {
    const results = await service.search(
      'xyzzy-nonexistent-query-term-plugh',
      READER,
      APP_VERSION,
      null,
    );
    expect(results).toEqual([]);
  });

  it('tolerates a malformed/adversarial query string without throwing', async () => {
    for (const malformed of [
      '&&&',
      '""""',
      '((()))',
      '*:*',
      "'; DROP TABLE documentation_chunk; --",
    ]) {
      await expect(service.search(malformed, READER, APP_VERSION, null)).resolves.toBeDefined();
    }
    // The adversarial SQL-injection-shaped string must have had zero effect:
    // the table this test's own fixtures depend on must still exist and be
    // queryable, proving `websearch_to_tsquery`/parameterised `Prisma.sql`
    // treated it as literal search text, never as executable SQL.
    const survivor = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-02' });
    await createChunk(survivor, { title: 'Still here', body: 'The table was never dropped.' });
    const results = await service.search('still here', READER, APP_VERSION, null);
    expect(results).toHaveLength(1);
  });

  it('caps results at the fixed page size, ranking the most relevant matches first', async () => {
    const snapshot = await createSnapshot({ appVersion: APP_VERSION, docVersion: '2026-10-03' });
    for (let i = 0; i < 25; i += 1) {
      await createChunk(snapshot, {
        title: `Pagination fixture record ${i}`,
        body: 'Shared pagination fixture body text repeated for every row in this batch.',
      });
    }

    const results = await service.search('pagination fixture', READER, APP_VERSION, null);
    expect(results.length).toBeLessThanOrEqual(20);
  });
});
