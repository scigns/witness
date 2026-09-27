/**
 * The participant-only Witness API client (ADR-0031) — extracted from
 * `apps/web/src/lib/api.ts`'s participant-relevant methods, behaviour
 * unchanged, for `apps/web` and `apps/participant-mobile` to share.
 *
 * Deliberately calls exactly the routes
 * `docs/mobile/PARTICIPANT_API_CONTRACT.md` documents and no others —
 * `/api/v1/session-join/*` and `/api/v1/participant-capture/*`. Every call
 * here carries a join-link token (in the URL) or a capture token
 * (`X-Witness-Capture-Token`), never an authenticated-session credential —
 * a pseudonymous/anonymous participant has no Witness account at all, and
 * this client has no method that could accept one. See
 * `ParticipantCaptureController`'s own header comment (services/api-gateway)
 * for why the capture token is a distinct header, not `Authorization:
 * Bearer` — this client mirrors that distinction by construction, not by
 * convention: there is no code path here that could attach any other
 * credential even by mistake.
 */

import type {
  CaptureParticipantFeedbackRequest,
  CustomerStoryView,
  EvidenceAttachmentView,
  FeaturedInsightView,
  JoinSessionRequest,
  JoinSessionResult,
  ParticipantCaptureConsentRequest,
  ParticipantCaptureContextView,
  ParticipantCaptureEvidenceRequest,
  ParticipantCaptureEvidenceResult,
  ParticipantPromptView,
  ProductFeedbackView,
  SessionJoinContextView,
  SubmitParticipantKnowledgeResponseRequest,
  SubmitTestimonialConsentRequest,
} from '@witness/contracts';

const CAPTURE_TOKEN_HEADER = 'X-Witness-Capture-Token';

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

/**
 * Only used when the server's response carries no structured `error.message`
 * of its own (a proxy error, an unhandled crash, a non-JSON body) — the
 * normal case always has a plain-language message from the API itself. A raw
 * HTTP status code is not a sentence a participant should have to read.
 */
function fallbackErrorMessage(status: number): string {
  if (status === 401) return 'This link or session is no longer valid.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found.";
  if (status === 409) return 'That was changed by someone else — reload and try again.';
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

export interface ParticipantApiClient {
  getSessionJoinContext(token: string): Promise<SessionJoinContextView>;
  joinSession(token: string, body: JoinSessionRequest): Promise<JoinSessionResult>;
  getParticipantCaptureContext(captureToken: string): Promise<ParticipantCaptureContextView>;
  captureParticipantEvidence(
    captureToken: string,
    body: ParticipantCaptureEvidenceRequest,
  ): Promise<ParticipantCaptureEvidenceResult>;
  captureParticipantSelfConsent(
    captureToken: string,
    body: ParticipantCaptureConsentRequest,
  ): Promise<{ status: 'captured' }>;
  captureParticipantFeedback(
    captureToken: string,
    body: CaptureParticipantFeedbackRequest,
  ): Promise<ProductFeedbackView>;
  captureParticipantTestimonialConsent(
    captureToken: string,
    feedbackId: string,
    body: SubmitTestimonialConsentRequest,
  ): Promise<CustomerStoryView | null>;
  uploadParticipantCaptureAttachment(
    captureToken: string,
    evidenceId: string,
    file: Blob,
    filename: string,
  ): Promise<EvidenceAttachmentView>;
  getParticipantPrompt(captureToken: string): Promise<ParticipantPromptView | null>;
  getParticipantInsights(captureToken: string): Promise<FeaturedInsightView[]>;
  submitParticipantInsightResponse(
    captureToken: string,
    insightId: string,
    body: SubmitParticipantKnowledgeResponseRequest,
  ): Promise<{ status: 'captured' }>;
}

/**
 * `baseUrl` is supplied by the caller, never read from an environment
 * variable here — `apps/web` and `apps/participant-mobile` resolve it
 * through materially different mechanisms (Next.js build-time env vs a
 * Capacitor runtime config), and a shared package should not privilege
 * either one's convention.
 */
export function createParticipantApiClient(baseUrl: string): ParticipantApiClient {
  const trimmedBase = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${trimmedBase}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers as Record<string, string> | undefined),
        },
        cache: 'no-store',
        credentials: 'include',
      });
    } catch {
      throw new ApiError(`Cannot reach the Witness API at ${trimmedBase}.`, 0, 'API_UNREACHABLE');
    }

    await throwOnError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function requestMultipart<T>(
    path: string,
    formData: FormData,
    headers: Record<string, string>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${trimmedBase}${path}`, {
        method: 'POST',
        headers,
        body: formData,
        cache: 'no-store',
        credentials: 'include',
      });
    } catch {
      throw new ApiError(`Cannot reach the Witness API at ${trimmedBase}.`, 0, 'API_UNREACHABLE');
    }

    await throwOnError(response);
    return (await response.json()) as T;
  }

  return {
    getSessionJoinContext: (token) =>
      request<SessionJoinContextView>(`/api/v1/session-join/${encodeURIComponent(token)}`),

    joinSession: (token, body) =>
      request<JoinSessionResult>(`/api/v1/session-join/${encodeURIComponent(token)}/join`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getParticipantCaptureContext: (captureToken) =>
      request<ParticipantCaptureContextView>('/api/v1/participant-capture/me', {
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    captureParticipantEvidence: (captureToken, body) =>
      request<ParticipantCaptureEvidenceResult>('/api/v1/participant-capture/evidence', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    captureParticipantSelfConsent: (captureToken, body) =>
      request<{ status: 'captured' }>('/api/v1/participant-capture/consent', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    captureParticipantFeedback: (captureToken, body) =>
      request<ProductFeedbackView>('/api/v1/participant-capture/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    captureParticipantTestimonialConsent: (captureToken, feedbackId, body) =>
      request<CustomerStoryView | null>(
        `/api/v1/participant-capture/feedback/${encodeURIComponent(feedbackId)}/testimonial-consent`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
        },
      ),

    uploadParticipantCaptureAttachment: (captureToken, evidenceId, file, filename) => {
      const form = new FormData();
      form.append('file', file, filename);
      return requestMultipart<EvidenceAttachmentView>(
        `/api/v1/participant-capture/evidence/${encodeURIComponent(evidenceId)}/attachment`,
        form,
        { [CAPTURE_TOKEN_HEADER]: captureToken },
      );
    },

    getParticipantPrompt: (captureToken) =>
      request<ParticipantPromptView | null>('/api/v1/participant-capture/prompt', {
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    getParticipantInsights: (captureToken) =>
      request<FeaturedInsightView[]>('/api/v1/participant-capture/insights', {
        headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
      }),

    submitParticipantInsightResponse: (captureToken, insightId, body) =>
      request<{ status: 'captured' }>(
        `/api/v1/participant-capture/insights/${encodeURIComponent(insightId)}/response`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { [CAPTURE_TOKEN_HEADER]: captureToken },
        },
      ),
  };
}
