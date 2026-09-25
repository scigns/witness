/**
 * Micro-survey suppression (Phase 6, Track B).
 *
 * Pure functions against a minimal `Storage`-shaped interface, so this is
 * testable without a DOM — the same reason `runtime-config.ts` keeps its own
 * logic free of `window` at the point of decision. Suppression is scoped per
 * `productArea` (the storage key includes it), so dismissing or completing
 * one survey never suppresses another. The cooldown starts on both dismiss
 * and successful completion — see `useSurveySuppression` — so the prompt
 * never nags on every page load once the person has answered it once.
 */

import type { ProductArea } from '@witness/contracts';

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'witness:survey-suppressed:';

export interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageKey(productArea: ProductArea): string {
  return `${STORAGE_KEY_PREFIX}${productArea}`;
}

export function isSuppressed(
  productArea: ProductArea,
  now: number,
  storage: MinimalStorage,
): boolean {
  const raw = storage.getItem(storageKey(productArea));
  if (raw === null) return false;
  const until = Number(raw);
  return Number.isFinite(until) && until > now;
}

export function suppress(productArea: ProductArea, now: number, storage: MinimalStorage): void {
  storage.setItem(storageKey(productArea), String(now + COOLDOWN_MS));
}
