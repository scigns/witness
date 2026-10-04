import { describe, expect, it, vi } from 'vitest';

import type { ResolvedEntitlements } from '@witness/domain';

import type { Principal } from '../authz/authorization.port.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { RoleResolutionService } from '../authz/role-resolution.service.js';
import { HelpSearchService } from './help-search.service.js';

const PRINCIPAL: Principal = {
  subject: 'user:user-1',
  displayName: 'User',
  kind: 'human',
  roles: [],
};

function harness(tiers: string[]) {
  const row = {
    id: 'chunk-1',
    title: 'Finding out what was decided',
    snippet: 'Open the record and look at outcomes.',
    source_path: 'docs/guides/USER_GUIDE.md',
    source_anchor: 'finding-out-what-was-decided',
    app_version: '0.1.0',
    doc_version: '2026-10-04',
    last_updated_at: new Date('2026-10-01T00:00:00Z'),
    indexed_at: new Date('2026-10-02T00:00:00Z'),
  };
  const queryRaw = vi.fn().mockResolvedValue([row]);
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const roleResolution = {
    globalGrantTiers: vi.fn().mockResolvedValue(tiers),
  } as unknown as RoleResolutionService;

  const service = new HelpSearchService(prisma, roleResolution);
  return { service, queryRaw, row, roleResolution };
}

function entitlements(grants: Record<string, boolean>): ResolvedEntitlements {
  const map = new Map();
  for (const [key, value] of Object.entries(grants)) {
    map.set(key, { key, value: { type: 'BOOLEAN', value }, source: 'PLAN' });
  }
  return map;
}

describe('HelpSearchService', () => {
  it('returns no results and makes no query for a blank query string', async () => {
    const { service, queryRaw } = harness(['reader']);
    const results = await service.search('   ', PRINCIPAL, '0.1.0', null);
    expect(results).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("scopes the allowed role-tier set to exactly the caller's tiers and below", async () => {
    const { service, queryRaw } = harness(['reader']);
    await service.search('how do I find a decision', PRINCIPAL, '0.1.0', null);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContain('reader');
    expect(sqlValues).not.toContain('admin');
    expect(sqlValues).not.toContain('reviewer');
    expect(sqlValues).not.toContain('contributor');
  });

  it("for a dev-header principal (subject not prefixed 'user:'), uses principal.roles directly rather than querying RoleResolutionService", async () => {
    const { service, queryRaw, roleResolution } = harness(['reader']);
    const devPrincipal: Principal = {
      subject: 'dev:Some Developer',
      displayName: 'Some Developer',
      kind: 'human',
      roles: ['admin'],
    };

    await service.search('anything', devPrincipal, '0.1.0', null);

    expect(roleResolution.globalGrantTiers).not.toHaveBeenCalled();
    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContain('admin');
  });

  it("includes every tier at or below an admin caller's rank", async () => {
    const { service, queryRaw } = harness(['admin']);
    await service.search('anything', PRINCIPAL, '0.1.0', null);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContain('reader');
    expect(sqlValues).toContain('contributor');
    expect(sqlValues).toContain('reviewer');
    expect(sqlValues).toContain('admin');
  });

  it('treats an unrecognised or missing tier as the reader floor, never a higher one', async () => {
    const { service, queryRaw } = harness([]);
    await service.search('anything', PRINCIPAL, '0.1.0', null);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContain('reader');
    expect(sqlValues).not.toContain('admin');
  });

  it('passes an empty entitlement grant list when no organisation context is given', async () => {
    const { service, queryRaw } = harness(['reader']);
    await service.search('anything', PRINCIPAL, '0.1.0', null);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContainEqual([]);
  });

  it('passes only the granted boolean entitlement keys, excluding false and non-boolean ones', async () => {
    const { service, queryRaw } = harness(['reader']);
    const resolved = entitlements({ 'module.enabled': true, 'module.other': false });
    await service.search('anything', PRINCIPAL, '0.1.0', resolved);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContainEqual(['module.enabled']);
  });

  it('scopes the query to exactly the requested application version', async () => {
    const { service, queryRaw } = harness(['reader']);
    await service.search('anything', PRINCIPAL, '0.7.3', null);

    const sqlValues = (queryRaw.mock.calls[0]![0] as { values: unknown[] }).values;
    expect(sqlValues).toContain('0.7.3');
  });

  it('maps returned rows to the public result shape', async () => {
    const { service, row } = harness(['reader']);
    const results = await service.search('decision', PRINCIPAL, '0.1.0', null);

    expect(results).toEqual([
      {
        chunkId: row.id,
        title: row.title,
        snippet: row.snippet,
        sourcePath: row.source_path,
        sourceAnchor: row.source_anchor,
        appVersion: row.app_version,
        docVersion: row.doc_version,
        lastUpdatedAt: row.last_updated_at.toISOString(),
        indexedAt: row.indexed_at.toISOString(),
      },
    ]);
  });
});
