import { marketingNavigation } from '../lib/navigation';
import { marketingSiteConfig } from '../lib/site-config';
import { NavigationItems } from './navigation-items';
import { PageContainer } from './page-container';
import { WitnessLogo } from './witness-logo';

export function PublicFooter() {
  const { appUrl, demoUrl, pricingUrl } = marketingSiteConfig();

  return (
    <footer className="site-footer">
      <PageContainer>
        <div className="footer-introduction">
          <div className="footer-signature">
            <a className="logo-link" href="/" aria-label="Witness home">
              <WitnessLogo />
            </a>
            <p>Institutional memory with provenance by design.</p>
          </div>
          <div className="footer-actions">
            <a href={pricingUrl.href}>View plans</a>
            <a href={demoUrl.href}>Discuss a pilot</a>
            <a href={appUrl.href}>Sign in</a>
          </div>
        </div>
        <nav className="footer-navigation" aria-label="Footer navigation">
          {marketingNavigation.footer.map((group) => (
            <section
              className="footer-group"
              aria-labelledby={`footer-${group.label}`}
              key={group.label}
            >
              <h2 id={`footer-${group.label}`}>{group.label}</h2>
              <NavigationItems items={group.items} />
            </section>
          ))}
        </nav>
        <div className="footer-colophon">
          <p className="copyright">© 2026 Witness. Built in the open. Designed for institutions.</p>
          <p className="footer-record">WITNESS / PUBLIC RECORD / 2026</p>
        </div>
      </PageContainer>
    </footer>
  );
}
