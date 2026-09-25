/**
 * The public, unauthenticated read that feeds `apps/marketing`'s stories
 * page — the "public read-only stories endpoint the customer-learning
 * track's feedback-review workflow produces" that page's own comment has
 * anticipated since Phase 6 Track A. Fetched server-side (this page is a
 * Server Component) so it never needs to cross the gateway's single-origin
 * CORS allowlist, which is scoped to the product frontend, not this
 * independent site.
 *
 * `resolveApiBaseUrl` mirrors the product frontend's runtime-config
 * fail-closed shape: a real deployment must state its API explicitly; only
 * local development gets a `localhost` fallback. Unlike that one, this
 * never needs a `NEXT_PUBLIC_` prefix — this fetch runs only on the server,
 * so the value is never bundled to the browser.
 */

import type { PublishedStoryCard } from '@witness/contracts';

export function resolveApiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const marketingEnv = env['WITNESS_MARKETING_ENV'] ?? 'development';
  const configured = env['WITNESS_MARKETING_API_URL']?.trim() ?? '';

  if (configured === '') {
    if (marketingEnv !== 'production') return 'http://localhost:3001';
    throw new Error('WITNESS_MARKETING_API_URL must be set when WITNESS_MARKETING_ENV=production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('WITNESS_MARKETING_API_URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('WITNESS_MARKETING_API_URL must use HTTP or HTTPS.');
  }
  if (parsed.protocol === 'http:' && marketingEnv === 'production') {
    throw new Error(
      'WITNESS_MARKETING_API_URL must use HTTPS when WITNESS_MARKETING_ENV=production.',
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('WITNESS_MARKETING_API_URL must not contain credentials.');
  }

  return configured.replace(/\/$/, '');
}

/**
 * Fails closed to an empty list — a fetch failure or unexpected response
 * shape renders as "no public stories yet", the same honest state this page
 * already shows before any story is ever published, rather than crashing
 * the whole page over a non-essential section.
 */
export async function fetchPublishedStories(
  env: Record<string, string | undefined> = process.env,
): Promise<readonly PublishedStoryCard[]> {
  let base: string;
  try {
    base = resolveApiBaseUrl(env);
  } catch {
    return [];
  }

  try {
    const response = await fetch(`${base}/api/v1/stories/published`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    return Array.isArray(body) ? (body as PublishedStoryCard[]) : [];
  } catch {
    return [];
  }
}
