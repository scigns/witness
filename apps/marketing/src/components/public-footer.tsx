import { marketingNavigation } from '../lib/navigation';
import { NavigationItems } from './navigation-items';
import { PageContainer } from './page-container';
import { WitnessLogo } from './witness-logo';

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <PageContainer>
        <div className="footer-introduction">
          <a className="logo-link" href="/" aria-label="Witness home">
            <WitnessLogo />
          </a>
          <p>Institutional memory with provenance by design.</p>
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
        <p className="copyright">© 2026 Witness. Built in the open. Designed for institutions.</p>
      </PageContainer>
    </footer>
  );
}
