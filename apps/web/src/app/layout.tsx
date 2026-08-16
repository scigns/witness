import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Shell } from '@/components/shell';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { IS_DEVELOPMENT_BUILD } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { SessionProvider } from '@/lib/session';

import './globals.css';

const BASE_PATH = process.env['NEXT_PUBLIC_WITNESS_BASE_PATH'] ?? '';

export const metadata: Metadata = {
  // The tab title is the one piece of Witness a pilot user sees in a
  // screenshot, a bookmark or a shared link. Calling a deployment carrying real
  // institutional memory a "Developer Preview" there would be a small lie in
  // the most quotable place.
  title: IS_DEVELOPMENT_BUILD ? 'Witness — Developer Preview' : 'Witness',
  description: IS_DEVELOPMENT_BUILD
    ? 'Open-source digital public infrastructure for institutional memory. Developer Preview.'
    : 'Open-source digital public infrastructure for institutional memory.',
  // Never indexed, in either build. The preview holds synthetic records that
  // read like real institutional decisions; a deployment holds the real ones.
  // A search engine should be shown neither.
  robots: { index: false, follow: false },
  // `manifest.ts` (this directory) is a Next.js special file — detected and
  // linked automatically. Icon/apple-touch-icon paths are plain strings, so
  // they carry the same manual `NEXT_PUBLIC_WITNESS_BASE_PATH` prefix
  // `manifest.ts` and `service-worker.tsx` already need for the same reason.
  icons: {
    icon: `${BASE_PATH}/icon-192.png`,
    apple: `${BASE_PATH}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Witness',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <AuthProvider>
          <SessionProvider>
            <Shell>{children}</Shell>
          </SessionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
