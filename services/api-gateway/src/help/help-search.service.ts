/**
 * Help & Knowledge search (ADR-0032).
 *
 * Permission filtering happens inside the SQL predicate, in the same query
 * that computes rank — never as a post-filter on fetched rows. A post-filter
 * still leaks the existence of a restricted chunk through result counts and
 * timing, which is the same rule ADR-0018 states for evidence search.
 *
 * `documentation_chunk.search_vector` is a generated Postgres column
 * (see the matching migration SQL); Prisma models it as `Unsupported`, so
 * every read goes through `$queryRaw` with parameterised `Prisma.sql`.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { booleanEntitlement, type ResolvedEntitlements } from '@witness/domain';

import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';

/** Ordering matches `packages/domain/src/role.ts`'s tier collapse, not grant count. */
const TIER_RANK: Readonly<Record<string, number>> = Object.freeze({
  reader: 0,
  contributor: 1,
  reviewer: 2,
  admin: 3,
});

const DEFAULT_TIER = 'reader';

export interface HelpSearchResult {
  readonly chunkId: string;
  readonly title: string;
  readonly snippet: string;
  readonly sourcePath: string;
  readonly sourceAnchor: string | null;
  readonly appVersion: string;
  readonly docVersion: string;
  readonly lastUpdatedAt: string;
  readonly indexedAt: string;
}

interface HelpSearchRow {
  id: string;
  title: string;
  snippet: string;
  source_path: string;
  source_anchor: string | null;
  app_version: string;
  doc_version: string;
  last_updated_at: Date;
  indexed_at: Date;
}

@Injectable()
export class HelpSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleResolution: RoleResolutionService,
  ) {}

  /**
   * `entitlements` is the caller's already-resolved organisation entitlement
   * set (reuse of `CommercialEntitlementService.forOrganisation`), or
   * `null` when the request has no organisation context (e.g. a user who
   * belongs to none yet). A chunk gated by `minEntitlementKey` is excluded,
   * fail-closed, whenever that key cannot be shown to be granted — never
   * shown by default just because entitlement context is absent.
   */
  async search(
    rawQuery: string,
    principal: Principal,
    appVersion: string,
    entitlements: ResolvedEntitlements | null,
  ): Promise<readonly HelpSearchResult[]> {
    const query = rawQuery.trim();
    if (query === '') return [];

    const tiers = await this.roleResolution.globalGrantTiers(principal.subject);
    const defaultRank = TIER_RANK[DEFAULT_TIER] ?? 0;
    const ranks = tiers.map((tier) => TIER_RANK[tier] ?? defaultRank);
    const maxRank = ranks.length === 0 ? defaultRank : Math.max(...ranks);
    const allowedTiers = Object.entries(TIER_RANK)
      .filter(([, rank]) => rank <= maxRank)
      .map(([tier]) => tier);

    // Computed before the query, not after: a chunk gated by an entitlement
    // the caller lacks must never occupy one of the ranked `LIMIT` slots in
    // the first place, or it silently displaces a chunk the caller *could*
    // see — the same "filter inside the query, never after" rule applies to
    // entitlement gating as it does to role-tier gating above.
    const grantedEntitlementKeys = this.grantedBooleanEntitlementKeys(entitlements);

    const rows = await this.prisma.$queryRaw<HelpSearchRow[]>(Prisma.sql`
      WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS tsq)
      SELECT
        c.id,
        c.title,
        -- StartSel/StopSel blanked: the web client renders this as plain
        -- text, never as HTML, so there is nothing for ts_headline's
        -- default bold match-highlighting markup to be misused as.
        ts_headline(
          'english', c.body, q.tsq,
          'MaxFragments=1, MaxWords=35, MinWords=15, ShortWord=3, StartSel=, StopSel='
        ) AS snippet,
        c.source_path,
        c.source_anchor,
        s.app_version,
        s.doc_version,
        c.last_updated_at,
        c.indexed_at
      FROM documentation_chunk c
      JOIN documentation_snapshot s ON s.id = c.snapshot_id
      CROSS JOIN q
      WHERE s.app_version = ${appVersion}
        AND s.status = 'ACTIVE'
        AND c.min_role_tier IN (${Prisma.join(allowedTiers)})
        AND (
          c.min_entitlement_key IS NULL
          OR c.min_entitlement_key = ANY(${grantedEntitlementKeys}::text[])
        )
        AND c.search_vector @@ q.tsq
      ORDER BY ts_rank(c.search_vector, q.tsq) DESC
      LIMIT 20
    `);

    return rows.map((row) => ({
      chunkId: row.id,
      title: row.title,
      snippet: row.snippet,
      sourcePath: row.source_path,
      sourceAnchor: row.source_anchor,
      appVersion: row.app_version,
      docVersion: row.doc_version,
      lastUpdatedAt: row.last_updated_at.toISOString(),
      indexedAt: row.indexed_at.toISOString(),
    }));
  }

  /** Fail-closed: no organisation context (`entitlements === null`) grants nothing. */
  private grantedBooleanEntitlementKeys(entitlements: ResolvedEntitlements | null): string[] {
    if (entitlements === null) return [];
    const granted: string[] = [];
    for (const key of entitlements.keys()) {
      if (booleanEntitlementSafe(entitlements, key)) granted.push(key);
    }
    return granted;
  }
}

/** `booleanEntitlement` throws on a non-boolean key; a doc-gating key must simply not match. */
function booleanEntitlementSafe(entitlements: ResolvedEntitlements, key: string): boolean {
  try {
    return booleanEntitlement(entitlements, key);
  } catch {
    return false;
  }
}
