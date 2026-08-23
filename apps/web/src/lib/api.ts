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
  AgendaItemTransitionRequest,
  AgendaItemView,
  CreateAgendaItemRequest,
  CreateFileResourceMetadata,
  CreateLinkResourceRequest,
  ReorderAgendaItemRequest,
  ResourceView,
  UpdateAgendaItemRequest,
  AddSessionParticipantRequest,
  AssignReviewerRequest,
  AssignRoleRequest,
  CancelReviewAssignmentRequest,
  CaptureParticipantConsentRequest,
  ClarificationView,
  CoDesignSessionDetail,
  CoDesignSessionSummary,
  ConfigureSessionConsentRequest,
  ConsentFacilitatorDashboardView,
  ConsentTemplateAction,
  ConsentTemplateDetail,
  ConsentTemplateSummary,
  CaptureEvidenceRequest,
  CorrectEvidenceRequest,
  CreateCoDesignSessionRequest,
  CreateConsentTemplateRequest,
  CreateConsentTemplateVersionRequest,
  CreateEvidenceLinkRequest,
  CreateOrganisationRequest,
  UpdateStorageQuotaRequest,
  CreateRecordRequest,
  CreateUserRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  UpdateOwnProfileRequest,
  CurrentUserView,
  EditSummaryRequest,
  EditTranscriptRequest,
  EvidenceAttachmentView,
  EvidenceDetail,
  EvidenceLinkView,
  EvidenceReviewActionRequest,
  EvidenceSummary,
  EvidenceTransitionRequest,
  HealthResponse,
  InviteOrganisationUserRequest,
  MembershipAction,
  OrganisationInvitationView,
  SessionSummaryView,
  TranscriptVersionRequest,
  TranscriptView,
  OrganisationMembershipView,
  OrganisationStorageUsage,
  OrganisationUsage,
  OrganisationSummary,
  OutcomeCandidateJobView,
  ParticipantConsentRecordDetail,
  SearchResultView,
  ReassignReviewerRequest,
  ReconfigureSessionConsentRequest,
  RecordDetail,
  RecordSummary,
  RequestClarificationRequest,
  RespondToClarificationRequest,
  ReviewAction,
  ReviewAssignmentView,
  RoleAssignmentView,
  RoleDefinition,
  SessionConsentConfigurationView,
  SessionLifecycleEventView,
  SessionParticipantDetail,
  SessionParticipantSummary,
  SessionParticipantTransitionRequest,
  SessionTransitionRequest,
  UpdateCoDesignSessionRequest,
  UpdateEvidenceDraftRequest,
  UpdateParticipantNotesRequest,
  UpdateSessionParticipantRequest,
  UserSummary,
  WithdrawClarificationRequest,
  WithdrawParticipantConsentRequest,
  WorkspaceMembershipView,
  WorkspaceSummary,
  ActionItemDetail,
  ActionItemSummary,
  ActionItemTransitionRequest,
  CommitmentDetail,
  CommitmentSummary,
  CommitmentTransitionRequest,
  CreateActionItemRequest,
  CreateReportRequest,
  IncludeReportSourceRequest,
  RenderedReport,
  ReportDetail,
  ReportExportFormat,
  ReportSourceView,
  ReportSummary,
  ReportTransitionRequest,
  UpdateReportRequest,
  DecisionDetail,
  DecisionSummary,
  DecisionTransitionRequest,
  OutcomeSupportView,
  ProposeCommitmentRequest,
  ProposeDecisionRequest,
  RecordOutcomeSupportRequest,
  UpdateActionItemRequest,
  UpdateCommitmentRequest,
  UpdateDecisionRequest,
} from '@witness/contracts';

const BASE_URL = process.env['NEXT_PUBLIC_WITNESS_API_URL'] ?? 'http://localhost:3001';

/**
 * Which deployment this bundle was built for, mirroring the API's
 * `WITNESS_DEPLOYMENT_PROFILE`. Set from `NEXT_PUBLIC_WITNESS_PROFILE` through
 * `next.config.mjs`'s `env` block, which inlines one value into both the server
 * render and the client bundle — a deployed frontend is already built
 * per-environment because the API URL has to be.
 *
 * It gates one thing: whether the unverified `X-Witness-Dev-User` header may
 * be sent at all. Defaulting to `development` keeps `pnpm dev` working with no
 * new setup; a deployment that forgets to set it gets a frontend that sends
 * the header, which the API refuses and CORS refuses before that — a loud
 * failure rather than a quiet one.
 */
