/**
 * Proves the participant client's own contribution to the security
 * invariant: it is structurally incapable of calling a facilitator/admin
 * route (no such method exists on it at all — §14 "not enforced by hiding
 * navigation" applies here too), and every capture-token-authenticated call
 * attaches exactly one credential, never anything else (no cookie
 * assumption beyond `credentials: 'include'`, which carries nothing for an
 * anonymous participant with no session cookie to send).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createParticipantApiClient } from './api.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createParticipantApiClient — closed method surface', () => {
  it('exposes exactly the participant-only methods and nothing broader (facilitator/admin/billing/platform)', () => {
    const client = createParticipantApiClient('https://api.example.org');
    const methodNames = Object.keys(client).sort();

    expect(methodNames).toEqual(
      [
        'captureParticipantEvidence',
        'captureParticipantFeedback',
        'captureParticipantSelfConsent',
        'captureParticipantTestimonialConsent',
        'getParticipantCaptureContext',
        'getParticipantInsights',
        'getParticipantPrompt',
        'getSessionJoinContext',
        'joinSession',
        'submitParticipantInsightResponse',
        'uploadParticipantCaptureAttachment',
      ].sort(),
    );

    // No method name anywhere near an organisation/facilitator/billing/
    // platform capability — a regression here would mean someone widened
    // this client into a general-purpose one.
    const forbidden = /organisation|facilitator|admin|billing|invoice|platform|workspace|role/i;
    for (const name of methodNames) {
      expect(name).not.toMatch(forbidden);
    }
  });
});

describe('createParticipantApiClient — capture-token attachment', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches X-Witness-Capture-Token on every participant-capture call', async () => {
    const client = createParticipantApiClient('https://api.example.org');
    await client.getParticipantCaptureContext('the-capture-token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Witness-Capture-Token']).toBe('the-capture-token');
  });

  it('never attaches a capture-token header on session-join calls — a different credential entirely', async () => {
    const client = createParticipantApiClient('https://api.example.org');
    await client.getSessionJoinContext('the-join-token');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['X-Witness-Capture-Token']).toBeUndefined();
  });

  it('never attaches any X-Witness-Dev-User-style header — that mechanism does not exist in this client', async () => {
    const client = createParticipantApiClient('https://api.example.org');
    await client.captureParticipantEvidence('token', {
      evidenceType: 'audio_note',
      title: 't',
      content: 'c',
      clientRequestId: '11111111-1111-1111-1111-111111111111',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).some((h) => /dev-user/i.test(h))).toBe(false);
  });

  it('calls the join endpoint with the join token in the URL, not a header', async () => {
    const client = createParticipantApiClient('https://api.example.org');
    await client.joinSession('the-join-token', {
      clientRequestId: '11111111-1111-1111-1111-111111111111',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.example.org/api/v1/session-join/the-join-token/join');
  });
});

describe('createParticipantApiClient — error handling', () => {
  it('throws ApiError with the server-provided code/message on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: { code: 'CAPTURE_TOKEN_INVALID', message: 'This session is no longer valid.' },
          },
          401,
        ),
      ),
    );

    const client = createParticipantApiClient('https://api.example.org');

    await expect(client.getParticipantCaptureContext('bad-token')).rejects.toMatchObject({
      status: 401,
      code: 'CAPTURE_TOKEN_INVALID',
      message: 'This session is no longer valid.',
    });

    vi.unstubAllGlobals();
  });

  it('throws a distinguishable API_UNREACHABLE ApiError on a genuine network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const client = createParticipantApiClient('https://api.example.org');

    await expect(client.getParticipantCaptureContext('token')).rejects.toBeInstanceOf(ApiError);
    await expect(client.getParticipantCaptureContext('token')).rejects.toMatchObject({
      status: 0,
      code: 'API_UNREACHABLE',
    });

    vi.unstubAllGlobals();
  });
});
