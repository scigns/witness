import { marketingNavigation } from '../lib/navigation';
import { marketingSiteConfig } from '../lib/site-config';
import { NavigationItems } from './navigation-items';
import { PageContainer } from './page-container';
import { WitnessLogo } from './witness-logo';
import { LinkButton } from './marketing-primitives';

export function PublicHeader() {
  const { appUrl, demoUrl } = marketingSiteConfig();
  return (
    <header className="site-header">
      <PageContainer className="header-inner">
        <a className="logo-link" href="/" aria-label="Witness home">
          <WitnessLogo priority />
        </a>
        <nav className="desktop-navigation" aria-label="Primary navigation">
          <NavigationItems items={marketingNavigation.primary} className="primary-links" />
        </nav>
        <div className="header-actions">
          <LinkButton variant="tertiary" href={appUrl.href}>
            Sign in
          </LinkButton>
          <LinkButton href={demoUrl.href}>Book a demo</LinkButton>
        </div>
        <details className="mobile-navigation">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation" className="mobile-navigation-panel">
            <NavigationItems items={marketingNavigation.primary} className="mobile-links" />
            <div className="mobile-actions">
              <LinkButton variant="tertiary" href={appUrl.href}>
                Sign in
              </LinkButton>
              <LinkButton href={demoUrl.href}>Book a demo</LinkButton>
            </div>
          </nav>
        </details>
      </PageContainer>
    </header>
  );
}
