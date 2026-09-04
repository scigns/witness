import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { MarketingShell } from '../components/marketing-shell';
import { OrganizationStructuredData } from '../components/structured-data';
import { createMarketingMetadata } from '../lib/metadata';
import { brandFontVariables } from '../lib/fonts';

import './globals.css';

export const metadata: Metadata = createMarketingMetadata({
  title: 'Witness — Make important decisions traceable',
});

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={brandFontVariables}>
      <body>
        <OrganizationStructuredData />
        <MarketingShell>{children}</MarketingShell>
      </body>
    </html>
  );
}