const DEPLOYMENT_PROFILE = process.env.WITNESS_BUILD_PROFILE ?? 'development';

export const IS_DEVELOPMENT_BUILD = DEPLOYMENT_PROFILE === 'development';

/**
 * Shared with `lib/auth.tsx`, which owns the lifecycle of this value. Read
 * directly here because `request` is a plain function called from server-ish
 * and client code alike, and threading a React context through every call site
 * would change several hundred lines to move one header.
 */
const SESSION_TOKEN_STORAGE_KEY = 'witness.auth.sessionToken';

function sessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). No session
    // is a valid answer; a thrown exception here is not.
    return null;
  }
}

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

/**
 * A real signed-in session always wins. The dev header is a stand-in for one,
 * and sending both would let the two disagree about who is acting. Shared by
 * every request helper below, including the two (`requestMultipart`,
 * `requestBlob`) that cannot go through `request()` itself because it always
 * sends JSON.
 */
function authHeaders(user: ActingUser | null): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = sessionToken();

  if (token !== null) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (user !== null && IS_DEVELOPMENT_BUILD) {
    headers['X-Witness-Dev-User'] = `${user.name}|${user.role}`;
  }

  return headers;
}

/**
 * Only used when the server's response carries no structured `error.message`
 * of its own (a proxy error, an unhandled crash, a non-JSON body) — the
 * normal case always has a plain-language message from the API itself. A raw
 * HTTP status code is not a sentence a facilitator should have to read.
 */
function fallbackErrorMessage(status: number): string {
  if (status === 401) return 'You need to sign in again to do that.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found.";
  if (status === 409) return 'That was changed by someone else — reload the page and try again.';
  if (status === 429) return 'Too many requests — wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on the server. Try again in a moment.';
  return 'Something went wrong.';
}

async function throwOnError(response: Response): Promise<void> {
  if (response.ok) return;

  let code = 'UNKNOWN';
  let message = fallbackErrorMessage(response.status);

  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // Response was not JSON. Keep the status-derived message.
  }

  throw new ApiError(message, response.status, code);
}

async function request<T>(path: string, user: ActingUser | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(user),
  };

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

  await throwOnError(response);

  // A 204 (e.g. removing a role assignment) has no body — `response.json()`
  // would throw on it rather than return an absence.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * For a multipart body (a file upload): unlike `request()`, this must NOT
 * set `Content-Type` itself — `fetch` sets it from the `FormData` instance,
 * including the multipart boundary, and a manually-set header here would be
 * missing that boundary and break parsing on the server.
 */
async function requestMultipart<T>(
  path: string,
  user: ActingUser | null,
  formData: FormData,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(user),
      body: formData,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      `Cannot reach the Witness API at ${BASE_URL}. Is it running? Try: make app`,
      0,
      'API_UNREACHABLE',
    );
  }

  await throwOnError(response);
  return (await response.json()) as T;
}

/** For a binary response (an attachment's bytes) — everything else expects JSON. */
async function requestBlob(path: string, user: ActingUser | null): Promise<Blob> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, { headers: authHeaders(user), cache: 'no-store' });
  } catch {
    throw new ApiError(
      `Cannot reach the Witness API at ${BASE_URL}. Is it running? Try: make app`,
      0,
      'API_UNREACHABLE',
    );
  }

  await throwOnError(response);
  return response.blob();
}

/**
 * The three outcome registers share a support sub-resource, so the register
 * name is part of the path rather than a discriminator in the body.
 */
export type OutcomeRegister = 'decisions' | 'commitments' | 'actions';

