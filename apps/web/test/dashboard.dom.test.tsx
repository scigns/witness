// @vitest-environment jsdom
/**
 * Behavioural coverage for the authenticated home (`/`, `DashboardPage`) —
 * WEB-NEXT-01. Verifies product truth, not implementation trivia: the
 * signed-out splash shows exactly one sign-in path, an authenticated user
 * with no programmes sees an honest empty state (not a fabricated "getting
 * started" flow), and role-gated actions (Capture evidence) only appear for
 * roles that can actually capture.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserView } from '@witness/contracts';

import type * as ApiModule from '@/lib/api';

const mockAuth: {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'suspended' | 'deactivated' | 'error';
  currentUser: CurrentUserView | null;
} = { status: 'unauthenticated', currentUser: null };

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    status: mockAuth.status,
    currentUser: mockAuth.currentUser,
    errorMessage: null,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/lib/session', () => {
  // A stable reference, not a fresh literal per call: several pages depend
  // on `user` in an effect's dependency array, and a new object identity on
  // every render would retrigger those effects forever.
  const stableUser = { name: 'Test User', role: 'reader' as const };
  return { useSession: () => ({ user: stableUser, setUser: vi.fn(), ready: true }) };
});

const mockApi = {
  listRecords: vi.fn(async () => ({ records: [] })),
  listSessions: vi.fn(async () => ({ sessions: [] })),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, ...mockApi } };
});

const { default: DashboardPage } = await import('@/app/activity/page');

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

afterEach(() => {
  cleanup();
  mockApi.listRecords.mockClear();
  mockApi.listSessions.mockClear();
});

describe('DashboardPage — signed out', () => {
  it('shows exactly one sign-in path and no product data', () => {
    mockAuth.status = 'unauthenticated';
    mockAuth.currentUser = null;

    render(<DashboardPage />);

    expect(screen.getByRole('link', { name: /sign in to witness/i })).toHaveAttribute(
      'href',
      '/signin',
    );
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });
});

describe('DashboardPage — signed in, no programmes', () => {
  it('shows an honest empty state and no capture CTA', async () => {
    mockAuth.status = 'authenticated';
    mockAuth.currentUser = baseUser({ workspaces: [] });

    render(<DashboardPage />);

    expect(await screen.findByText(/no programs assigned yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /capture evidence/i })).not.toBeInTheDocument();
  });
});

describe('DashboardPage — signed in, with a capture-capable programme', () => {
  it('shows the programme and a role-gated capture CTA', async () => {
    mockAuth.status = 'authenticated';
    mockAuth.currentUser = baseUser({
      workspaces: [
        {
          id: 'ws-1',
          name: 'Coastal Resilience Programme',
          organisationId: 'org-1',
          description: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          version: 1,
          role: 'contributor',
        },
      ],
    });

    render(<DashboardPage />);

    expect(
      await screen.findByRole('link', { name: /coastal resilience programme/i }),
    ).toHaveAttribute('href', '/workspaces/ws-1');
    const captureLinks = screen.getAllByRole('link', { name: /capture evidence/i });
    expect(captureLinks.length).toBeGreaterThan(0);
    for (const link of captureLinks) {
      expect(link).toHaveAttribute('href', '/records/new');
    }
  });
});

describe('DashboardPage — signed in, reader-only role', () => {
  it('does not offer a capture CTA the role cannot use', async () => {
    mockAuth.status = 'authenticated';
    mockAuth.currentUser = baseUser({
      workspaces: [
        {
          id: 'ws-2',
          name: 'Community Listening',
          organisationId: 'org-1',
          description: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          version: 1,
          role: 'reader',
        },
      ],
    });

    render(<DashboardPage />);

    await screen.findByRole('link', { name: /community listening/i });
    expect(screen.queryByRole('link', { name: /capture evidence/i })).not.toBeInTheDocument();
  });
});
