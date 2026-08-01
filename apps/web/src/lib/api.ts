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
  CreateRecordRequest,
  HealthResponse,
  RecordDetail,
  RecordSummary,
  ReviewAction,
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
  role: 'reader' | 'contributor' | 'reviewer';
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
};
