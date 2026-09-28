// @vitest-environment jsdom
/**
 * Behavioural coverage for `/records` — WEB-NEXT-01. Verifies the empty
 * state names what the object is, why to create one, and the real next
 * action (matching the what/why/next-action rubric already used across the
 * app's other empty states), and that a populated table links each record
 * to its real detail route rather than a placeholder.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RecordSummary } from '@witness/contracts';

import type * as ApiModule from '@/lib/api';

vi.mock('@/lib/session', () => {
  const stableUser = { name: 'Test User', role: 'contributor' as const };
  return { useSession: () => ({ user: stableUser, setUser: vi.fn(), ready: true }) };
});

const mockApi = {
  listRecords: vi.fn(async () => ({ records: [] as RecordSummary[] })),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, ...mockApi } };
});

const { default: RecordsPage } = await import('@/app/records/page');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RecordsPage — no records yet', () => {
  it('explains what a record is, why to capture one, and offers the real capture route', async () => {
    render(<RecordsPage />);

    expect(await screen.findByText(/no records yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/capture your first record to begin building institutional memory/i),
    ).toBeInTheDocument();

    const captureLinks = screen.getAllByRole('link', { name: /capture a record/i });
    expect(captureLinks.length).toBeGreaterThan(0);
    for (const link of captureLinks) {
      expect(link).toHaveAttribute('href', '/records/new');
    }
  });
});

describe('RecordsPage — populated', () => {
  it('links each record to its real detail route, not a placeholder', async () => {
    mockApi.listRecords.mockResolvedValueOnce({
      records: [
        {
          id: 'rec-1',
          title: 'Flood mitigation workshop minutes',
          reviewState: 'in_review',
          isInstitutionalRecord: false,
          sourceLabel: 'Session capture',
          capturedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    render(<RecordsPage />);

    const link = await screen.findByRole('link', { name: /flood mitigation workshop minutes/i });
    expect(link).toHaveAttribute('href', '/records/rec-1');
    expect(screen.queryByText(/no records yet/i)).not.toBeInTheDocument();
  });
});
