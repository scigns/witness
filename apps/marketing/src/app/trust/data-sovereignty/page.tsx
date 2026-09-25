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
  title: 'Data & sovereignty — Witness',
  description:
    'What "sovereign" means as an actual deployment profile in Witness, where data lives, and which deployment models are commercially proven versus documented and supported.',
  path: '/trust/data-sovereignty',
});

const facts = [
  [
    'A sovereign profile makes zero external calls, by construction',
    'When an instance is configured as sovereign, it does not call an external AI provider or any ' +
      'other third-party service. This is a startup-time check, not a policy someone could forget ' +
      'to follow - the process refuses to start in an inconsistent configuration.',
  ],
  [
    'One database, one backup, one recovery procedure',
    'Institutional records live in one PostgreSQL system of record, not scattered across several ' +
      'independent stores that would each need their own backup and consent-revocation path.',
  ],
  [
    'Deployment choice is a real configuration, not a slide',
    'Sovereign, hybrid and cloud-managed deployment profiles are implemented in the codebase, not ' +
      'only described in a proposal. Which profile an instance runs is explicit configuration, ' +
      'checked at startup.',
  ],
  [
    'Data residency follows where the instance actually runs',
    "A deployment's data resides on the infrastructure an operator chooses to run it on - customer- " +
      'managed, dedicated, or Witness-operated - rather than a fixed default nobody can see.',
  ],
] as const;

export default function DataSovereigntyPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page sovereignty-page">
      <div className="foundation-heading">
        <Eyebrow>Trust</Eyebrow>
        <h1>Sovereignty is a configuration, not a slogan.</h1>
        <p className="promise">
          Some deployment models are proven in a running pilot. Others are implemented and supported
          but not yet operated at commercial scale. This page says which is which.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What sovereignty actually means in the running system" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="honest-status" className="homepage-section">
        <SectionHeading eyebrow="Stated honestly" title="Proven versus supported" />
        <div className="feature-grid audience-grid">
          <FeatureCard title="Cloud-managed: operated in a live pilot">
            <p>
              A cloud-managed deployment is running today, operated by Witness on an institution's
              behalf.
            </p>
          </FeatureCard>
          <FeatureCard title="Sovereign and customer-managed: implemented, not yet commercially proven at scale">
            <p>
              These deployment models exist in the codebase and are documented for an operator to
              run. They have not yet been operated as a customer's production system at scale, and
              this page will not claim that they have.
            </p>
          </FeatureCard>
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Tell us which deployment model your institution actually needs." />
        <CTAGroup aria-label="Data and sovereignty page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/trust/privacy" variant="secondary">
            Privacy
          </LinkButton>
          <LinkButton href="/trust" variant="tertiary">
            Trust overview
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
