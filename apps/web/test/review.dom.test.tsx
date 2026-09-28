// @vitest-environment jsdom
/**
 * Behavioural coverage for the cross-programme review queue (`/review`) —
 * WEB-NEXT-01. Verifies the three real branches the page distinguishes
 * (not a reviewer anywhere / reviewer but nothing pending / real pending
 * work) and that a listed item still routes through per-item authorization
 * exactly as the page's own doc comment promises, rather than granting
 * access itself.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserView, EvidenceSummary, WorkspaceSummary } from '@witness/contracts';

import type * as ApiModule from '@/lib/api';

const mockAuth: { currentUser: CurrentUserView | null } = { currentUser: null };

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    currentUser: mockAuth.currentUser,
    errorMessage: null,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/lib/session', () => {
  const stableUser = { name: 'Reviewer', role: 'reader' as const };
  return { useSession: () => ({ user: stableUser, setUser: vi.fn(), ready: true }) };
});

const mockApi = {
  listWorkspaces: vi.fn(async () => ({ workspaces: [] as WorkspaceSummary[] })),
  listSessions: vi.fn(async () => ({ sessions: [] })),
  listEvidence: vi.fn(async () => ({ evidence: [] as EvidenceSummary[] })),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, ...mockApi } };
});

const { default: CrossProgrammeReviewPage } = await import('@/app/review/page');

function baseUser(overrides: Partial<CurrentUserView> = {}): CurrentUserView {
  return {
    id: 'user-1',
    displayName: 'Mele Tupou',
    email: 'mele@example.org',
    bio: null,
    accountState: 'active',
    organisations: [],
    workspaces: [],
    ...overrides,
  } as CurrentUserView;
}

const workspace: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Coastal Resilience Programme',
  organisationId: 'org-1',
  description: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CrossProgrammeReviewPage — not a reviewer anywhere', () => {
  it('says so plainly and makes no evidence calls', async () => {
    mockAuth.currentUser = baseUser({
      workspaces: [{ ...workspace, role: 'contributor' }],
    });

    render(<CrossProgrammeReviewPage />);

    expect(
      await screen.findByText(/you're not a reviewer in any programme yet/i),
    ).toBeInTheDocument();
    expect(mockApi.listEvidence).not.toHaveBeenCalled();
  });
});

describe('CrossProgrammeReviewPage — reviewer, nothing pending', () => {
  it('shows the queue-empty message, not the no-reviewer message', async () => {
    mockAuth.currentUser = baseUser({ workspaces: [{ ...workspace, role: 'reviewer' }] });
    mockApi.listWorkspaces.mockResolvedValueOnce({ workspaces: [workspace] });
    mockApi.listSessions.mockResolvedValueOnce({
      sessions: [
        {
          id: 'sess-1',
          organisationId: 'org-1',
          workspaceId: 'ws-1',
          title: 'Workshop 1',
          sessionType: 'workshop',
          deliveryMode: 'in_person',
          status: 'closed',
          startAt: null,
          endAt: null,
          primaryFacilitatorId: 'user-2',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mockApi.listEvidence.mockResolvedValueOnce({ evidence: [] });

    render(<CrossProgrammeReviewPage />);

    expect(await screen.findByText(/nothing needs review right now/i)).toBeInTheDocument();
  });
});

describe('CrossProgrammeReviewPage — reviewer with pending evidence', () => {
  it('lists it and links to the per-item evidence route', async () => {
    mockAuth.currentUser = baseUser({ workspaces: [{ ...workspace, role: 'reviewer' }] });
    mockApi.listWorkspaces.mockResolvedValueOnce({ workspaces: [workspace] });
    mockApi.listSessions.mockResolvedValueOnce({
      sessions: [
        {
          id: 'sess-1',
          organisationId: 'org-1',
          workspaceId: 'ws-1',
          title: 'Workshop 1',
          sessionType: 'workshop',
          deliveryMode: 'in_person',
          status: 'closed',
          startAt: null,
          endAt: null,
          primaryFacilitatorId: 'user-2',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mockApi.listEvidence.mockResolvedValueOnce({
      evidence: [
        {
          id: 'ev-1',
          sessionId: 'sess-1',
          evidenceType: 'note',
          title: 'Concern about flooding access road',
          attributionMode: 'anonymous',
          identityVisibility: 'hidden',
          reviewStatus: 'submitted',
          verificationStatus: 'unverified',
          tags: [],
          capturedAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          withdrawn: false,
        },
      ],
    });

    render(<CrossProgrammeReviewPage />);

    const link = await screen.findByRole('link', { name: /concern about flooding access road/i });
    expect(link).toHaveAttribute('href', '/workspaces/ws-1/sessions/sess-1/evidence/ev-1');
  });
});
