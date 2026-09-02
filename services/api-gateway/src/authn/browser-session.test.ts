import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  BROWSER_SESSION_COOKIE,
  bearerToken,
  cookieToken,
  sessionToken,
} from './browser-session.js';
import { csrfOriginProtection } from './csrf-origin.js';

function request(headers: Record<string, string> = {}, method = 'GET'): Request {
  return { headers, method } as Request;
}

describe('browser session transport', () => {
  it('resolves the host-only browser cookie without exposing it to application code', () => {
    const req = request({ cookie: `other=x; ${BROWSER_SESSION_COOKIE}=opaque%2Dsession` });
    expect(cookieToken(req)).toBe('opaque-session');
    expect(sessionToken(req)).toBe('opaque-session');
  });

  it('keeps explicit Bearer authentication separate and authoritative', () => {
    const req = request({
      authorization: 'Bearer service-session',
      cookie: `${BROWSER_SESSION_COOKIE}=browser-session`,
    });
    expect(bearerToken(req)).toBe('service-session');
    expect(sessionToken(req)).toBe('service-session');
  });

  it('rejects malformed cookie encoding', () => {
    expect(cookieToken(request({ cookie: `${BROWSER_SESSION_COOKIE}=%` }))).toBeNull();
  });
});

describe('cookie CSRF boundary', () => {
  const protect = csrfOriginProtection('https://app.buildwithwitness.com');

  function response() {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    return { value: { status } as unknown as Response, status, json };
  }

  it('allows same-origin cookie-authenticated mutation', () => {
    const res = response();
    const next = vi.fn();
    protect(
      request(
        {
          cookie: `${BROWSER_SESSION_COOKIE}=browser-session`,
          origin: 'https://app.buildwithwitness.com',
        },
        'POST',
      ),
      res.value,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([undefined, 'https://evil.example'])('denies missing or foreign Origin: %s', (origin) => {
    const res = response();
    const next = vi.fn();
    protect(
      request(
        {
          cookie: `${BROWSER_SESSION_COOKIE}=browser-session`,
          ...(origin === undefined ? {} : { origin }),
        },
        'PATCH',
      ),
      res.value,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'CSRF_ORIGIN_DENIED', message: expect.any(String) },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('does not impose browser CSRF semantics on a bearer client', () => {
    const res = response();
    const next = vi.fn();
    protect(request({ authorization: 'Bearer service-session' }, 'POST'), res.value, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