function outcomePath(workspaceId: string, sessionId: string, register: OutcomeRegister): string {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/${register}`;
}

function reportPath(workspaceId: string, sessionId: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/reports`;
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

  getOrganisationStorage: (
    organisationId: string,
    user: ActingUser,
  ): Promise<OrganisationStorageUsage> =>
    request<OrganisationStorageUsage>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/storage`,
      user,
    ),

  getOrganisationUsage: (organisationId: string, user: ActingUser): Promise<OrganisationUsage> =>
    request<OrganisationUsage>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/usage`,
      user,
    ),

  updateStorageQuota: (
    organisationId: string,
    body: UpdateStorageQuotaRequest,
    user: ActingUser,
  ): Promise<OrganisationStorageUsage> =>
    request<OrganisationStorageUsage>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/storage-quota`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  listWorkspaces: (user: ActingUser): Promise<{ workspaces: WorkspaceSummary[] }> =>
    request<{ workspaces: WorkspaceSummary[] }>('/api/v1/workspaces', user),

  getWorkspace: (workspaceId: string, user: ActingUser): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, user),

  createWorkspace: (body: CreateWorkspaceRequest, user: ActingUser): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('/api/v1/workspaces', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateWorkspace: (
    workspaceId: string,
    body: UpdateWorkspaceRequest,
    user: ActingUser,
  ): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, user, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listUsers: (user: ActingUser): Promise<{ users: UserSummary[] }> =>
    request<{ users: UserSummary[] }>('/api/v1/users', user),

  createUser: (body: CreateUserRequest, user: ActingUser): Promise<UserSummary> =>
    request<UserSummary>('/api/v1/users', user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  inviteOrganisationUser: (
    organisationId: string,
    body: InviteOrganisationUserRequest,
    user: ActingUser,
  ): Promise<OrganisationInvitationView> =>
    request<OrganisationInvitationView>(`/api/v1/organisations/${organisationId}/users`, user, {
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

  listSessions: (
    workspaceId: string,
    user: ActingUser,
  ): Promise<{ sessions: CoDesignSessionSummary[] }> =>
    request<{ sessions: CoDesignSessionSummary[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
      user,
    ),

  getSession: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<CoDesignSessionDetail> =>
    request<CoDesignSessionDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
      user,
    ),

  createSession: (
    workspaceId: string,
    body: CreateCoDesignSessionRequest,
    user: ActingUser,
  ): Promise<CoDesignSessionDetail> =>
    request<CoDesignSessionDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  updateSession: (
    workspaceId: string,
    sessionId: string,
    body: UpdateCoDesignSessionRequest,
    user: ActingUser,
  ): Promise<CoDesignSessionDetail> =>
    request<CoDesignSessionDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  transitionSession: (
    workspaceId: string,
    sessionId: string,
    body: SessionTransitionRequest,
    user: ActingUser,
  ): Promise<CoDesignSessionDetail> =>
    request<CoDesignSessionDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/transition`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getSessionHistory: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ events: SessionLifecycleEventView[] }> =>
    request<{ events: SessionLifecycleEventView[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/history`,
      user,
    ),

  listParticipants: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ participants: SessionParticipantSummary[] }> =>
    request<{ participants: SessionParticipantSummary[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants`,
      user,
    ),

  getParticipant: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    user: ActingUser,
  ): Promise<SessionParticipantDetail> =>
    request<SessionParticipantDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`,
      user,
    ),

  getParticipantHistory: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    user: ActingUser,
  ): Promise<{ events: SessionLifecycleEventView[] }> =>
    request<{ events: SessionLifecycleEventView[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/history`,
      user,
    ),

  exportParticipants: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ participants: SessionParticipantSummary[] }> =>
    request<{ participants: SessionParticipantSummary[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/export`,
      user,
    ),

  addParticipant: (
    workspaceId: string,
    sessionId: string,
    body: AddSessionParticipantRequest,
    user: ActingUser,
  ): Promise<SessionParticipantDetail> =>
    request<SessionParticipantDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  updateParticipant: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: UpdateSessionParticipantRequest,
    user: ActingUser,
  ): Promise<SessionParticipantDetail> =>
    request<SessionParticipantDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  updateParticipantNotes: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: UpdateParticipantNotesRequest,
    user: ActingUser,
  ): Promise<SessionParticipantDetail> =>
    request<SessionParticipantDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/notes`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  transitionParticipant: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: SessionParticipantTransitionRequest,
    user: ActingUser,
  ): Promise<SessionParticipantDetail> =>
    request<SessionParticipantDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/transition`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listConsentTemplates: (
    organisationId: string,
    user: ActingUser,
  ): Promise<{ templates: ConsentTemplateSummary[] }> =>
    request<{ templates: ConsentTemplateSummary[] }>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates`,
      user,
    ),

  getConsentTemplate: (
    organisationId: string,
    templateId: string,
    user: ActingUser,
  ): Promise<ConsentTemplateDetail> =>
    request<ConsentTemplateDetail>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates/${encodeURIComponent(templateId)}`,
      user,
    ),

  getConsentTemplateVersions: (
    organisationId: string,
    templateId: string,
    user: ActingUser,
  ): Promise<{ versions: ConsentTemplateDetail[] }> =>
    request<{ versions: ConsentTemplateDetail[] }>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates/${encodeURIComponent(templateId)}/versions`,
      user,
    ),

  createConsentTemplate: (
    organisationId: string,
    body: CreateConsentTemplateRequest,
    user: ActingUser,
  ): Promise<ConsentTemplateDetail> =>
    request<ConsentTemplateDetail>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  createConsentTemplateVersion: (
    organisationId: string,
    templateId: string,
    body: CreateConsentTemplateVersionRequest,
    user: ActingUser,
  ): Promise<ConsentTemplateDetail> =>
    request<ConsentTemplateDetail>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates/${encodeURIComponent(templateId)}/versions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  applyConsentTemplateAction: (
    organisationId: string,
    templateId: string,
    body: ConsentTemplateAction,
    user: ActingUser,
  ): Promise<ConsentTemplateDetail> =>
    request<ConsentTemplateDetail>(
      `/api/v1/organisations/${encodeURIComponent(organisationId)}/consent-templates/${encodeURIComponent(templateId)}/actions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getSessionConsentConfiguration: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<SessionConsentConfigurationView> =>
    request<SessionConsentConfigurationView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/consent-configuration`,
      user,
    ),

  configureSessionConsent: (
    workspaceId: string,
    sessionId: string,
    body: ConfigureSessionConsentRequest,
    user: ActingUser,
  ): Promise<SessionConsentConfigurationView> =>
    request<SessionConsentConfigurationView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/consent-configuration`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  reconfigureSessionConsent: (
    workspaceId: string,
    sessionId: string,
    body: ReconfigureSessionConsentRequest,
    user: ActingUser,
  ): Promise<SessionConsentConfigurationView> =>
    request<SessionConsentConfigurationView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/consent-configuration`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  getConsentDashboard: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<ConsentFacilitatorDashboardView> =>
    request<ConsentFacilitatorDashboardView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/consent-dashboard`,
      user,
    ),

  getActiveParticipantConsent: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    user: ActingUser,
  ): Promise<ParticipantConsentRecordDetail> =>
    request<ParticipantConsentRecordDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/consent`,
      user,
    ),

  getParticipantConsentHistory: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    user: ActingUser,
  ): Promise<{ records: ParticipantConsentRecordDetail[] }> =>
    request<{ records: ParticipantConsentRecordDetail[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/consent/history`,
      user,
    ),

  captureParticipantConsent: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: CaptureParticipantConsentRequest,
    user: ActingUser,
  ): Promise<ParticipantConsentRecordDetail> =>
    request<ParticipantConsentRecordDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/consent`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  amendParticipantConsent: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: CaptureParticipantConsentRequest,
    user: ActingUser,
  ): Promise<ParticipantConsentRecordDetail> =>
    request<ParticipantConsentRecordDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/consent/amend`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  withdrawParticipantConsent: (
    workspaceId: string,
    sessionId: string,
    participantId: string,
    body: WithdrawParticipantConsentRequest,
    user: ActingUser,
  ): Promise<ParticipantConsentRecordDetail> =>
    request<ParticipantConsentRecordDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/consent/withdraw`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listEvidence: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
    filter?: { reviewStatus?: string; evidenceType?: string },
  ): Promise<{ evidence: EvidenceSummary[] }> => {
    const query = new URLSearchParams();
    if (filter?.reviewStatus !== undefined) query.set('reviewStatus', filter.reviewStatus);
    if (filter?.evidenceType !== undefined) query.set('evidenceType', filter.evidenceType);
    const queryString = query.toString();
    return request<{ evidence: EvidenceSummary[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence${queryString === '' ? '' : `?${queryString}`}`,
      user,
    );
  },

  getEvidence: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request<EvidenceDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}`,
      user,
    ),

  getEvidenceHistory: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<{
    events: { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[];
  }> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/history`,
      user,
    ),

  captureEvidence: (
    workspaceId: string,
    sessionId: string,
    body: CaptureEvidenceRequest,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request<EvidenceDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  updateEvidenceDraft: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: UpdateEvidenceDraftRequest,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request<EvidenceDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  transitionEvidence: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: EvidenceTransitionRequest,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request<EvidenceDetail>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transition`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  uploadEvidenceAttachment: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    file: File,
    user: ActingUser,
  ): Promise<EvidenceAttachmentView> => {
    const formData = new FormData();
    formData.set('file', file);
    return requestMultipart<EvidenceAttachmentView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/attachment`,
      user,
      formData,
    );
  },

  getEvidenceAttachmentBlob: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<Blob> =>
    requestBlob(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/attachment/content`,
      user,
    ),

  requestTranscript: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<TranscriptView> =>
    request<TranscriptView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transcript`,
      user,
      { method: 'POST' },
    ),

  retryTranscript: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<TranscriptView> =>
    request<TranscriptView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transcript/retry`,
      user,
      { method: 'POST' },
    ),

  getTranscript: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<TranscriptView> =>
    request<TranscriptView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transcript`,
      user,
    ),

  editTranscript: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: EditTranscriptRequest,
    user: ActingUser,
  ): Promise<TranscriptView> =>
    request<TranscriptView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transcript`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  confirmTranscript: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: TranscriptVersionRequest,
    user: ActingUser,
  ): Promise<TranscriptView> =>
    request<TranscriptView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/transcript/confirm`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  requestSummary: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<SessionSummaryView> =>
    request<SessionSummaryView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
      user,
      { method: 'POST' },
    ),

  retrySummary: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<SessionSummaryView> =>
    request<SessionSummaryView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summary/retry`,
      user,
      { method: 'POST' },
    ),

  getSummary: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<SessionSummaryView> =>
    request<SessionSummaryView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
      user,
    ),

  editSummary: (
    workspaceId: string,
    sessionId: string,
    body: EditSummaryRequest,
    user: ActingUser,
  ): Promise<SessionSummaryView> =>
    request<SessionSummaryView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summary`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  confirmSummary: (
    workspaceId: string,
    sessionId: string,
    body: TranscriptVersionRequest,
    user: ActingUser,
  ): Promise<SessionSummaryView> =>
    request<SessionSummaryView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summary/confirm`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listEvidenceLinks: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<{ links: EvidenceLinkView[] }> =>
    request<{ links: EvidenceLinkView[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/links`,
      user,
    ),

  createEvidenceLink: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: CreateEvidenceLinkRequest,
    user: ActingUser,
  ): Promise<EvidenceLinkView> =>
    request<EvidenceLinkView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/links`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  removeEvidenceLink: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    linkId: string,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/links/${encodeURIComponent(linkId)}`,
      user,
      { method: 'DELETE' },
    ),

  // ─── Evidence review and validation (BUILD_ROADMAP.md Milestone 6) ────────

  getReviewAssignment: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<{ assignment: ReviewAssignmentView | null }> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/assignment`,
      user,
    ),

  assignReviewer: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: AssignReviewerRequest,
    user: ActingUser,
  ): Promise<ReviewAssignmentView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/assignment`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  reassignReviewer: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    assignmentId: string,
    body: ReassignReviewerRequest,
    user: ActingUser,
  ): Promise<ReviewAssignmentView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/assignment/${encodeURIComponent(assignmentId)}/reassign`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  cancelReviewAssignment: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    assignmentId: string,
    body: CancelReviewAssignmentRequest,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/assignment/${encodeURIComponent(assignmentId)}/cancel`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  reviewAction: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: EvidenceReviewActionRequest,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/actions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  correctEvidence: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: CorrectEvidenceRequest,
    user: ActingUser,
  ): Promise<EvidenceDetail> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/correction`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listClarifications: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    user: ActingUser,
  ): Promise<{ clarifications: ClarificationView[] }> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/clarifications`,
      user,
    ),

  requestClarification: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    body: RequestClarificationRequest,
    user: ActingUser,
  ): Promise<ClarificationView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/clarifications`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  respondToClarification: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    body: RespondToClarificationRequest,
    user: ActingUser,
  ): Promise<ClarificationView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/clarifications/${encodeURIComponent(clarificationId)}/respond`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  withdrawClarification: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    body: WithdrawClarificationRequest,
    user: ActingUser,
  ): Promise<ClarificationView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/clarifications/${encodeURIComponent(clarificationId)}/withdraw`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  closeClarification: (
    workspaceId: string,
    sessionId: string,
    evidenceId: string,
    clarificationId: string,
    user: ActingUser,
  ): Promise<ClarificationView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/evidence/${encodeURIComponent(evidenceId)}/review/clarifications/${encodeURIComponent(clarificationId)}/close`,
      user,
      { method: 'POST' },
    ),

  // ─── Decisions, commitments and actions (BUILD_ROADMAP.md Milestone 7) ────

  listDecisions: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ decisions: DecisionSummary[] }> =>
    request(outcomePath(workspaceId, sessionId, 'decisions'), user),

  getDecision: (
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    user: ActingUser,
  ): Promise<DecisionDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'decisions')}/${encodeURIComponent(decisionId)}`,
      user,
    ),

  search: (
    workspaceId: string,
    query: string,
    user: ActingUser,
  ): Promise<{ results: SearchResultView[] }> =>
    request<{ results: SearchResultView[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/search?q=${encodeURIComponent(query)}`,
      user,
    ),

  requestOutcomeCandidates: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ jobId: string }> =>
    request<{ jobId: string }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/outcome-candidates`,
      user,
      { method: 'POST' },
    ),

  getOutcomeCandidateJob: (
    workspaceId: string,
    sessionId: string,
    jobId: string,
    user: ActingUser,
  ): Promise<OutcomeCandidateJobView> =>
    request<OutcomeCandidateJobView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/outcome-candidates/${encodeURIComponent(jobId)}`,
      user,
    ),

  proposeDecision: (
    workspaceId: string,
    sessionId: string,
    body: ProposeDecisionRequest,
    user: ActingUser,
  ): Promise<DecisionDetail> =>
    request(outcomePath(workspaceId, sessionId, 'decisions'), user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateDecision: (
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    body: UpdateDecisionRequest,
    user: ActingUser,
  ): Promise<DecisionDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'decisions')}/${encodeURIComponent(decisionId)}`,
      user,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ),

  transitionDecision: (
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    body: DecisionTransitionRequest,
    user: ActingUser,
  ): Promise<DecisionDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'decisions')}/${encodeURIComponent(decisionId)}/transitions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listCommitments: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ commitments: CommitmentSummary[] }> =>
    request(outcomePath(workspaceId, sessionId, 'commitments'), user),

  getCommitment: (
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    user: ActingUser,
  ): Promise<CommitmentDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'commitments')}/${encodeURIComponent(commitmentId)}`,
      user,
    ),

  proposeCommitment: (
    workspaceId: string,
    sessionId: string,
    body: ProposeCommitmentRequest,
    user: ActingUser,
  ): Promise<CommitmentDetail> =>
    request(outcomePath(workspaceId, sessionId, 'commitments'), user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateCommitment: (
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    body: UpdateCommitmentRequest,
    user: ActingUser,
  ): Promise<CommitmentDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'commitments')}/${encodeURIComponent(commitmentId)}`,
      user,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ),

  transitionCommitment: (
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    body: CommitmentTransitionRequest,
    user: ActingUser,
  ): Promise<CommitmentDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'commitments')}/${encodeURIComponent(commitmentId)}/transitions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listActionItems: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ actions: ActionItemSummary[] }> =>
    request(outcomePath(workspaceId, sessionId, 'actions'), user),

  getActionItem: (
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    user: ActingUser,
  ): Promise<ActionItemDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'actions')}/${encodeURIComponent(actionItemId)}`,
      user,
    ),

  createActionItem: (
    workspaceId: string,
    sessionId: string,
    body: CreateActionItemRequest,
    user: ActingUser,
  ): Promise<ActionItemDetail> =>
    request(outcomePath(workspaceId, sessionId, 'actions'), user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateActionItem: (
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    body: UpdateActionItemRequest,
    user: ActingUser,
  ): Promise<ActionItemDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'actions')}/${encodeURIComponent(actionItemId)}`,
      user,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ),

  transitionActionItem: (
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    body: ActionItemTransitionRequest,
    user: ActingUser,
  ): Promise<ActionItemDetail> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'actions')}/${encodeURIComponent(actionItemId)}/transitions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getDecisionHistory: (
    workspaceId: string,
    sessionId: string,
    decisionId: string,
    user: ActingUser,
  ): Promise<{
    events: { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[];
  }> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'decisions')}/${encodeURIComponent(decisionId)}/history`,
      user,
    ),

  getCommitmentHistory: (
    workspaceId: string,
    sessionId: string,
    commitmentId: string,
    user: ActingUser,
  ): Promise<{
    events: { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[];
  }> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'commitments')}/${encodeURIComponent(commitmentId)}/history`,
      user,
    ),

  getActionItemHistory: (
    workspaceId: string,
    sessionId: string,
    actionItemId: string,
    user: ActingUser,
  ): Promise<{
    events: { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[];
  }> =>
    request(
      `${outcomePath(workspaceId, sessionId, 'actions')}/${encodeURIComponent(actionItemId)}/history`,
      user,
    ),

  recordOutcomeSupport: (
    workspaceId: string,
    sessionId: string,
    register: OutcomeRegister,
    outcomeId: string,
    body: RecordOutcomeSupportRequest,
    user: ActingUser,
  ): Promise<OutcomeSupportView> =>
    request(
      `${outcomePath(workspaceId, sessionId, register)}/${encodeURIComponent(outcomeId)}/support`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  removeOutcomeSupport: (
    workspaceId: string,
    sessionId: string,
    register: OutcomeRegister,
    outcomeId: string,
    supportId: string,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(
      `${outcomePath(workspaceId, sessionId, register)}/${encodeURIComponent(outcomeId)}/support/${encodeURIComponent(supportId)}`,
      user,
      { method: 'DELETE' },
    ),

  // ─── Session reporting and export (BUILD_ROADMAP.md Milestone 8) ──────────

  listReports: (
    workspaceId: string,
    sessionId: string,
    user: ActingUser,
  ): Promise<{ reports: ReportSummary[] }> => request(reportPath(workspaceId, sessionId), user),

  getReport: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    user: ActingUser,
  ): Promise<ReportDetail> =>
    request(`${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}`, user),

  getRenderedReport: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    user: ActingUser,
  ): Promise<RenderedReport> =>
    request(`${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/rendered`, user),

  getReportHistory: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    user: ActingUser,
  ): Promise<{
    events: {
      id: string;
      action: string;
      occurredAt: string;
      actorDisplayName: string;
      metadata: Record<string, string>;
    }[];
  }> =>
    request(`${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/history`, user),

  createReport: (
    workspaceId: string,
    sessionId: string,
    body: CreateReportRequest,
    user: ActingUser,
  ): Promise<ReportDetail> =>
    request(reportPath(workspaceId, sessionId), user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateReport: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    body: UpdateReportRequest,
    user: ActingUser,
  ): Promise<ReportDetail> =>
    request(`${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}`, user, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  transitionReport: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    body: ReportTransitionRequest,
    user: ActingUser,
  ): Promise<ReportDetail> =>
    request(
      `${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/transitions`,
      user,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  includeReportSource: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    body: IncludeReportSourceRequest,
    user: ActingUser,
  ): Promise<ReportSourceView> =>
    request(`${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/sources`, user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  excludeReportSource: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    sourceId: string,
    user: ActingUser,
  ): Promise<void> =>
    request<void>(
      `${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/sources/${encodeURIComponent(sourceId)}`,
      user,
      { method: 'DELETE' },
    ),

  /**
   * Where an export is downloaded from. Not a fetch: the browser navigates,
   * so the server's `Content-Disposition: attachment` decides the filename
   * and the bytes never pass through client-side JavaScript.
   */
  reportExportUrl: (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    format: ReportExportFormat,
  ): string =>
    `${BASE_URL}${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/export?format=${format}`,

  /**
   * Fetch an export and hand back the bytes and the server's filename.
   *
   * This cannot be a plain `<a href>`. A navigation carries cookies, and the
   * session travels as an `Authorization: Bearer` header — so a link to the
   * export URL is an unauthenticated request, and a deployed instance answers
   * it with 401. The export must be fetched with the session attached and
   * then saved from memory.
   *
   * The filename comes from the response's `Content-Disposition` rather than
   * being rebuilt here, so the name on disk is the one the server recorded.
   */
  downloadReportExport: async (
    workspaceId: string,
    sessionId: string,
    reportId: string,
    format: ReportExportFormat,
    user: ActingUser | null,
  ): Promise<{ blob: Blob; filename: string }> => {
    const url = `${BASE_URL}${reportPath(workspaceId, sessionId)}/${encodeURIComponent(reportId)}/export?format=${format}`;
    const headers: Record<string, string> = {};
    const token = sessionToken();

    if (token !== null) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (user !== null && IS_DEVELOPMENT_BUILD) {
      headers['X-Witness-Dev-User'] = `${user.name}|${user.role}`;
    }

    let response: Response;
    try {
      response = await fetch(url, { headers, cache: 'no-store' });
    } catch {
      throw new ApiError(`Cannot reach the Witness API at ${BASE_URL}.`, 0, 'API_UNREACHABLE');
    }

    if (!response.ok) {
      let code = 'EXPORT_FAILED';
      let message = `The export failed. ${fallbackErrorMessage(response.status)}`;
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        // Not JSON; keep the status-derived message.
      }
      throw new ApiError(message, response.status, code);
    }

    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);

    return {
      blob: await response.blob(),
      filename: match?.[1] ?? `report.${format}`,
    };
  },

  // ─── Program agenda (Client-Ready Experience overhaul, Phase 11) ──────────

  listAgendaItems: (
    workspaceId: string,
    user: ActingUser,
  ): Promise<{ agendaItems: AgendaItemView[] }> =>
    request(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agenda-items`, user),

  createAgendaItem: (
    workspaceId: string,
    body: CreateAgendaItemRequest,
    user: ActingUser,
  ): Promise<AgendaItemView> =>
    request(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agenda-items`, user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateAgendaItem: (
    workspaceId: string,
    itemId: string,
    body: UpdateAgendaItemRequest,
    user: ActingUser,
  ): Promise<AgendaItemView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agenda-items/${encodeURIComponent(itemId)}`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  transitionAgendaItem: (
    workspaceId: string,
    itemId: string,
    body: AgendaItemTransitionRequest,
    user: ActingUser,
  ): Promise<AgendaItemView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agenda-items/${encodeURIComponent(itemId)}/status`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  reorderAgendaItem: (
    workspaceId: string,
    itemId: string,
    body: ReorderAgendaItemRequest,
    user: ActingUser,
  ): Promise<AgendaItemView> =>
    request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agenda-items/${encodeURIComponent(itemId)}/reorder`,
      user,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  // ─── Program resources (Client-Ready Experience overhaul, Phase 12) ───────

  listResources: (workspaceId: string, user: ActingUser): Promise<{ resources: ResourceView[] }> =>
    request(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/resources`, user),

  createLinkResource: (
    workspaceId: string,
    body: CreateLinkResourceRequest,
    user: ActingUser,
  ): Promise<ResourceView> =>
    request(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/link`, user, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createFileResource: (
    workspaceId: string,
    metadata: CreateFileResourceMetadata,
    file: File,
    user: ActingUser,
  ): Promise<ResourceView> => {
    const formData = new FormData();
    formData.set('title', metadata.title);
    if (metadata.description) formData.set('description', metadata.description);
    if (metadata.sessionId) formData.set('sessionId', metadata.sessionId);
    if (metadata.agendaItemId) formData.set('agendaItemId', metadata.agendaItemId);
    formData.set('file', file);
    return requestMultipart<ResourceView>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/file`,
      user,
      formData,
    );
  },

  getResourceBlob: (workspaceId: string, resourceId: string, user: ActingUser): Promise<Blob> =>
    requestBlob(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}/content`,
      user,
    ),

  removeResource: (workspaceId: string, resourceId: string, user: ActingUser): Promise<void> =>
    request<void>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/resources/${encodeURIComponent(resourceId)}`,
      user,
      { method: 'DELETE' },
    ),
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
    let response: Response;

    // On a poor mobile connection a request can be accepted by the network
    // but never actually answered, in which case `fetch` neither resolves nor
    // rejects — nothing downstream ever hears about it, and the caller (the
    // "Checking sign-in…" state in auth.tsx) waits forever. Bounding the wait
    // turns that silent hang into the same "network failure" case below,
    // which auth.tsx already treats as retry-worthy rather than a reason to
    // sign the user out.
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 15_000);

    try {
      response = await fetch(`${BASE_URL}/api/v1/me`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: 'no-store',
        signal: timeoutController.signal,
      });
    } catch {
      // A network failure (or the timeout above) is not a judgement about the
      // session — it is a reason to try again, not a reason to sign the user out.
      throw new ApiError(`Cannot reach the Witness API at ${BASE_URL}.`, 0, 'API_UNREACHABLE');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // The server distinguishes *why* — no session, expired session,
      // suspended/deactivated account, an orphaned session — with a distinct
      // `error.code`. Trust that code rather than re-deriving a coarser one
      // from the HTTP status, so a 403 (suspended) doesn't collapse into the
      // same bucket as a 401 (never signed in) and a transient 5xx doesn't
      // read as either.
      let code = 'SESSION_CHECK_FAILED';
      let message = `Could not verify the session. ${fallbackErrorMessage(response.status)}`;

      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        // Response was not JSON. Keep the status-derived message.
      }

      throw new ApiError(message, response.status, code);
    }

    return (await response.json()) as CurrentUserView;
  },

  /** A person editing their own profile — same no-guard reasoning as `me`. */
  updateProfile: async (
    sessionToken: string,
    body: UpdateOwnProfileRequest,
  ): Promise<CurrentUserView> => {
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}/api/v1/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(`Cannot reach the Witness API at ${BASE_URL}.`, 0, 'API_UNREACHABLE');
    }

    if (!response.ok) {
      let code = 'PROFILE_UPDATE_FAILED';
      let message = `Could not update the profile. ${fallbackErrorMessage(response.status)}`;

      try {
        const body2 = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body2.error?.code ?? code;
        message = body2.error?.message ?? message;
      } catch {
        // Response was not JSON. Keep the status-derived message.
      }

      throw new ApiError(message, response.status, code);
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
