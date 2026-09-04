import type { ReactNode } from 'react';

import { PageContainer } from './page-container';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <PublicHeader />
      <main id="main-content" tabIndex={-1}>
        <PageContainer>{children}</PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
