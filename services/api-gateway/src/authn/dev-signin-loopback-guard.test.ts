import { describe, expect, it, vi } from 'vitest';

import { devSignInLoopbackGuard } from './dev-signin-loopback-guard.js';

function fakeRequest(path: string, remoteAddress: string | undefined) {
  return { path, socket: { remoteAddress } } as never;
}

function fakeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response as never as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('devSignInLoopbackGuard', () => {
  const restrictedPaths = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/dev-idp/authorize',
    '/api/v1/auth/callback',
  ];

  it.each(restrictedPaths)('rejects %s from a LAN address', (path) => {
    const response = fakeResponse();
    const next = vi.fn();

    devSignInLoopbackGuard()(fakeRequest(path, '192.168.1.42'), response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'DEV_SIGNIN_LOOPBACK_ONLY' }),
    });
  });

  it.each(restrictedPaths)(
    'allows %s from loopback — ordinary localhost sign-in is unaffected',
    (path) => {
      const response = fakeResponse();
      const next = vi.fn();

      devSignInLoopbackGuard()(fakeRequest(path, '127.0.0.1'), response as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(response.status).not.toHaveBeenCalled();
    },
  );

  it('fails closed when remoteAddress is unknown', () => {
    const response = fakeResponse();
    const next = vi.fn();

    devSignInLoopbackGuard()(fakeRequest('/api/v1/auth/login', undefined), response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('never restricts participant join/capture routes, from anywhere', () => {
    const response = fakeResponse();
    const next = vi.fn();

    devSignInLoopbackGuard()(
      fakeRequest('/api/v1/session-join/some-token/join', '192.168.1.42'),
      response as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('never restricts /api/v1/auth/logout — nothing left on a LAN client to protect', () => {
    const response = fakeResponse();
    const next = vi.fn();

    devSignInLoopbackGuard()(
      fakeRequest('/api/v1/auth/logout', '192.168.1.42'),
      response as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });
});
