/**
 * Resolves the participant app's API origin at build time (Vite's
 * `import.meta.env`, baked into the bundle Capacitor ships in the native
 * binary — there is no server-side runtime to defer to, unlike
 * `apps/web`'s Next.js deployment).
 *
 * Mirrors `apps/web/src/lib/runtime-config.ts`'s discipline deliberately: a
 * production build must state its API origin explicitly (fail closed), and
 * only the development profile gets a localhost fallback. The mobile build
 * additionally requires HTTPS whenever the profile is not development —
 * a native binary shipped to a store has no "just this once, plain HTTP"
 * excuse the way a browser dev server might.
 */
export function resolveApiBaseUrl(env: Record<string, string | undefined>): string {
  const profile = env['VITE_WITNESS_BUILD_PROFILE'] ?? 'development';
  const configured = env['VITE_WITNESS_API_URL']?.trim() ?? '';

  if (configured === '') {
    if (profile === 'development') return 'http://localhost:3001';
    throw new Error('VITE_WITNESS_API_URL must be set outside the development profile.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('VITE_WITNESS_API_URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('VITE_WITNESS_API_URL must use HTTP or HTTPS.');
  }
  if (parsed.protocol === 'http:' && profile !== 'development') {
    throw new Error('VITE_WITNESS_API_URL must use HTTPS outside the development profile.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('VITE_WITNESS_API_URL must not contain credentials.');
  }

  return configured.replace(/\/$/, '');
}
