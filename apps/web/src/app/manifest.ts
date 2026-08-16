import type { MetadataRoute } from 'next';

import { IS_DEVELOPMENT_BUILD } from '@/lib/api';

/**
 * PWA install manifest (low-connectivity Level 2, alongside the app-shell
 * service worker in `public/sw.js`). Icon/URL paths are prefixed by hand
 * with `NEXT_PUBLIC_WITNESS_BASE_PATH` — this file returns a plain object,
 * not one of Next's asset-pipeline special files, so nothing rewrites these
 * strings automatically (see `components/service-worker.tsx` for the same
 * requirement on the service-worker URL).
 */
export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env['NEXT_PUBLIC_WITNESS_BASE_PATH'] ?? '';

  return {
    name: IS_DEVELOPMENT_BUILD ? 'Witness — Developer Preview' : 'Witness',
    short_name: 'Witness',
    description: 'Open-source digital public infrastructure for institutional memory.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#0a0e14',
    theme_color: '#2f5fa8',
    icons: [
      { src: `${basePath}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  };
}
