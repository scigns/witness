import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Shell } from '@/components/shell';
import { IS_DEVELOPMENT_BUILD } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { SessionProvider } from '@/lib/session';

import './globals.css';

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
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SessionProvider>
            <Shell>{children}</Shell>
          </SessionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
