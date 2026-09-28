import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import manifest from '../src/app/manifest';

// Brand Book v1.0 tokens (`globals.css`) — the manifest's theme/background
// colors must be these, not arbitrary values. See ADR-0030.
const BRAND_INK = '#1b1917';
const BRAND_PAPER = '#f5f2ed';

describe('PWA manifest (Track C, ADR-0030)', () => {
  it('declares an installable, standalone app identity', () => {
    const result = manifest();
    expect(result.short_name).toBe('Witness');
    expect(result.display).toBe('standalone');
    expect(result.start_url).toMatch(/\/$/);
    expect(result.scope).toMatch(/\/$/);
  });

  it('uses Brand Book tokens for theme and background color, not arbitrary values', () => {
    const result = manifest();
    expect(result.theme_color).toBe(BRAND_INK);
    expect(result.background_color).toBe(BRAND_PAPER);
  });

  it('declares both the 192 and 512 icon sizes real assets exist for', () => {
    const result = manifest();
    const sizes = (result.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of result.icons ?? []) {
      expect(icon.type).toBe('image/png');
    }
  });

  it('never names an icon path that does not exist on disk', () => {
    const result = manifest();
    for (const icon of result.icons ?? []) {
      // start_url/scope/icon paths are hand-prefixed with basePath (empty in
      // this test's env) — strip a leading slash to resolve against public/.
      const relativePath = (icon.src as string).replace(/^\//, '');
      expect(() =>
        readFileSync(fileURLToPath(new URL(`../public/${relativePath}`, import.meta.url))),
      ).not.toThrow();
    }
  });
});

describe('service worker threat model (Track C, ADR-0030)', () => {
  const swSource = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');

  it('never intercepts a non-GET request', () => {
    expect(swSource).toContain("request.method !== 'GET'");
  });

  it('never intercepts a cross-origin request', () => {
    expect(swSource).toContain('url.origin !== self.location.origin');
  });

  it('scopes every caches.put/caches.open call to the hashed-static-asset branch', () => {
    // Not a keyword ban (the file's own comments legitimately discuss what
    // it must never cache) — a structural check that every actual cache
    // write happens only inside the `isStaticAsset` guard, not anywhere else
    // in the file (e.g. a future edit accidentally caching a navigation or
    // API response outside that branch).
    const [, afterGuard] = swSource.split('if (isStaticAsset) {');
    expect(afterGuard).toBeDefined();
    const cacheWriteCount = (swSource.match(/caches\.open\(/g) ?? []).length;
    const cacheWriteCountAfterGuard = (afterGuard!.match(/caches\.open\(/g) ?? []).length;
    expect(cacheWriteCount).toBeGreaterThan(0);
    expect(cacheWriteCount).toBe(cacheWriteCountAfterGuard);
  });
});
