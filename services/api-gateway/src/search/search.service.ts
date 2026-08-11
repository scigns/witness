/**
 * Simple, scoped search — "have we discussed this before?", not a
 * knowledge graph or a vector index (BUILD_ROADMAP.md Phase 6 explicitly
 * defers both). Plain case-insensitive substring matching across the text
 * columns of everything a session can produce, filtered to one workspace.
 *
 * Scope enforcement is the same mechanism every other nested route already
 * uses: `AuthorizationGuard.resolveScope` reads `workspaceId` from the
 * route and `RoleResolutionService.scopedGrantTiers` walks up to the
 * parent organisation for it, so a caller with no role in this workspace
 * (or its organisation) never reaches this service at all — there is no
 * cross-workspace query path here to separately deny (Phase 10's
 * "cross-workspace search denial" is this route simply never taking a
 * second workspace id).
 *
 * No separate privacy filter beyond what each source already enforces:
 * evidence excludes withdrawn rows and never exposes a restricted
 * participant identity (same projection `EvidenceService.toSummary` uses);
 * everything else is workspace-wide institutional content any of this
 * workspace's members can already read row-by-row — search only makes that
 * reachable in one query instead of several.
 */

import { Injectable } from '@nestjs/common';

import type { SearchResultType, SearchResultView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';

const RESULTS_PER_TYPE = 5;
const SNIPPET_CONTEXT_CHARS = 80;
const SNIPPET_FALLBACK_CHARS = 160;

function snippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const at = lower.indexOf(query.toLowerCase());
  if (at === -1) return text.slice(0, SNIPPET_FALLBACK_CHARS).trim();

  const start = Math.max(0, at - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, at + query.length + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(workspaceId: string, query: string): Promise<SearchResultView[]> {
    const insensitive = { contains: query, mode: 'insensitive' as const };

    const [sessions, evidenceRows, transcriptRows, summaryRows, decisions, commitments, actions] =
      await Promise.all([
        this.prisma.coDesignSession.findMany({
          where: { workspaceId, OR: [{ title: insensitive }, { purpose: insensitive }] },
          select: { id: true, title: true, purpose: true, status: true },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.evidence.findMany({
          where: {
            workspaceId,
            withdrawnAt: null,
            OR: [{ title: insensitive }, { content: insensitive }],
          },
          select: {
            id: true,
            sessionId: true,
            session: { select: { title: true } },
            title: true,
            content: true,
            reviewStatus: true,
          },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.transcript.findMany({
          where: {
            status: 'completed',
            OR: [{ generatedText: insensitive }, { editedText: insensitive }],
            evidence: { workspaceId },
          },
          select: {
            evidenceId: true,
            confirmed: true,
            generatedText: true,
            editedText: true,
            evidence: {
              select: { sessionId: true, title: true, session: { select: { title: true } } },
            },
          },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.sessionSummary.findMany({
          where: {
            status: 'completed',
            OR: [{ generatedText: insensitive }, { editedText: insensitive }],
            session: { workspaceId },
          },
          select: {
            sessionId: true,
            confirmed: true,
            generatedText: true,
            editedText: true,
            session: { select: { title: true } },
          },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.decision.findMany({
          where: { workspaceId, OR: [{ title: insensitive }, { statement: insensitive }] },
          select: {
            id: true,
            sessionId: true,
            session: { select: { title: true } },
            title: true,
            statement: true,
            status: true,
          },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.commitment.findMany({
          where: { workspaceId, OR: [{ title: insensitive }, { description: insensitive }] },
          select: {
            id: true,
            sessionId: true,
            session: { select: { title: true } },
            title: true,
            description: true,
            status: true,
          },
          take: RESULTS_PER_TYPE,
        }),
        this.prisma.actionItem.findMany({
          where: { workspaceId, OR: [{ title: insensitive }, { description: insensitive }] },
          select: {
            id: true,
            sessionId: true,
            session: { select: { title: true } },
            title: true,
            description: true,
            status: true,
          },
          take: RESULTS_PER_TYPE,
        }),
      ]);

    const results: SearchResultView[] = [
      ...sessions.map((row): SearchResultView => ({
        type: 'session' as SearchResultType,
        sessionId: row.id,
        sessionTitle: row.title,
        entityId: null,
        evidenceId: null,
        title: row.title,
        snippet: snippet(row.purpose, query),
        status: row.status,
        aiGenerated: false,
        confirmed: null,
      })),
      ...evidenceRows.map((row): SearchResultView => ({
        type: 'evidence' as SearchResultType,
        sessionId: row.sessionId,
        sessionTitle: row.session.title,
        entityId: row.id,
        evidenceId: row.id,
        title: row.title,
        snippet: snippet(row.content, query),
        status: row.reviewStatus,
        aiGenerated: false,
        confirmed: null,
      })),
      ...transcriptRows.map((row): SearchResultView => {
        const text = row.editedText ?? row.generatedText ?? '';
        return {
          type: 'transcript' as SearchResultType,
          sessionId: row.evidence.sessionId,
          sessionTitle: row.evidence.session.title,
          entityId: null,
          evidenceId: row.evidenceId,
          title: `Transcript of "${row.evidence.title}"`,
          snippet: snippet(text, query),
          status: 'completed',
          aiGenerated: true,
          confirmed: row.confirmed,
        };
      }),
      ...summaryRows.map((row): SearchResultView => {
        const text = row.editedText ?? row.generatedText ?? '';
        return {
          type: 'summary' as SearchResultType,
          sessionId: row.sessionId,
          sessionTitle: row.session.title,
          entityId: null,
          evidenceId: null,
          title: `Summary of "${row.session.title}"`,
          snippet: snippet(text, query),
          status: 'completed',
          aiGenerated: true,
          confirmed: row.confirmed,
        };
      }),
      ...decisions.map((row): SearchResultView => ({
        type: 'decision' as SearchResultType,
        sessionId: row.sessionId,
        sessionTitle: row.session.title,
        entityId: row.id,
        evidenceId: null,
        title: row.title,
        snippet: snippet(row.statement, query),
        status: row.status,
        aiGenerated: false,
        confirmed: null,
      })),
      ...commitments.map((row): SearchResultView => ({
        type: 'commitment' as SearchResultType,
        sessionId: row.sessionId,
        sessionTitle: row.session.title,
        entityId: row.id,
        evidenceId: null,
        title: row.title,
        snippet: snippet(row.description, query),
        status: row.status,
        aiGenerated: false,
        confirmed: null,
      })),
      ...actions.map((row): SearchResultView => ({
        type: 'action_item' as SearchResultType,
        sessionId: row.sessionId,
        sessionTitle: row.session.title,
        entityId: row.id,
        evidenceId: null,
        title: row.title,
        snippet: snippet(row.description, query),
        status: row.status,
        aiGenerated: false,
        confirmed: null,
      })),
    ];

    return results;
  }
}
