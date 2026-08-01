import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Shell } from '@/components/shell';
import { SessionProvider } from '@/lib/session';

import './globals.css';

export const metadata: Metadata = {
  title: 'Witness — Developer Preview',
  description:
    'Open-source digital public infrastructure for institutional memory. Developer Preview.',
  // The preview must never be indexed. It contains synthetic records that read
  // like real institutional decisions, and a search engine cannot tell them apart.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
