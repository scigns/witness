/**
 * Shared source-material gathering for the two local-AI capabilities that
 * read a session's evidence (`SessionSummaryService`, `OutcomeCandidateService`).
 *
 * Every not-withdrawn evidence item, plus its completed transcript's
 * effective text when one exists, excluding any participant-linked item
 * where `ConsentPolicyService.mayProcessWithAi` refuses. That is an
 * exclusion, not a hard failure — one participant withholding AI-processing
 * consent must not block processing everyone else's contributions.
 */

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { ConsentPolicyService } from '../consent/consent-policy.service.js';

export interface SourceItem {
  readonly evidenceId: string;
  readonly text: string;
}

export async function assembleSessionSource(
  prisma: PrismaService,
  consentPolicy: ConsentPolicyService,
  sessionId: string,
  now: Date,
): Promise<SourceItem[]> {
  const rows = await prisma.evidence.findMany({
    where: { sessionId, withdrawnAt: null },
    include: { transcript: true },
    orderBy: { capturedAt: 'asc' },
  });

  const items: SourceItem[] = [];

  for (const row of rows) {
    if (row.sourceParticipantId !== null) {
      const consent = await consentPolicy.mayProcessWithAi(sessionId, row.sourceParticipantId, now);
      if (!consent.allowed) continue;
    }

    const segments = [`[${row.evidenceType}] ${row.title}: ${row.content}`];
    if (row.transcript !== null && row.transcript.status === 'completed') {
      const text = row.transcript.editedText ?? row.transcript.generatedText;
      if (text !== null && text.trim() !== '') {
        segments.push(`[transcript] ${text}`);
      }
    }

    items.push({ evidenceId: row.id, text: segments.join('\n') });
  }

  return items;
}
