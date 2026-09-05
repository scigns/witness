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
  title: 'Why Witness — Witness',
  description:
    'Institutions preserve outputs and lose the reasoning behind them. Witness exists because that is an infrastructure problem, not a discipline problem.',
  path: '/why-witness',
});

const causes = [
  [
    'Context gets lost',
    'Minutes record what was decided, not why, who objected, or what was weighed and set aside.',
  ],
  [
    'Consultants and staff move on',
    'The person who was in the room leaves, and the reasoning leaves with them.',
  ],
  [
    'Evidence becomes disconnected from decisions',
    'A recommendation survives; the specific things people said that produced it do not.',
  ],
  [
    'The same people get asked again',
    'When a consultation cannot be traced to what it produced, the honest response is to run it ' +
      'again - which is how communities correctly conclude that being consulted changes nothing.',
  ],
] as const;

export default function WhyWitnessPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Why Witness</Eyebrow>
        <h1>Institutions remember what they decided. Fewer can show exactly why.</h1>
        <p className="promise">
          This is not a failure of discipline. It is a failure of infrastructure - the same way a
          payment without a ledger is not a discipline problem either.
        </p>
      </div>

      <Section id="problem" className="homepage-section">
        <SectionHeading
          eyebrow="The pattern"
          title="Institutional evidence fragments across meetings, documents, surveys and memory."
        />
        <div className="feature-grid audience-grid">
          {causes.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="belief" className="homepage-section">
        <SectionHeading eyebrow="What we believe" title="Provenance is the product.">
          <p>
            A claim you cannot trace is a rumour. Institutional memory without an evidence chain is
            worse than none, because it is confidently wrong. Witness treats memory the way identity
            and payments are treated - as infrastructure, not a feature one vendor rents back to
            you.
          </p>
        </SectionHeading>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See what this looks like against a decision you already made." />
        <CTAGroup aria-label="Why Witness page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/how-it-works" variant="secondary">
            How Witness works
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
