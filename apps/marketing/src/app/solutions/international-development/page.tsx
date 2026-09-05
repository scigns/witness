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
  title: 'International development — Witness',
  description:
    'Support programmes where consultation, research, partners and implementation span organisations and countries - and where the person who knows why stays for one funding cycle, not ten.',
  path: '/solutions/international-development',
});

const facts = [
  [
    'Commitments can belong to a partner, not a person',
    'A commitment names a responsible party in plain language - a partner organisation, a national ' +
      'counterpart team - not only an individual with a Witness login. Most commitments in a ' +
      'multi-partner programme belong to a role, not a person.',
  ],
  [
    'Field evidence traces through to implementation',
    'Something observed in the field links forward through findings and recommendations to the ' +
      'decision and the action it produced - across the organisations and countries a programme ' +
      'actually spans.',
  ],
  [
    'Consultants and staff turn over; the record does not',
    'Programme staff and consultants finish their contracts on schedule. What a decision rested on, ' +
      'and what was promised to a community, should not leave with them.',
  ],
  [
    'Actions carry real progress, not a status label',
    'An action records a progress note and a percent complete, and can move from in progress to ' +
      'blocked and back - implementation stalling and resuming is the normal case in a multi-country ' +
      'programme, not an exception to hide.',
  ],
  [
    'Deployment follows the programme, not one vendor',
    "A programme spanning multiple countries doesn't answer to one infrastructure policy. Witness " +
      "supports institutions with different hosting and deployment requirements, so a partner's data " +
      'stays where that partner needs it to.',
  ],
] as const;

export default function InternationalDevelopmentSolutionPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>International development</Eyebrow>
        <h1>Preserve evidence from field engagement through implementation.</h1>
        <p className="promise">
          Support programmes where consultation, research, partners and implementation span
          organisations and countries.
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
        <SectionHeading title="See what a multi-partner programme's record would look like end to end." />
        <CTAGroup aria-label="International development solution page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/decisions" variant="secondary">
            Decisions & actions
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
