/**
 * Candidate decisions, commitments and actions, suggested by the local
 * model from a session's evidence and transcripts.
 *
 * Deliberately not a persisted aggregate — there is no `OutcomeCandidate`
 * table, no lifecycle, no audit trail here. A candidate is a suggestion the
 * caller may act on or discard; "acting on it" means calling the existing
 * `outcome:create` endpoints (`ProposeDecisionRequest` etc.) the same way a
 * human typing from scratch would, which is where the real domain
 * invariants, the audit trail, and the human-confirmation gate already
 * live. Inventing a second, AI-specific outcome model to hold a draft would
 * duplicate all of that for no reason — the instruction this milestone
 * follows is "reuse the existing outcome domain model," and the smallest
 * way to do that is to not create a new one at all.
 */

import { Injectable, NotFoundException } from '@nestjs/common';

import type { OutcomeCandidateView, OutcomeType } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { LlmPort } from './llm.port.js';
import { assembleSessionSource, type SourceItem } from './source-assembly.helper.js';

const SOURCE_TEXT_MAX = 12_000;
const MAX_CANDIDATES = 10;

interface RawCandidate {
  type: OutcomeType;
  title: string;
  description: string;
  ownerDescription: string | null;
  sourceIndex: number | null;
}

function parseCandidates(raw: string): RawCandidate[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];

  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const results: RawCandidate[] = [];
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const type = record['type'];
    if (type !== 'decision' && type !== 'commitment' && type !== 'action_item') continue;

    const title = typeof record['title'] === 'string' ? record['title'].trim() : '';
    const description =
      typeof record['description'] === 'string' ? record['description'].trim() : '';
    if (title === '' || description === '') continue;

    const ownerDescriptionRaw = record['ownerDescription'];
    const ownerDescription =
      typeof ownerDescriptionRaw === 'string' && ownerDescriptionRaw.trim() !== ''
        ? ownerDescriptionRaw.trim()
        : null;

    const sourceIndexRaw = record['sourceIndex'];
    const sourceIndex = typeof sourceIndexRaw === 'number' ? sourceIndexRaw : null;

    results.push({ type, title, description, ownerDescription, sourceIndex });
  }

  return results.slice(0, MAX_CANDIDATES);
}

function buildPrompt(items: readonly SourceItem[]): string {
  const numbered = items
    .map((item, index) => `[${index}] ${item.text}`)
    .join('\n\n')
    .slice(0, SOURCE_TEXT_MAX);

  return (
    'You are extracting candidate decisions, commitments, and action items from workshop ' +
    'session notes. Output ONLY a JSON array, with no other text before or after it. Each ' +
    'element must have exactly these fields: "type" (one of "decision", "commitment", ' +
    '"action_item"), "title" (a short title, under 15 words), "description" (one or two ' +
    'sentences), "ownerDescription" (who is responsible, or null if the text does not say), ' +
    'and "sourceIndex" (the bracketed number of the source item that most directly supports ' +
    'this candidate). Only include an item when the source text clearly and confidently ' +
    'supports it — do not invent decisions, commitments, or actions the text does not ' +
    'contain. If nothing qualifies, output exactly [].\n\n' +
    'Example: [{"type":"decision","title":"Launch the new intake process","description":' +
    '"The group decided to launch the new intake process next month.",' +
    '"ownerDescription":null,"sourceIndex":0}]\n\n' +
    `Source items:\n${numbered}`
  );
}

@Injectable()
export class OutcomeCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
    private readonly llm: LlmPort,
  ) {}

  async suggest(workspaceId: string, sessionId: string): Promise<OutcomeCandidateView[]> {
    await this.requireSessionRow(workspaceId, sessionId);

    const items = await assembleSessionSource(
      this.prisma,
      this.consentPolicy,
      sessionId,
      new Date(),
    );
    if (items.length === 0) return [];

    const result = await this.llm.complete(buildPrompt(items));
    const parsed = parseCandidates(result.text);

    return parsed.map((candidate) => {
      const source = candidate.sourceIndex !== null ? items[candidate.sourceIndex] : undefined;
      return {
        type: candidate.type,
        title: candidate.title,
        description: candidate.description,
        ownerDescription: candidate.ownerDescription,
        sourceEvidenceId: source?.evidenceId ?? null,
        model: result.model,
      };
    });
  }

  private async requireSessionRow(workspaceId: string, sessionId: string): Promise<void> {
    const row = await this.prisma.coDesignSession.findUnique({
      where: { id: sessionId },
      select: { workspaceId: true },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `No co-design session '${sessionId}' in workspace '${workspaceId}'.`,
        },
      });
    }
  }
}
