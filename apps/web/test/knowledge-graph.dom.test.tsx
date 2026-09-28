// @vitest-environment jsdom
/**
 * Smoke coverage for the Knowledge Graph Explorer
 * (`/workspaces/[id]/knowledge/graph`) — WEB-NEXT-01. This is the one route
 * in `apps/web` with zero prior automated coverage of any kind. Scoped
 * deliberately: it does not drive a search/centre-on interaction (which
 * would load the real `cytoscape` canvas renderer — a rendering-library
 * concern, not this page's own logic) but does verify the page reaches its
 * real loaded state for a workspace, offers the accessible list view
 * alongside the canvas, and never silently drops into an error state for a
 * workspace that resolves successfully.
 */
import { Suspense } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserView, WorkspaceSummary } from '@witness/contracts';

import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/workspaces/ws-1/knowledge/graph',
}));

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
  const stableUser = { name: 'Steward', role: 'steward' as const };
  return { useSession: () => ({ user: stableUser, setUser: vi.fn(), ready: true }) };
});

const mockApi = {
  getWorkspace: vi.fn(),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, ...mockApi } };
});

const { default: GraphExplorerPage } = await import('@/app/workspaces/[id]/knowledge/graph/page');
const { ApiError } = await import('@/lib/api');

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

describe('GraphExplorerPage', () => {
  it('loads the workspace and offers both the canvas and the accessible list view', async () => {
    mockApi.getWorkspace.mockResolvedValueOnce(workspace);
    mockAuth.currentUser = {
      id: 'user-1',
      displayName: 'A Steward',
      email: 'steward@example.org',
      bio: null,
      accountState: 'active',
      organisations: [],
      workspaces: [{ ...workspace, role: 'steward' }],
    } as CurrentUserView;

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <GraphExplorerPage params={Promise.resolve({ id: 'ws-1' })} />
        </Suspense>,
      );
    });

    expect(await screen.findByRole('heading', { name: /^graph$/i })).toBeInTheDocument();
    expect(screen.getByText('Coastal Resilience Programme')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search for a concept to start from/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^graph$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list \(accessible\)/i })).toBeInTheDocument();
    expect(
      screen.getByText(/search for a concept above to start exploring its connections/i),
    ).toBeInTheDocument();
  });

  it('shows a real not-found state for a workspace id that does not resolve, not a silent blank page', async () => {
    mockApi.getWorkspace.mockRejectedValueOnce(
      new ApiError("That couldn't be found.", 404, 'NOT_FOUND'),
    );
    mockAuth.currentUser = {
      id: 'user-1',
      displayName: 'A Steward',
      email: 'steward@example.org',
      bio: null,
      accountState: 'active',
      organisations: [],
      workspaces: [],
    } as CurrentUserView;

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <GraphExplorerPage params={Promise.resolve({ id: 'missing' })} />
        </Suspense>,
      );
    });

    expect(await screen.findByText(/couldn.t be found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to programs/i })).toHaveAttribute(
      'href',
      '/workspaces',
    );
  });
});
