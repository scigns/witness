/**
 * Parses an incoming Universal Link (iOS) / App Link (Android) into a join
 * token — the only thing this app's join screen needs from a deep link.
 *
 * Deliberately conservative: only a recognised Witness host, over HTTPS,
 * with exactly a `/join/:token` path is accepted. A malformed URL, an
 * unrecognised host, a wrong path, or a missing/empty token all return
 * `null` rather than throwing or guessing — a facilitator's QR code is the
 * only source of these links, but the OS hands this parser whatever URL
 * fired the `appUrlOpen` event, so it must fail closed on anything else
 * (see `docs/mobile/DEEP_LINKING.md`'s threat model).
 *
 * Callers must never log the returned token, and must never send it to
 * analytics — the same rule the capture token already follows
 * (`@witness/participant-client`'s `ApiError`/`api.ts` never logs one
 * either). This module itself performs no logging of any kind.
 */

export interface ParsedJoinDeepLink {
  token: string;
}

/**
 * The current live participant-facing web host — see
 * `docs/operations/PILOT_OPERATIONS.md`'s Cloudflare topology and this
 * project's own record of the live pilot deployment.
 *
 * `app.buildwithwitness.com` is the *target* host once
 * `docs/operations/INDEPENDENT_DOMAIN_CUTOVER.md` completes (its own
 * "Status: Planned; coexistence only" — not live yet). Kept in this list
 * now, ahead of that cutover, deliberately: it costs nothing to allow a
 * host that isn't serving traffic yet, and it means this file — and the
 * apple-app-site-association / assetlinks.json files documented alongside
 * it — need updating only once (whenever a *new* host is chosen), not
 * twice (once for the cutover, once for whatever the mobile team forgot to
 * update at cutover time).
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'witness-prod-web.pacificdigitalconsultancy.org',
  'app.buildwithwitness.com',
]);

const JOIN_PATH_PATTERN = /^\/join\/([^/?#]+)\/?$/;

export function parseJoinDeepLink(rawUrl: string): ParsedJoinDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;

  const match = JOIN_PATH_PATTERN.exec(parsed.pathname);
  if (match === null) return null;

  const rawToken = match[1];
  if (rawToken === undefined || rawToken.length === 0) return null;

  let token: string;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    return null;
  }
  if (token.length === 0) return null;

  return { token };
}
