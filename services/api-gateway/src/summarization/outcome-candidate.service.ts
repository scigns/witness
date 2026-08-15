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
 * duplicate all of that for no reason.
 *
 * Async for the same reason `TranscriptService`/`SessionSummaryService`
 * are: CPU-bound local generation of a several-item JSON array reliably
 * takes longer than the ~100s a proxy in front of this deployment will hold
 * a connection open for (observed directly — the first version of this
 * endpoint answered synchronously and the browser saw a dead connection
 * before Ollama finished). The job itself is in memory, not the database —
 * losing an in-flight suggestion on a restart is fine, because nothing
 * about a candidate is meant to survive one; it is not a second persistence
 * layer for the same data, only a way to hand back a result that arrives
 * after the request that asked for it.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  OutcomeCandidateJobStatus,
  OutcomeCandidateJobView,
  OutcomeCandidateView,
  OutcomeType,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { ConcurrencyLimiter } from '../infrastructure/concurrency-limiter.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { LlmPort } from './llm.port.js';
import { assembleSessionSource, type SourceItem } from './source-assembly.helper.js';

const SOURCE_TEXT_MAX = 12_000;
const MAX_CANDIDATES = 10;
/** How long a finished (or failed) job's result stays fetchable before cleanup. */
const JOB_TTL_MS = 15 * 60 * 1000;

interface Job {
  status: OutcomeCandidateJobStatus;
  candidates: OutcomeCandidateView[] | null;
  failureReason: string | null;
  expiresAt: number;
}

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
  private readonly logger = new Logger(OutcomeCandidateService.name);
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
    private readonly llm: LlmPort,
    private readonly localInference: ConcurrencyLimiter,
  ) {}

  async request(workspaceId: string, sessionId: string): Promise<{ jobId: string }> {
    await this.requireSessionRow(workspaceId, sessionId);

    const jobId = randomUUID();
    this.jobs.set(jobId, {
      status: 'pending',
      candidates: null,
      failureReason: null,
      expiresAt: 0,
    });
    this.evictExpired();

    this.run(jobId, sessionId).catch((error: unknown) => {
      this.logger.error(
        `Unhandled error running outcome-candidate job '${jobId}': ` +
          (error instanceof Error ? error.message : String(error)),
      );
    });

    return { jobId };
  }

  getJob(jobId: string): OutcomeCandidateJobView {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new NotFoundException({
        error: { code: 'JOB_NOT_FOUND', message: `No candidate-suggestion job '${jobId}'.` },
      });
    }
    return { status: job.status, candidates: job.candidates, failureReason: job.failureReason };
  }

  private async run(jobId: string, sessionId: string): Promise<void> {
    try {
      const items = await assembleSessionSource(
        this.prisma,
        this.consentPolicy,
        sessionId,
        new Date(),
      );

      if (items.length === 0) {
        this.complete(jobId, []);
        return;
      }

      const result = await this.localInference.run(() => this.llm.complete(buildPrompt(items)));
      const parsed = parseCandidates(result.text);

      const candidates: OutcomeCandidateView[] = parsed.map((candidate) => {
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

      this.complete(jobId, candidates);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.jobs.set(jobId, {
        status: 'failed',
        candidates: null,
        failureReason: reason.slice(0, 2000),
        expiresAt: Date.now() + JOB_TTL_MS,
      });
    }
  }

  private complete(jobId: string, candidates: OutcomeCandidateView[]): void {
    this.jobs.set(jobId, {
      status: 'completed',
      candidates,
      failureReason: null,
      expiresAt: Date.now() + JOB_TTL_MS,
    });
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt !== 0 && job.expiresAt < now) this.jobs.delete(id);
    }
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
