/**
 * Resolve the browser's API origin from the build-time deployment contract.
 *
 * A dedicated application hostname must state its API explicitly. Only the
 * development profile receives a localhost fallback; deployed bundles fail
 * closed rather than silently calling an unrelated origin.
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
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('NEXT_PUBLIC_WITNESS_API_URL must not contain credentials.');
  }
  return configured.replace(/\/$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl({
  WITNESS_BUILD_PROFILE: process.env['WITNESS_BUILD_PROFILE'],
  NEXT_PUBLIC_WITNESS_API_URL: process.env['NEXT_PUBLIC_WITNESS_API_URL'],
});
