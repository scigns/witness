/**
 * API client.
 *
 * One place that knows how to reach the Witness API, so that adding real
 * authentication in Phase 2 is a change here rather than in every component.
 *
 * The `X-Witness-Dev-User` header is the Developer Preview's unverified stand-in
 * for authentication. It is sent from the browser deliberately: hiding it behind
 * a server proxy would make it look like a real session, and it is not one.
 */

import type {
  AddMembershipRequest,
  AssignRoleRequest,
  CreateOrganisationRequest,
  CreateRecordRequest,
  CreateUserRequest,
  CreateWorkspaceRequest,
  CurrentUserView,
  HealthResponse,
  MembershipAction,
  OrganisationMembershipView,
  OrganisationSummary,
  RecordDetail,
  RecordSummary,
  ReviewAction,
  RoleAssignmentView,
  RoleDefinition,
  UserSummary,
  WorkspaceMembershipView,
  WorkspaceSummary,
} from '@witness/contracts';

const BASE_URL = process.env['NEXT_PUBLIC_WITNESS_API_URL'] ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ActingUser {
  name: string;
  role: 'reader' | 'contributor' | 'reviewer' | 'admin';
}

async function request<T>(path: string, user: ActingUser | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (user !== null) {
    headers['X-Witness-Dev-User'] = `${user.name}|${user.role}`;
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      cache: 'no-store',
    });
  } catch {
    // A network failure and an API error are genuinely different problems with
    // different fixes, so they get different messages rather than one generic one.
    throw new ApiError(
      `Cannot reach the Witness API at ${BASE_URL}. Is it running? Try: make app`,
      0,
      'API_UNREACHABLE',
    );
  }

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `Request failed with status ${response.status}.`;

    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Response was not JSON. Keep the status-derived message.
    }

    throw new ApiError(message, response.status, code);
  }

  // A 204 (e.g. removing a role assignment) has no body — `response.json()`
  // would throw on it rather than return an absence.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  health: (): Promise<HealthResponse> => request<HealthResponse>('/ready', null),

  listRecords: (user: ActingUser): Promise<{ records: RecordSummary[] }> =>
    request<{ records: RecordSummary[] }>('/api/v1/records', user),

  getRecord: (id: string, user: ActingUser): Promise<RecordDetail> =>
    request<RecordDetail>(`/api/v1/records/${id}`, user),

  createRecord: (body: CreateRecordRequest, user: ActingUser): Promise<RecordDetail> =>
    request<RecordDetail>('/api/v1/records', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  review: (id: string, action: ReviewAction, user: ActingUser): Promise<RecordDetail> =>
    request<RecordDetail>(`/api/v1/records/${id}/review`, user, {
      method: 'POST',
      body: JSON.stringify(action),
    }),

  listOrganisations: (user: ActingUser): Promise<{ organisations: OrganisationSummary[] }> =>
    request<{ organisations: OrganisationSummary[] }>('/api/v1/organisations', user),

  createOrganisation: (
    body: CreateOrganisationRequest,
    user: ActingUser,
  ): Promise<OrganisationSummary> =>
    request<OrganisationSummary>('/api/v1/organisations', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listWorkspaces: (user: ActingUser): Promise<{ workspaces: WorkspaceSummary[] }> =>
    request<{ workspaces: WorkspaceSummary[] }>('/api/v1/workspaces', user),

  createWorkspace: (body: CreateWorkspaceRequest, user: ActingUser): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('/api/v1/workspaces', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listUsers: (user: ActingUser): Promise<{ users: UserSummary[] }> =>
    request<{ users: UserSummary[] }>('/api/v1/users', user),

  createUser: (body: CreateUserRequest, user: ActingUser): Promise<UserSummary> =>
    request<UserSummary>('/api/v1/users', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listOrganisationMemberships: (
    organisationId: string,
    user: ActingUser,
  ): Promise<{ memberships: OrganisationMembershipView[] }> =>
    request<{ memberships: OrganisationMembershipView[] }>(
      `/api/v1/organisations/${organisationId}/memberships`,
      user,
    ),

  addOrganisationMembership: (
    organisationId: string,
    body: AddMembershipRequest,
    user: ActingUser,
  ): Promise<OrganisationMembershipView> =>
    request<OrganisationMembershipView>(
      `/api/v1/organisations/${organisationId}/memberships`,
      user,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  transitionOrganisationMembership: (
    organisationId: string,
    membershipId: string,
    action: MembershipAction,
    user: ActingUser,
  ): Promise<OrganisationMembershipView> =>
    request<OrganisationMembershipView>(
      `/api/v1/organisations/${organisationId}/memberships/${membershipId}/status`,
      user,
      { method: 'POST', body: JSON.stringify(action) },
    ),

  listWorkspaceMemberships: (
    workspaceId: string,
    user: ActingUser,
  ): Promise<{ memberships: WorkspaceMembershipView[] }> =>
    request<{ memberships: WorkspaceMembershipView[] }>(
      `/api/v1/workspaces/${workspaceId}/memberships`,
      user,
    ),

  addWorkspaceMembership: (
    workspaceId: string,
    body: AddMembershipRequest,
    user: ActingUser,
  ): Promise<WorkspaceMembershipView> =>
    request<WorkspaceMembershipView>(`/api/v1/workspaces/${workspaceId}/memberships`, user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  transitionWorkspaceMembership: (
    workspaceId: string,
    membershipId: string,
    action: MembershipAction,
    user: ActingUser,
  ): Promise<WorkspaceMembershipView> =>
    request<WorkspaceMembershipView>(
      `/api/v1/workspaces/${workspaceId}/memberships/${membershipId}/status`,
      user,
      { method: 'POST', body: JSON.stringify(action) },
    ),

  listRoles: (user: ActingUser): Promise<{ roles: RoleDefinition[] }> =>
    request<{ roles: RoleDefinition[] }>('/api/v1/roles', user),

  getOrganisationRoleAssignment: (
    organisationId: string,
    membershipId: string,
    user: ActingUser,
  ): Promise<RoleAssignmentView> =>
    request<RoleAssignmentView>(
      `/api/v1/organisations/${organisationId}/memberships/${membershipId}/role`,
      user,
    ),

  assignOrganisationRole: (
    organisationId: string,
    membershipId: string,
    body: AssignRoleRequest,
    user: ActingUser,
  ): Promise<RoleAssignmentView> =>
    request<RoleAssignmentView>(
      `/api/v1/organisations/${organisationId}/memberships/${membershipId}/role`,
      user,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  removeOrganisationRole: (
    organisationId: string,
    membershipId: string,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(
      `/api/v1/organisations/${organisationId}/memberships/${membershipId}/role`,
      user,
      {
        method: 'DELETE',
      },
    ),

  getWorkspaceRoleAssignment: (
    workspaceId: string,
    membershipId: string,
    user: ActingUser,
  ): Promise<RoleAssignmentView> =>
    request<RoleAssignmentView>(
      `/api/v1/workspaces/${workspaceId}/memberships/${membershipId}/role`,
      user,
    ),

  assignWorkspaceRole: (
    workspaceId: string,
    membershipId: string,
    body: AssignRoleRequest,
    user: ActingUser,
  ): Promise<RoleAssignmentView> =>
    request<RoleAssignmentView>(
      `/api/v1/workspaces/${workspaceId}/memberships/${membershipId}/role`,
      user,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  removeWorkspaceRole: (
    workspaceId: string,
    membershipId: string,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(`/api/v1/workspaces/${workspaceId}/memberships/${membershipId}/role`, user, {
      method: 'DELETE',
    }),
};

/**
 * The real, signed-in session (BUILD_ROADMAP.md Milestone 1.3) — separate
 * from `api` above, which sends the Developer Preview's unverified
 * `X-Witness-Dev-User` header. These calls send a verified bearer session
 * token instead, and never touch that header.
 */
export const authApi = {
  /** Where the browser navigates to start a real sign-in. Not a fetch — a full-page redirect. */
  loginUrl: (): string => `${BASE_URL}/api/v1/auth/login`,

  me: async (sessionToken: string): Promise<CurrentUserView> => {
    const response = await fetch(`${BASE_URL}/api/v1/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new ApiError(
        `Session is not valid (HTTP ${response.status}).`,
        response.status,
        'UNAUTHENTICATED',
      );
    }

    return (await response.json()) as CurrentUserView;
  },

  logout: async (sessionToken: string): Promise<void> => {
    try {
      await fetch(`${BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
    } catch {
      // Sign-out is a local action first (the token is discarded client-side
      // regardless) — a network failure here must not trap the user in a
      // signed-in-looking state they cannot leave.
    }
  },
};
