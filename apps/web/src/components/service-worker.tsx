'use client';

/**
 * Registers the app-shell service worker (`public/sw.js`) — see that
 * file's own header for what it does and, more importantly, does not do.
 * Silent no-op in unsupported browsers and in development, where a stale
 * cached shell fighting hot reload is a worse experience than no offline
 * support at all.
 */

import { useEffect } from 'react';

import { IS_DEVELOPMENT_BUILD } from '@/lib/api';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (IS_DEVELOPMENT_BUILD) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const basePath = process.env['NEXT_PUBLIC_WITNESS_BASE_PATH'] ?? '';
    navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` }).catch(() => {
      // No offline shell this session — the app still works fully online.
    });
  }, []);

  return null;
}
