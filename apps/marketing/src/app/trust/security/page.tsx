import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../../components/marketing-primitives';
import { createMarketingMetadata } from '../../../lib/metadata';
import { marketingSiteConfig } from '../../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Security — Witness',
  description:
    'Identity, sessions, access control, audit and backups in Witness - classified as deployed, configured, or planned, never asserted without that distinction.',
  path: '/trust/security',
});

const deployed = [
  [
    'Identity through Keycloak, not a homegrown login',
    'Authentication is delegated to Keycloak over OIDC. Witness never stores a password.',
  ],
  [
    'Deny-by-default access control',
    "Every request resolves the caller's role and scope, then checks it against an explicit policy. " +
      'The absence of an explicit allow is a denial, not a fallback to permissive behaviour.',
  ],
  [
    'Server-managed sessions',
    'The browser session cookie is HttpOnly, marked Secure in deployed environments, and scoped to a ' +
      'single origin. It carries no data a script running on the page could read.',
  ],
  [
    'Tamper-evident audit trail',
    'Every recorded action is chained to a hash of the one before it. Altering or deleting a past ' +
      'event breaks every hash after it, so tampering is detectable by recomputation - not by ' +
      'trusting that nobody with database access would do it.',
  ],
  [
    'Backups with a proven restore, not just a schedule',
    'A full, isolated restore drill has recovered real rows from a production backup on disposable ' +
      'infrastructure, destroyed afterward. A backup that has never been restored is a hope, not a ' +
      'control - this one has been exercised.',
  ],
] as const;

const notYet = [
  [
    'Database row-level security',
    'Tenant isolation is enforced in the application/repository layer today. A second, independent ' +
      'database-level layer is planned and not yet built.',
  ],
  [
    'Enforced API rate limiting',
    'Rate-limit configuration exists in the codebase. It is not yet wired into an enforced production ' +
      'control.',
  ],
  [
    'Third-party security certification',
    'No SOC 2, ISO 27001, or equivalent audit has been completed. This page will not claim one until ' +
      'it has.',
  ],
] as const;

export default function SecurityPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page security-page">
      <div className="foundation-heading">
        <Eyebrow>Trust</Eyebrow>
        <h1>What actually protects a Witness record.</h1>
        <p className="promise">
          Identity, access, audit and recovery, stated as what runs in production today - not what
          is designed, configured, or aspired to.
        </p>
      </div>

      <Section id="deployed" className="homepage-section">
        <SectionHeading eyebrow="Deployed today" title="What is actually running" />
        <div className="feature-grid audience-grid">
          {deployed.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="planned" className="homepage-section">
        <SectionHeading eyebrow="Not yet" title="What is configured, planned, or not started" />
        <div className="feature-grid audience-grid">
          {notYet.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Ask your own security team to review what we run." />
        <CTAGroup aria-label="Security page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/trust/data-sovereignty" variant="secondary">
            Data & sovereignty
          </LinkButton>
          <LinkButton href="/trust" variant="tertiary">
            Trust overview
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
