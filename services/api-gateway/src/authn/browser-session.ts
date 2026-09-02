import type { Request } from 'express';

/** Host-only: no Domain attribute is ever set. */
export const BROWSER_SESSION_COOKIE = 'witness_session';

export function bearerToken(request: Request): string | null {
  const header = request.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) return null;

  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token !== undefined && token.trim() !== ''
    ? token
    : null;
}

export function cookieToken(request: Pick<Request, 'headers'>): string | null {
  const header = request.headers.cookie;
  if (header === undefined) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== BROWSER_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    if (value === '') return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** Bearer is the explicit non-browser mechanism; cookie is browser fallback. */
export function sessionToken(request: Request): string | null {
  return bearerToken(request) ?? cookieToken(request);
}
