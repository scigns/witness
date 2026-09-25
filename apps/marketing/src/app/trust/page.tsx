import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../components/marketing-primitives';
import { createMarketingMetadata } from '../../lib/metadata';
import { marketingSiteConfig } from '../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Trust & governance — Witness',
  description:
    'What Witness actually does for security, data sovereignty and privacy, stated as deployed capability, supported configuration or planned work - never as a certification it does not hold.',
  path: '/trust',
});

const pillars = [
  [
    'Governance',
    'Access follows explicit organisation and workspace membership and role assignment, decided ' +
      'server-side on every request, deny-by-default. A role grants exactly the actions it is ' +
      'assigned - nothing is implied by name or hierarchy.',
    '/platform/evidence',
    'How evidence is governed',
  ],
  [
    'Security',
    'Identity, sessions, audit and encryption - what is deployed today, and what is configured but ' +
      'not yet enforced.',
    '/trust/security',
    'Read the security page',
  ],
  [
    'Data & sovereignty',
    'Where data lives, what "sovereign" actually means as a deployment profile, and what remains a ' +
      'supported configuration rather than a commercially proven one at scale.',
    '/trust/data-sovereignty',
    'Read the data & sovereignty page',
  ],
  [
    'Privacy',
    'What a participant actually consents to, per category, before anything is captured - and what ' +
      'happens to that consent record afterward.',
    '/trust/privacy',
    'Read the privacy page',
  ],
] as const;

export default function TrustPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page trust-page">
      <div className="foundation-heading">
        <Eyebrow>Trust</Eyebrow>
        <h1>What Witness does, stated plainly - not what it is certified to do.</h1>
        <p className="promise">
          Every claim on this page and the pages beneath it is classified as a deployed capability,
          a supported configuration, or planned work. Witness does not hold SOC 2, ISO 27001 or
          government accreditation today, and does not claim to.
        </p>
      </div>

      <Section id="pillars" className="homepage-section">
        <SectionHeading title="Four things worth asking about before you trust a system with evidence" />
        <div className="feature-grid audience-grid">
          {pillars.map(([title, description, href, cta]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
              <LinkButton href={href} variant="tertiary">
                {cta}
              </LinkButton>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="not-claimed" className="homepage-section">
        <SectionHeading title="What Witness does not currently claim" />
        <div className="feature-grid audience-grid">
          <FeatureCard title="No third-party certification">
            <p>
              No SOC 2, ISO 27001, or government security accreditation exists today. A claim of
              certification will only appear here once it has actually been obtained.
            </p>
          </FeatureCard>
          <FeatureCard title="Database-level tenant isolation is not yet independent of the application">
            <p>
              Tenant isolation is enforced in the repository/application layer on every request. A
              second, independent database-level layer (row-level security) is planned and not yet
              built.
            </p>
          </FeatureCard>
          <FeatureCard title="API rate limiting is configured, not yet enforced">
            <p>
              Rate-limit configuration exists in the codebase. It is not yet an enforced production
              control, and is not described as one.
            </p>
          </FeatureCard>
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Ask us what we did not put on this page." />
        <CTAGroup aria-label="Trust page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
