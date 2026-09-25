import { describe, expect, it, vi } from 'vitest';

import { OperatorService } from './operator.service.js';

const past = new Date('2026-09-01T00:00:00.000Z');

function fixture() {
  const prisma = {
    transcript: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'transcript-1',
          failureReason: 'Ollama unreachable',
          updatedAt: past,
          evidence: {
            id: 'evidence-1',
            organisationId: 'org-1',
            workspaceId: 'workspace-1',
            sessionId: 'session-1',
            title: 'Interview recording',
            organisation: { name: 'Fiji Teachers Association' },
          },
        },
      ]),
    },
    sessionSummary: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    invitationNotification: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'notification-1',
          organisationId: 'org-1',
          recipientEmail: 'admin@fta.example',
          lastError: 'SMTP timeout',
          updatedAt: past,
          organisation: { name: 'Fiji Teachers Association' },
        },
      ]),
    },
    workspaceInvitation: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    invoice: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'invoice-1',
          organisationId: 'org-1',
          invoiceNumber: 'INV-0001',
          dueAt: past,
          statusChangedAt: past,
          organisation: { name: 'Fiji Teachers Association' },
        },
      ]),
    },
    payment: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { service: new OperatorService(prisma as never), prisma };
}

describe('OperatorService.health', () => {
  it('aggregates failures across transcription, summaries, email and settlement', async () => {
    const f = fixture();
    const result = await f.service.health();

    expect(result.transcription.count).toBe(1);
    expect(result.transcription.items[0]).toMatchObject({
      id: 'transcript-1',
      organisationId: 'org-1',
      organisationName: 'Fiji Teachers Association',
      reason: 'Ollama unreachable',
      linkEvidenceId: 'evidence-1',
    });

    expect(result.summaries.count).toBe(0);
    expect(result.summaries.items).toEqual([]);

    expect(result.email.count).toBe(1);
    expect(result.email.items[0]).toMatchObject({
      id: 'notification-1',
      detail: 'Organisation invitation to admin@fta.example',
      reason: 'SMTP timeout',
    });

    expect(result.settlement.count).toBe(1);
    expect(result.settlement.items[0]).toMatchObject({
      id: 'invoice-1',
      detail: 'Invoice INV-0001 overdue',
    });

    expect(f.prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN', dueAt: { lt: expect.any(Date) } } }),
    );
  });

  it('reports zero counts and empty items when nothing has failed', async () => {
    const f = fixture();
    for (const model of Object.values(f.prisma)) {
      model.count.mockResolvedValue(0);
      model.findMany.mockResolvedValue([]);
    }
    const result = await f.service.health();

    expect(result.transcription).toEqual({ count: 0, items: [] });
    expect(result.summaries).toEqual({ count: 0, items: [] });
    expect(result.email).toEqual({ count: 0, items: [] });
    expect(result.settlement).toEqual({ count: 0, items: [] });
  });
});
