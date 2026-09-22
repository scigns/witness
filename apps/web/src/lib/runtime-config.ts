/**
 * A monorepo whose services share one root `.env` (see
 * `services/api-gateway/src/infrastructure/load-root-env.ts`) has a real
 * footgun for the frontend specifically: `NEXT_PUBLIC_*` values get baked
 * into the browser bundle at build/dev-server start, so an operator's own
 * `.env` — legitimately pointed at a real deployment for unrelated ops
 * work on the same machine — silently redirects `next dev` at that real
 * API too. Caught mid-session once already: two stray `GET /api/v1/me`
 * calls landing on the live pilot host instead of localhost.
 */
const LOCAL_HOSTNAME_PATTERN =
  /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|.+\.(?:localhost|local))$/i;

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAME_PATTERN.test(hostname);
}

/**
 * Resolve the browser's API origin from the build-time deployment contract.
 *
 * A dedicated application hostname must state its API explicitly. Only the
 * development profile receives a localhost fallback; deployed bundles fail
 * closed rather than silently calling an unrelated origin.
 *
 * The development profile additionally refuses a *non-local* API URL
 * unless `NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API` is explicitly set —
 * the guard described above. Set that variable (in a scoped
 * `apps/web/.env.local`, never the shared root `.env`) only when you
 * genuinely intend local frontend code to call a real, remote API.
 */
export function resolveApiBaseUrl(env: Record<string, string | undefined>): string {
  const profile = env['WITNESS_BUILD_PROFILE'] ?? 'development';
  const configured = env['NEXT_PUBLIC_WITNESS_API_URL']?.trim() ?? '';

  if (configured === '') {
    if (profile === 'development') return 'http://localhost:3001';
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must be set outside the development profile.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must use HTTP or HTTPS.');
  }
  if (parsed.protocol === 'http:' && profile !== 'development') {
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must use HTTPS outside the development profile.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must not contain credentials.');
  }

  if (
    profile === 'development' &&
    !isLocalHostname(parsed.hostname) &&
    (env['NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API'] ?? '').trim() === ''
  ) {
    throw new Error(
      `Refusing to start: this is a development build, but NEXT_PUBLIC_WITNESS_API_URL ` +
        `("${configured}") is not a local address. A local frontend defaulting to a real API ` +
        `is exactly how development traffic ends up hitting production. If this is deliberate ` +
        `(calling a genuine remote API from local frontend code), set ` +
        `NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API=true in apps/web/.env.local — never in the ` +
        `shared root .env — to acknowledge it. See apps/web/.env.local.example.`,
    );
  }

  return configured.replace(/\/$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl({
  WITNESS_BUILD_PROFILE: process.env['WITNESS_BUILD_PROFILE'],
  NEXT_PUBLIC_WITNESS_API_URL: process.env['NEXT_PUBLIC_WITNESS_API_URL'],
  NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API: process.env['NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API'],
});
