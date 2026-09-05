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
  title: 'Government — Witness',
  description:
    'Connect public engagement, policy evidence and decisions into a traceable institutional record that survives an election, a restructure, or a review years later.',
  path: '/solutions/government',
});

const facts = [
  [
    'Public engagement becomes structured evidence',
    'What was said in a consultation is captured as a structured record - who said it, when, and in ' +
      'what session - not a paragraph buried in minutes someone has to re-read to find it again.',
  ],
  [
    'A policy decision has to rest on something',
    'Confirming a decision requires support: a specific piece of validated evidence, or a stated ' +
      'institutional judgement with a reason attached. A decision nobody can trace to anything is a ' +
      'preference, not a record.',
  ],
  [
    'Consent decides what can be quoted or identified',
    'Whether a contribution can be recorded, quoted or attributed in public reporting is decided per ' +
      'participant, per category, before capture - not applied afterward as a redaction pass.',
  ],
  [
    'The reasoning survives the people who leave',
    'Governments change. Officers move on. A superseded decision keeps pointing at what replaced it; ' +
      'nothing is deleted to make the record tidier for the next administration.',
  ],
] as const;

export default function GovernmentSolutionPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Government</Eyebrow>
        <h1>Make consultation and public decisions accountable.</h1>
        <p className="promise">
          Connect public engagement, policy evidence and decisions into a traceable institutional
          record.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What this looks like in practice" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See how a consultation you've already run would look, traced end to end." />
        <CTAGroup aria-label="Government solution page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/solutions/consultation" variant="secondary">
            Consultation & co-design
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
